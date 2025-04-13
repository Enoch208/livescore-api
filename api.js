const puppeteer = require('puppeteer');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');


const app = express();
const PORT = process.env.PORT || 3000;


app.use(cors());
app.use(express.json());


let cachedData = null;
let lastFetchTime = null;
const CACHE_DURATION = 6 * 1000; 

// Match details cache
const matchDetailsCache = new Map();
const MATCH_DETAILS_CACHE_DURATION = 6 * 1000; 


app.get('/', (req, res) => {
  res.json({
    message: 'Live Football API',
    endpoints: [
      {
        path: '/api/matches',
        description: 'Get live football matches data',
        parameters: {
          refresh: 'Set to "true" to force refresh the data (optional)'
        }
      },
      {
        path: '/api/matches/details/:id',
        description: 'Get detailed information for a specific match',
        parameters: {
          id: 'Match ID (required)'
        }
      }
    ]
  });
});


app.get('/api/matches', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const currentTime = new Date().getTime();
    
    
    if (
      !forceRefresh && 
      cachedData && 
      lastFetchTime && 
      (currentTime - lastFetchTime) < CACHE_DURATION
    ) {
      console.log('Returning cached data');
      return res.json(cachedData);
    }
    
  
    console.log('Fetching fresh data...');
    const matchesData = await scrapeMatches();
    
  
    cachedData = {
      timestamp: new Date().toISOString(),
      source: 'azscore.ng/live',
      matches: matchesData
    };
    lastFetchTime = currentTime;
    
  
    res.json(cachedData);
    
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch matches data',
      message: error.message
    });
  }
});


app.get('/api/matches/details/:id', async (req, res) => {
  try {
    const matchId = req.query.id || req.params.id;
    
    if (!matchId) {
      return res.status(400).json({ error: 'Match ID is required' });
    }
   
    const currentTime = new Date().getTime();
    const cachedDetails = matchDetailsCache.get(matchId);
    
    if (
      cachedDetails && 
      (currentTime - cachedDetails.timestamp) < MATCH_DETAILS_CACHE_DURATION
    ) {
      console.log(`Returning cached details for match ${matchId}`);
      return res.json(cachedDetails.data);
    }
    
    
    let matchLink = null;
    
    if (cachedData && cachedData.matches) {
      const match = cachedData.matches.find(m => m.match.id === matchId);
      if (match && match.match.link) {
        matchLink = match.match.link;
      }
    }
    
   
    if (!matchLink) {
      console.log('Match not found in cache, fetching all matches...');
      const matchesData = await scrapeMatches();
      const match = matchesData.find(m => m.match.id === matchId);
      
      if (match && match.match.link) {
        matchLink = match.match.link;
      } else {
        return res.status(404).json({ error: 'Match not found' });
      }
    }
    
    // Using the link to scrape, like the link from the match list
    console.log(`Scraping details for match ${matchId} from ${matchLink}`);
    const matchDetails = await scrapeMatchDetails(matchLink);
    
    
    matchDetailsCache.set(matchId, {
      timestamp: currentTime,
      data: matchDetails
    });
    

    res.json(matchDetails);
    
  } catch (error) {
    console.error('Match details error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch match details',
      message: error.message
    });
  }
});


app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});


async function scrapeMatches() {
  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
      ],
      defaultViewport: {
        width: 1920,
        height: 1080,
      }
    });

    const page = await browser.newPage();
    
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36');
    
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    });

   
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (resourceType === 'image' || resourceType === 'font' || resourceType === 'media') {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setJavaScriptEnabled(true);
    
    await page.goto('https://azscore.ng/live', { 
      waitUntil: 'domcontentloaded', 
      timeout: 30000 
    });

    await new Promise(resolve => setTimeout(resolve, 3000)); 


    const matchesData = await page.evaluate(() => {
      const matches = [];
      
    
      const matchElements = document.querySelectorAll('div[data-game-id]');
      
      matchElements.forEach(matchElement => {
        try {
          
          let leagueElement = matchElement.closest('section.games');
          let countryElement = leagueElement ? leagueElement.querySelector('a.games-cat') : null;
          let country = countryElement ? countryElement.textContent.trim() : 'Unknown';
        
          const leagueNameElement = leagueElement ? leagueElement.querySelector('a.games-slug') : null;
          let leagueName = leagueNameElement ? leagueNameElement.textContent.trim() : 'Unknown';
          
       
          const gameInfoElement = matchElement.querySelector('.game-info');
          let matchTime = '';
          let matchStatus = '';
          
        
          const liveTimeElement = gameInfoElement ? gameInfoElement.querySelector('.match-status__minutes, .status') : null;
          if (liveTimeElement && liveTimeElement.textContent.trim()) {
            matchTime = liveTimeElement.textContent.trim();
            
          
            if (liveTimeElement.classList.contains('color--blue')) {
              matchStatus = 'HalfTime';
            } else if (liveTimeElement.classList.contains('color--red')) {
              matchStatus = 'Live';
              if (!matchTime.includes("'")) {
                matchTime += "'";
              }
            } else if (liveTimeElement.classList.contains('color--green')) {
              matchStatus = 'Finished';
            } else {
              matchStatus = 'Unknown';
            }
          } else {
           
            const scheduledTimeElement = gameInfoElement ? gameInfoElement.querySelector('.t') : null;
            matchTime = scheduledTimeElement ? scheduledTimeElement.textContent.trim() : 'TBD';
            matchStatus = 'Scheduled';
          }
          
          
          const homeTeamElement = matchElement.querySelector('span[data-host-id] .team-name, .avatar[data-team-names] .title');
          const awayTeamElement = matchElement.querySelector('span[data-guest-id] .team-name, .avatar:not([data-team-names]) .title');
          
          const homeTeam = homeTeamElement ? homeTeamElement.textContent.trim() : '';
          const awayTeam = awayTeamElement ? awayTeamElement.textContent.trim() : '';
          
        
          const homeScoreElement = matchElement.querySelector('.team-score-item.count[data-host-id], .counter .count:first-child');
          const awayScoreElement = matchElement.querySelector('.team-score-item.count[data-guest-id], .counter .count:last-child');
          
          const homeScore = homeScoreElement ? homeScoreElement.textContent.trim() : '0';
          const awayScore = awayScoreElement ? awayScoreElement.textContent.trim() : '0';
          
          
          const matchLinkElement = matchElement.closest('a[href*="/football/game/"]');
          const matchLink = matchLinkElement ? matchLinkElement.getAttribute('href') : '';
          
          
          const gameId = matchElement.getAttribute('data-game-id') || '';
          
          
          const hasLivestream = !!matchElement.querySelector('.livestream-icon');
          
        
          const homeFormElements = matchElement.querySelectorAll('.avatar[data-team-names] .bullets .bullet, span[data-host-id] .bullets .bullet');
          const awayFormElements = matchElement.querySelectorAll('.avatar:not([data-team-names]) .bullets .bullet, span[data-guest-id] .bullets .bullet');
          
          const homeForm = Array.from(homeFormElements).map(bullet => {
            if (bullet.classList.contains('color--green')) return 'W';
            if (bullet.classList.contains('color--red')) return 'L';
            if (bullet.classList.contains('color--yellow')) return 'D';
            return 'U'; 
          });
          
          const awayForm = Array.from(awayFormElements).map(bullet => {
            if (bullet.classList.contains('color--green')) return 'W';
            if (bullet.classList.contains('color--red')) return 'L';
            if (bullet.classList.contains('color--yellow')) return 'D';
            return 'U'; 
          });
          
  
          const homeScorers = [];
          const awayScorers = [];
          
          const homePlayerElements = matchElement.querySelectorAll('.avatar[data-team-names] .player, span[data-host-id] .player');
          const awayPlayerElements = matchElement.querySelectorAll('.avatar:not([data-team-names]) .player, span[data-guest-id] .player');
          
          homePlayerElements.forEach(playerElement => {
            const nameElement = playerElement.querySelector('a');
            const timeElement = playerElement.querySelector('span span:last-child');
            
            const player = nameElement ? nameElement.textContent.trim() : '';
            const eventTime = timeElement ? timeElement.textContent.trim() : '';
            
            if (player && eventTime) {
              homeScorers.push({
                name: player,
                time: eventTime
              });
            }
          });
          
          awayPlayerElements.forEach(playerElement => {
            const nameElement = playerElement.querySelector('a');
            const timeElement = playerElement.querySelector('span span:last-child');
            
            const player = nameElement ? nameElement.textContent.trim() : '';
            const eventTime = timeElement ? timeElement.textContent.trim() : '';
            
            if (player && eventTime) {
              awayScorers.push({
                name: player,
                time: eventTime
              });
            }
          });
          
          // Get round if available
          const roundElement = matchElement.querySelector('.match-info .row .text div');
          const round = roundElement ? roundElement.textContent.trim() : '';
          
          matches.push({
            league: {
              country: country,
              name: leagueName
            },
            match: {
              id: gameId,
              time: matchTime,
              status: matchStatus,
              round: round,
              homeTeam: homeTeam,
              awayTeam: awayTeam,
              score: {
                home: homeScore,
                away: awayScore,
                full: `${homeScore}-${awayScore}`
              },
              hasLivestream: hasLivestream,
              link: matchLink ? `https://azscore.ng${matchLink.replace('/game/', '/stats/')}` : ''
            }
          });
        } catch (error) {
          console.log('Error parsing match:', error);
        }
      });
      
      return matches;
    });
    
    return matchesData;
  } catch (error) {
    console.error('Scraping error:', error);
    throw error;
  } finally {
    // Ensure browser is always closed, even if an error occurs
    if (browser) {
      await browser.close();
      console.log('Browser closed successfully');
    }
  }
}


async function scrapeMatchDetails(matchUrl) {
  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
      ],
      defaultViewport: {
        width: 1920,
        height: 1080,
      }
    });

    const page = await browser.newPage();
   
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36');
    
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    });

    
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (resourceType === 'image' || resourceType === 'font' || resourceType === 'media') {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setJavaScriptEnabled(true);
    
    await page.goto(matchUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

   
    const matchDetails = await page.evaluate(() => {
      try {
       
        const homeTeamElement = document.querySelector('.avatar[data-team-names] .title');
        const awayTeamElement = document.querySelector('.avatar:not([data-team-names]) .title');
        const homeScoreElement = document.querySelector('.counter .count:first-child');
        const awayScoreElement = document.querySelector('.counter .count:last-child');
        const timeElement = document.querySelector('.status');
        
        const homeTeam = homeTeamElement ? homeTeamElement.textContent.trim() : '';
        const awayTeam = awayTeamElement ? awayTeamElement.textContent.trim() : '';
        const homeScore = homeScoreElement ? homeScoreElement.textContent.trim() : '0';
        const awayScore = awayScoreElement ? awayScoreElement.textContent.trim() : '0';
        const matchTime = timeElement ? timeElement.textContent.trim() : '';
        const matchStatus = timeElement && timeElement.classList.contains('color--blue') ? 'HalfTime' : 
                            timeElement && timeElement.classList.contains('color--red') ? 'Live' : 
                            timeElement && timeElement.classList.contains('color--green') ? 'Finished' : 'Unknown';
        
        
        const matchInfoElements = document.querySelectorAll('.match-info .row .text');
        const matchDate = matchInfoElements[0] ? matchInfoElements[0].textContent.trim() : '';
        const scheduledTime = matchInfoElements[1] ? matchInfoElements[1].textContent.trim() : '';
        const roundElement = document.querySelector('.match-info .row .text div');
        const round = roundElement ? roundElement.textContent.trim() : '';
        
       
        const venueElement = document.querySelector('.match-venue');
        const venue = venueElement ? venueElement.textContent.trim() : '';
        
        
        const homeFormElements = document.querySelectorAll('.avatar[data-team-names] .bullets .bullet');
        const awayFormElements = document.querySelectorAll('.avatar:not([data-team-names]) .bullets .bullet');
        
        const homeForm = Array.from(homeFormElements).map(bullet => {
          if (bullet.classList.contains('color--green')) return 'W';
          if (bullet.classList.contains('color--red')) return 'L';
          if (bullet.classList.contains('color--yellow')) return 'D';
          return 'U'; 
        });
        
        const awayForm = Array.from(awayFormElements).map(bullet => {
          if (bullet.classList.contains('color--green')) return 'W';
          if (bullet.classList.contains('color--red')) return 'L';
          if (bullet.classList.contains('color--yellow')) return 'D';
          return 'U'; 
        });
        
       
        const events = [];
        
     
        const homePlayerElements = document.querySelectorAll('.avatar[data-team-names] .player');
        const awayPlayerElements = document.querySelectorAll('.avatar:not([data-team-names]) .player');
        
        homePlayerElements.forEach(playerElement => {
          const nameElement = playerElement.querySelector('a');
          const timeElement = playerElement.querySelector('span span:last-child');
          
          const player = nameElement ? nameElement.textContent.trim() : '';
          const eventTime = timeElement ? timeElement.textContent.trim() : '';
          
          if (player && eventTime) {
            events.push({
              time: eventTime,
              type: 'goal',
              player: player,
              team: homeTeam
            });
          }
        });
        
        awayPlayerElements.forEach(playerElement => {
          const nameElement = playerElement.querySelector('a');
          const timeElement = playerElement.querySelector('span span:last-child');
          
          const player = nameElement ? nameElement.textContent.trim() : '';
          const eventTime = timeElement ? timeElement.textContent.trim() : '';
          
          if (player && eventTime) {
            events.push({
              time: eventTime,
              type: 'goal',
              player: player,
              team: awayTeam
            });
          }
        });
        
       
        const stats = [];
        const statElements = document.querySelectorAll('.stat__row');
        
        statElements.forEach(statElement => {
          const nameElement = statElement.querySelector('.stat__title');
          const homeValueElement = statElement.querySelector('.stat__score:first-child');
          const awayValueElement = statElement.querySelector('.stat__score:last-child');
          
          const statName = nameElement ? nameElement.textContent.trim() : '';
          const homeValue = homeValueElement ? homeValueElement.textContent.trim() : '0';
          const awayValue = awayValueElement ? awayValueElement.textContent.trim() : '0';
          
          if (statName) {
            stats.push({
              name: statName,
              home: homeValue,
              away: awayValue
            });
          }
        });
        
      
        const homeLineup = [];
        const awayLineup = [];
        
      
        const homeLineupElements = document.querySelectorAll('.lineup-h .lineup-player');
        const awayLineupElements = document.querySelectorAll('.lineup-a .lineup-player');
        
        homeLineupElements.forEach(playerElement => {
          const nameElement = playerElement.querySelector('.lineup-player-name');
          const numberElement = playerElement.querySelector('.lineup-player-number');
          
          const playerName = nameElement ? nameElement.textContent.trim() : '';
          const playerNumber = numberElement ? numberElement.textContent.trim() : '';
          
          if (playerName) {
            homeLineup.push({
              name: playerName,
              number: playerNumber
            });
          }
        });
        
        awayLineupElements.forEach(playerElement => {
          const nameElement = playerElement.querySelector('.lineup-player-name');
          const numberElement = playerElement.querySelector('.lineup-player-number');
          
          const playerName = nameElement ? nameElement.textContent.trim() : '';
          const playerNumber = numberElement ? numberElement.textContent.trim() : '';
          
          if (playerName) {
            awayLineup.push({
              name: playerName,
              number: playerNumber
            });
          }
        });
        
       //Check for match odds 
        const odds = [];
        const oddsElements = document.querySelectorAll('.b-odds__row');
        
        oddsElements.forEach(oddElement => {
          const bookmakerElement = oddElement.querySelector('.b-odds__img img');
          const homeOddElement = oddElement.querySelector('.odd-1');
          const drawOddElement = oddElement.querySelector('.odd-2');
          const awayOddElement = oddElement.querySelector('.odd-3');
          
          const bookmaker = bookmakerElement ? bookmakerElement.getAttribute('alt') : '';
          const homeOdd = homeOddElement ? homeOddElement.textContent.trim() : '';
          const drawOdd = drawOddElement ? drawOddElement.textContent.trim() : '';
          const awayOdd = awayOddElement ? awayOddElement.textContent.trim() : '';
          
          if (bookmaker) {
            odds.push({
              bookmaker: bookmaker,
              odds: {
                home: homeOdd,
                draw: drawOdd,
                away: awayOdd
              }
            });
          }
        });
        
        return {
          matchInfo: {
            date: matchDate,
            scheduledTime: scheduledTime,
            round: round
          },
          match: {
            status: matchStatus,
            time: matchTime,
            teams: {
              home: {
                name: homeTeam,
                score: homeScore,
                form: homeForm
              },
              away: {
                name: awayTeam,
                score: awayScore,
                form: awayForm
              }
            },
            venue: venue,
            score: {
              full: `${homeScore}-${awayScore}`
            }
          },
          statistics: stats,
          events: events,
          lineups: {
            home: homeLineup,
            away: awayLineup
          },
          odds: odds
        };
      } catch (error) {
        console.error('Error parsing match details:', error);
        return {
          error: 'Failed to parse match details',
          message: error.message
        };
      }
    });
    
    return {
      timestamp: new Date().toISOString(),
      source: matchUrl,
      details: matchDetails
    };
  } catch (error) {
    console.error('Match details scraping error:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed successfully');
    }
  }
}
