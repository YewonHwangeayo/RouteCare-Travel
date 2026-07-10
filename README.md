# RouteCare Travel MCP Server

RouteCare Travel is a remote MCP server for feasible travel route planning. It recommends visit order and timing with outdoor/transit route estimates, crowd risk, accessibility metadata, and traveler constraints.

The MVP intentionally does not implement indoor 3D navigation. Large hub indoor graph routing is left for a later provider implementation.

## Tools

- `plan_trip_route`
- `analyze_place_risk`
- `optimize_with_constraints`
- `suggest_alternatives`
- `render_map_payload`

All tools use compact JSON text results. Tool errors are returned as readable Markdown text.

## Requirements

- Node.js 20+
- npm

## Local Run

```bash
npm install
npm run dev
```

The server listens on port `8080` by default.

```text
GET  http://localhost:8080/
POST http://localhost:8080/mcp
GET  http://localhost:8080/health
```

Opening `/` in a browser shows a small JSON status page. The actual MCP endpoint is `/mcp` and should be called by an MCP client over Streamable HTTP.

If port `8080` is already in use, either stop the existing process or run this server on another port:

```bash
PORT=8081 npm run dev
```

To see which process is using port `8080` on macOS:

```bash
lsof -nP -iTCP:8080 -sTCP:LISTEN
```

## Build and Production Run

```bash
npm run build
npm start
```

## Environment

Copy `.env.example` to `.env` when running locally.

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8080` | HTTP server port |
| `NODE_ENV` | `development` | Runtime environment |
| `LOG_LEVEL` | `info` | Reserved for production logging policy |
| `PROVIDER_MODE` | `mock` | Use `mock` or `real` |
| `TOUR_API_SERVICE_KEY` | empty | Korea Tourism Organization TourAPI key for nearby alternative places |
| `SEOUL_OPEN_API_KEY` | empty | Seoul Open Data key for realtime city crowd data |
| `OSRM_BASE_URL` | `https://router.project-osrm.org` | OSRM-compatible routing API base URL |
| `ACCESSIBILITY_API_URL` | empty | Optional custom accessibility aggregator endpoint |

When `PROVIDER_MODE=real`, each provider calls a real API if the required key or URL is present. If a key is missing or an external API fails, the server falls back to the mock provider for that part so tool calls still work.

Current real provider mapping:

- Crowd: Seoul Open Data realtime city data API.
- Alternative places: Korea Tourism Organization TourAPI `locationBasedList2`.
- Routing: OSRM-compatible route API when coordinates are provided.
- Accessibility: optional custom aggregator URL, otherwise metadata-based fallback.

Example:

```bash
PROVIDER_MODE=real \
SEOUL_OPEN_API_KEY=your-seoul-key \
TOUR_API_SERVICE_KEY=your-tourapi-key \
PORT=8081 npm run dev
```

## Docker

```bash
docker build -t routecare-travel-mcp .
docker run --rm -p 8080:8080 --env-file .env routecare-travel-mcp
```

## Deployment

This project can be deployed to PlayMCP in KC either from Git source or as a container image.

Git source deployment:

1. Install dependencies with `npm install`.
2. Build with `npm run build`.
3. Start with `npm start`.
4. Expose `POST /mcp` over HTTPS.

Container deployment:

1. Build the included `Dockerfile`.
2. Run the image with `PORT=8080`.
3. Expose container port `8080`.

## Provider Layer

The current MVP ships with mock providers:

- crowd provider
- routing provider
- accessibility provider
- places provider

They are defined behind interfaces in `src/services/providers.ts`, so real APIs can replace the mock implementations without changing tool contracts.

## Example Tool Input

```json
{
  "origin": { "name": "Seoul Station", "category": "station" },
  "stops": [
    { "name": "Seongsu Olive Young", "category": "store", "desired_time": "14:00" },
    { "name": "Seoul Forest", "category": "park" }
  ],
  "travel_date": "2026-07-20",
  "time_window": { "start": "10:00", "end": "18:00" },
  "constraints": {
    "with_luggage": true,
    "avoid_stairs": true,
    "panic_sensitive": true
  },
  "preferences": ["least_crowded", "accessibility_first"]
}
```
