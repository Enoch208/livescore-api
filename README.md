# Football Live Score API

A Node.js API that provides real-time football match data by scraping live scores from azscore.ng.

## Features

- ⚽ Live football match scores and details
- 📊 Match statistics and lineups
- 🔄 Automatic data caching for improved performance
- 📱 RESTful API endpoints for easy integration

## Installation

```bash
# Clone the repository
git clone https://github.com/Enoch208/livescore-api.git

# Install dependencies
npm install 
```

## Required Dependencies

Make sure you have the following dependencies installed:

```bash
npm install express puppeteer cors
```

## Usage

Start the server:

```bash
node api.js
```

The server will run on port 3000 by default. You can change the port by setting the `PORT` environment variable.

## API Endpoints

### Get All Live Matches

```
GET /api/matches
```

**Query Parameters:**
- `refresh` (optional): Set to `true` to force refresh the data

**Example Response:**
```json
{
  "timestamp": "2023-04-28T12:34:56.789Z",
  "source": "azscore.ng/live",
  "matches": [
    {
      "league": {
        "country": "England",
        "name": "Premier League"
      },
      "match": {
        "id": "123456",
        "time": "45'",
        "status": "Live",
        "homeTeam": "Manchester United",
        "awayTeam": "Liverpool",
        "score": {
          "home": "2",
          "away": "1",
          "full": "2-1"
        },
        "hasLivestream": true,
        "link": "https://azscore.ng/football/stats/123456"
      },
      "teams": {
        "home": {
          "form": ["W", "W", "D", "L", "W"],
          "scorers": [
            { "name": "Bruno Fernandes", "time": "23'" },
            { "name": "Marcus Rashford", "time": "36'" }
          ]
        },
        "away": {
          "form": ["W", "D", "W", "W", "L"],
          "scorers": [
            { "name": "Mohamed Salah", "time": "42'" }
          ]
        }
      }
    }
  ]
}
```

### Get Match Details

```
GET /api/matches/details/:id
```

**Path Parameters:**
- `id` (required): Match ID

**Example Response:**
```json
{
  "timestamp": "2023-04-28T12:45:56.789Z",
  "source": "https://azscore.ng/football/stats/123456",
  "details": {
    "matchInfo": {
      "date": "April 28, 2023",
      "scheduledTime": "12:30",
      "round": "Matchday 38"
    },
    "match": {
      "status": "Live",
      "time": "45'",
      "teams": {
        "home": {
          "name": "Manchester United",
          "score": "2",
          "form": ["W", "W", "D", "L", "W"]
        },
        "away": {
          "name": "Liverpool",
          "score": "1",
          "form": ["W", "D", "W", "W", "L"]
        }
      },
      "venue": "Old Trafford",
      "score": {
        "full": "2-1"
      }
    },
    "statistics": [
      {
        "name": "Possession",
        "home": "48%",
        "away": "52%"
      },
      {
        "name": "Shots",
        "home": "8",
        "away": "6"
      }
    ],
    "events": [
      {
        "time": "23'",
        "type": "goal",
        "player": "Bruno Fernandes",
        "team": "Manchester United"
      },
      {
        "time": "36'",
        "type": "goal",
        "player": "Marcus Rashford",
        "team": "Manchester United"
      },
      {
        "time": "42'",
        "type": "goal",
        "player": "Mohamed Salah",
        "team": "Liverpool"
      }
    ],
    "lineups": {
      "home": [
        {
          "name": "David de Gea",
          "number": "1"
        }
      ],
      "away": [
        {
          "name": "Alisson",
          "number": "1"
        }
      ]
    },
    "odds": [
      {
        "bookmaker": "Bet365",
        "odds": {
          "home": "2.30",
          "draw": "3.40",
          "away": "2.80"
        }
      }
    ]
  }
}
```

## Caching Behavior

The API implements caching to minimize redundant scraping operations:

- Match lists are cached for 6 seconds
- Match details are cached for 6 seconds

## Configuration

You can modify the following constants in the code to adjust the API behavior:

- `PORT`: Default is 3000
- `CACHE_DURATION`: Cache duration for match list (in milliseconds)
- `MATCH_DETAILS_CACHE_DURATION`: Cache duration for match details (in milliseconds)

## License

[MIT](LICENSE) 