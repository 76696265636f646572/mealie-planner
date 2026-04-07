# mealie-planner

Small Node.js script that fills missing meal-plan slots in [Mealie](https://github.com/mealie-recipes/mealie) for the **upcoming week**.

It fetches meal plans for the next 7 days (today → today+6) and, for each day, ensures there is a recipe set for:

- **dinner**
- **lunch**
- **breakfast**

Missing slots are filled using Mealie’s built-in random meal picker (`/api/households/mealplans/random`), so your household rules apply.

## How ordering works (important)

API creation calls run in this **global** order (date ascending within each group):

1. All missing **dinners** for the range
2. Then all missing **lunches** for the range
3. Then all missing **breakfasts** for the range

This is intentional and covered by unit tests in `test/planner.test.js`.

## Requirements

- Node **24+**
- A Mealie long-lived API token

## Configuration

Create `src/.env` (or copy from `.env.example`) with:

```env
MEALIE_BASE_URL=https://mealie.example.com
MEALIE_API_TOKEN=your_long_lived_token_here
```

Notes:
- `MEALIE_BASE_URL` can be either `https://host` **or** `https://host/api` (the code normalizes it).
- Keep `src/.env` secret (it is gitignored).

### Configurable week / date range

By default the planner runs for **7 days**: today → today+6.

You can override the range with these env vars:

```env
# optional (default: today)
PLANNER_START_DATE=2026-04-07

# optional (default: 7). The range is start → start+(days-1)
PLANNER_DAYS=7

# optional. If set, overrides PLANNER_DAYS
PLANNER_END_DATE=2026-04-13
```

## Run locally

```bash
npm ci
npm start
```

Output is JSON describing the date range and any slots that were created.

## Run tests

```bash
npm test
```

## Run with Docker

Build and run:

```bash
docker build -t mealie-planner .
docker run --rm --env-file ./src/.env mealie-planner
```

## Run with docker compose

```bash
docker compose run --rm mealie-planner
```

`docker-compose.yml` loads env from `./src/.env`.

## GitHub Actions

- **CI** (`.github/workflows/ci.yml`): runs tests on PRs and pushes using Node 24.
- **Docker image** (`.github/workflows/docker-image.yml`): builds and pushes a multi-arch image to GHCR:
  - `ghcr.io/<owner>/<repo>:latest` (default branch)
  - `ghcr.io/<owner>/<repo>:sha-...`
  - `ghcr.io/<owner>/<repo>:vX.Y.Z` (on `v*` tags)

