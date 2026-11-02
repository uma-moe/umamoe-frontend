# Local stack

## Setup

Clone the service repositories beside `umamoe-frontend`, under their GitHub names:

```sh
git clone https://github.com/uma-moe/umamoe-resources.git
git clone https://github.com/uma-moe/umamoe-simulator.git   # private
# Only for the full app (--app):
git clone https://github.com/uma-moe/umamoe-backend.git
git clone https://github.com/uma-moe/umamoe-search.git      # private
git clone https://github.com/uma-moe/umamoe-ingest.git
```

Building the stack needs read access to the two private repositories. You also need Docker
Desktop (or Docker Engine with Compose), and on Windows Git Bash, which brings `sh` and OpenSSL.

## One command (Windows, macOS, Linux)

```sh
npm run dev:local
```

This creates `.env.stack.local` and the local simulator key when they are missing, rebuilds
whatever changed in the sibling repositories, starts the whole stack (resources, simulator,
backend, search, ingest, Postgres and Redis) and waits until it is healthy. Because it starts the
full app, it needs all five repositories; the database starts with the backend's demo data (see
[Full app](#full-app)). It then runs Vite on
this machine at http://127.0.0.1:5173, pointed at that stack, so edits show up instantly.
`.env.development.local` is left untouched; the stack addresses and key only apply to this run.

Ctrl+C stops Vite and leaves the stack running, so the next start is quick. Other commands:
`npm run dev:local -- down` (stop the stack, keep its data), `npm run dev:local -- logs`,
`npm run dev:local -- ps`. Arguments after `--` that start with `-` go to Vite, for example
`npm run dev:local -- --port 5180`.

Vite deliberately runs outside Docker here: Docker Desktop reads Windows folders slowly and does
not pass file changes into containers, so the containerised frontend below is slow or out of date
on Windows. It remains available through `local.sh --app`.

Run from Git Bash, WSL, Linux or macOS with Docker Engine/Desktop, Docker Compose
and OpenSSL installed. Keep the service repositories beside `umamoe-frontend`.

```sh
sh local.sh
```

This builds **umamoe-resources** and **umamoe-simulator**, generates the game
resources locally, starts the simulator after resources become healthy, and waits
for readiness. The first start needs internet access to verify/download the game
master. Resource exports and the simulator cache persist in separate Docker volumes.
The simulator uses four workers/four CPUs by default; adjust `.env.stack.local`.

| Service | Default local address |
| --- | --- |
| Resources | http://127.0.0.1:3304/resources/manifest.json |
| Simulator | http://127.0.0.1:3309/sim/ |
| Frontend (`--app`) | http://127.0.0.1:5275/simulator/race |
| Backend (`--app`) | http://127.0.0.1:3301/api/health |
| Search (`--app`) | http://127.0.0.1:3302/search/health |
| Ingest (`--app`) | http://127.0.0.1:3303/health |

## A simulator without Docker

To try a simulator build directly (the V5 optimizer, the Skill Explorer files), run it natively and point Vite at it.
`VITE_SIMULATOR_TARGET` sends `/api/sim/...` straight to the simulator's `/sim/...`, with no backend in between:

```sh
VITE_RESOURCE_PROXY_TARGET=https://uma.moe VITE_SIMULATOR_TARGET=http://127.0.0.1:3410 npm run dev -- --port 5200
```

The simulator needs its V5 model in `conf/` under its working directory (`UMAMOE_V5_MODEL`, `UMAMOE_V5_RANKER`) and
serves the explorer bundle named by `UMAMOE_V3_SKILL_EXPLORER`; see the simulator's `deploy/README.md`.

## Full app

Also check out **umamoe-backend**, **umamoe-search**, and **umamoe-ingest** beside this
repository, then run:

```sh
sh local.sh --app
```

On its first startup Postgres imports the backend's demo database,
`../umamoe-backend/dev/demo-database.sql`, into this stack's own database volume: the schema plus
100 synthetic, linked trainers, circles, users and API keys (demo trainer `900000000001`).
Backend migrations then run on that copy. To use a real snapshot instead, export plain SQL with
`pg_dump --no-owner --no-acl` and set `LOCAL_DATABASE_DUMP` in `.env.stack.local` to that file.
Either file is imported only while the Postgres volume is empty; to switch, stop the stack and
remove this project's `postgres-data` volume. The startup service registers
a generated local simulator API key; the Vite proxy reads it from a Docker secret.
The key stays out of browser assets. The frontend runs Vite with live source
updates; dependencies stay in a Docker volume. Refresh that volume after changing
`package-lock.json` using `docker compose --env-file .env.stack.local -f
compose.local.yaml --profile app down`, then remove only this project's
`frontend-dependencies` volume and rebuild.

The stack has its own project name, network, volumes and loopback ports. Existing
dev servers, development settings and host databases are left untouched. Docker
proxy settings override the host service addresses. OAuth providers are not
configured by this launcher; game artwork
and the frontend's existing `/assets/data` fallback still use their normal URLs.

## Commands

```sh
sh local.sh config        # Validate without building or starting containers
sh local.sh build         # Build images
sh local.sh logs          # Follow logs
sh local.sh ps            # Check readiness
sh local.sh down          # Stop; keep generated data and database volumes
```

Add `--app` before the command for the full stack, including when stopping it.
`local.sh` copies the example environment file on first use. Subsequent runs reuse
your settings and generated key. It never deletes data volumes. The database SQL
file is only imported when the Postgres volume is empty.
Keep the SQL file available on subsequent starts because it remains mounted.

Check the launcher's command handling without starting Docker:

```sh
sh tests/local-stack.sh
```
