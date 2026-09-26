# Hakuraku content snapshot

Source: https://github.com/ayaliz/hakuraku
Revision: a185e154a16bc18a9b106e1eb22e86b67f5d2c57
Imported: 2026-09-21
License: MIT (see LICENSE in this directory).

`notes/` preserves the published research Markdown, manifest, and attachments.
`umdb.json.gz` is a gzip-compressed copy of `public/data/umdb.json`: an exported
game catalog subset, not a complete or continuously updated master database.
The Master Data browser builds its local SQLite tables from this catalog and
also accepts complete user-supplied SQLite databases.

CM Data reads the public, CORS-enabled `https://hakuraku.moe/api/simdata` GET
endpoints for manifests, summaries, teams, distributions, character contexts,
and skill data. Charts retain Hakuraku's metrics and reference baselines.
Uma labels, skill names and icons, support cards, and parent sparks use the
shared uma.moe resource catalogs and display components. Original source labels
remain valid in team queries, and are used as fallbacks for missing catalog entries.
The SimData types and query parser are adapted from the revision above.
Lobby simulation is not connected; the frontend makes no simulation requests
and does not invent replays for captured teams.

`courses.json.gz` contains course geometry, track names, and map points extracted
from the same revision's `public/data/gamedata.bin.gz` for the replay view.
Race Analysis's explicitly labelled demo uploads still use deterministic
synthetic fixtures in `src/pages/competitive/demo-races.ts`. Local race uploads
use the existing capture parser and recorded distance/lane coordinates.

`tests/e2e/fixtures/hakuraku-cm.json.gz` records public CM20 responses fetched
2026-09-21, with the team list reduced to its first 15 rows for UI regression
tests. It is not used as a replacement for the full dataset in the application.

For a local preview without the resource service on port 3004, set
`VITE_RESOURCE_PROXY_TARGET=https://uma.moe` when starting Vite. The frontend
still uses the same `/resources` manifest and catalog loaders.
