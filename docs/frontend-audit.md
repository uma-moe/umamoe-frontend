# Frontend performance and maintainability audit

Audit branch: `codex/frontend-audit`  
Baseline: local `beta` commit `bc0e661`  
Worktree: `C:\tmp\umamoe-frontend-audit`  
Deterministic environment: Angular `audit` configuration, same-origin data fallbacks, API fixtures, and analytics/advertising/Turnstile disabled  
Production comparison targets: [uma.moe](https://uma.moe/) and [beta.uma.moe](https://beta.uma.moe/)

## Outcome

The reported mobile delay was distributed across startup ownership rather than caused by one request. The root shell eagerly initialized game data and conditional integrations, a 1.72 MB skills fallback was compiled as JavaScript, the full Material color surface was global, and chart/export/editor dependencies leaked into large route closures.

This branch moves data and optional integrations to feature/action time, centralizes lazy Chart.js registration, defers offscreen and conditional UI, self-hosts Material Icons, reduces global Material CSS, and adds repeatable browser, bundle, duplicate, and Lighthouse tooling. URLs, API shapes, authentication, persisted planner/filter formats, ads, analytics, tours, and Cloudflare behavior were not intentionally changed.

## Measured bundle result

Bundle values below are raw emitted JavaScript/CSS and locally calculated Brotli bytes. Static assets are reported separately.

| Measurement | Baseline | Final | Change | Gate |
| --- | ---: | ---: | ---: | ---: |
| Initial bundle raw | 1,320,053 B | 891,649 B | -32.5% | <= 1,000,000 B |
| Initial bundle Brotli | 272,216 B | 199,963 B | -26.5% | <= 200,000 B |
| Initial files | 28 | 20 | -28.6% | <= 20 |
| Global CSS | 252,032 B | 165,495 B | -34.3% | <= 175,000 B |
| Home route | 35,365 B | 17,202 B | -51.4% | <= 25,000 B |
| Database route | 1,574,957 B | 1,120,225 B | -28.9% | <= 1,150,000 B |
| Timeline route | 986,966 B | 720,151 B | -27.0% | <= 750,000 B |
| Statistics route | 2,648,752 B | 585,418 B | -77.9% | <= 1,500,000 B |
| Lineage planner route | 2,760,690 B | 954,969 B | -65.4% | <= 1,500,000 B |

Every configured route budget passes. Other measured closures also improved: circles 196,073 B, circle details 527,555 B, rankings 200,374 B, activity 399,053 B, tierlist 371,130 B, profile 547,084 B, and veterans 691,190 B.

The local Material Icons font is one 128,352 B WOFF2 request and uses `font-display: swap`. It is recorded as an initial static asset rather than executable/style bundle bytes. The Google Fonts stylesheet, DNS connection, and cross-origin font request were removed.

Machine-readable evidence is generated at `reports/frontend-audit/bundle-report.json`.

## Startup and ownership changes

- The root shell keeps navigation, outlet, footer, deferred ad layout/seasonal UI, and verification recovery UI. Update notifications, analytics, tours, rate-limit UI, version dialogs, home dialogs, and privacy controls are dynamically imported or scheduled after first render.
- Root-wide master-data initialization was removed. Character, support-card, factor, statistics, and skill services invoke idempotent feature-owned initialization.
- Home, login, privacy, and tools landing no longer request the resource manifest merely because the application booted.
- `skills.json` is no longer statically imported. It is loaded on demand from `/assets/data/skills.json` through `ResourceDataService.loadStaticJson`, retaining same-origin fallback and cache behavior.
- Character, character-name, support-card, race-saddle, and skills fallbacks are mutable empty registries hydrated by the owning feature. This avoids compiling their data into unrelated chunks.
- Chart.js registration is centralized in `chart-runtime.ts`; chart components import Chart types only and load the runtime when needed. ExcelJS and CodeMirror remain action/advanced-mode chunks.
- Material paginator dependencies on circles/rankings were replaced by an `OnPush` presentation-only paginator.
- Angular animations use the async provider. Database dialogs, the tour overlay, carat timeline, inheritance entries, ads, and below-fold home content use dynamic imports or viewport deferral.
- Advertising placements remain present with reserved space. Provider initialization moved from root startup to the ad components, and advertising-only legacy CSS is linked only when ads initialize.

## Rendering and CSS changes

- The application shell and new presentation components use `OnPush`.
- Ad/viewport observers are disconnected on destruction; existing chart observers now respond to DOM theme changes without eagerly coupling route chunks to the theme service.
- Broad Material light/dark color output was reduced to component surfaces that need global theming. Feature-only legacy/global blocks were disabled or moved to lazy assets.
- Sass division deprecations in the lineage planner were replaced with `math.div`.
- Offscreen route sections and charts have viewport deferral; LCP/home media retain explicit dimensions and below-fold images retain lazy loading/fallback behavior.
- The carat planner's obsolete selector families were removed after static template/component analysis and deterministic desktop/mobile rendering. Its source SCSS fell from 124,955 to 116,570 bytes and Sass-compressed output from 110,825 to 102,647 bytes.
- The planner's already-namespaced `.cp*` rules now use `ViewEncapsulation.None`, avoiding redundant Angular scope attributes. Stable base rules and later responsive refinements compile as ordered 58,865-byte and 43,782-byte style layers, both below the 75 KB component-style gate. The planner lazy chunk fell from 267.00 KB to 259.20 KB raw (47.99 KB to 47.30 KB estimated transfer).

## Duplication result

Configured jscpd thresholds pass:

| Format | Baseline | Final | Gate |
| --- | ---: | ---: | ---: |
| Overall | 3.02% / 143 blocks | 1.863% / 58 blocks | <= 2% |
| Markup | 6.22% | 3.783% | <= 4% |
| TypeScript | 2.28% | 1.285% | <= 1.75% |
| SCSS | 2.60% | 1.977% | <= 2% |

Intentional generation-specific lineage markup, branded home/tools presentation, and typed ranking-mode rows are documented in `docs/frontend-audit-clone-allowlist.md`. The report is written to `reports/jscpd/jscpd-report.json`.

## Compatibility characterization

The final unit suite contains 194 passing tests. Characterization covers UQL behavior already present in the repository, planner calculations and reward presentation, timeline ordering/avatar fallback, resource fallback hydration, free-pull allocation, LB crystals, statistics services, and existing serialization behavior.

Two compatibility defects exposed during the refactor were fixed in shared services:

- Public timeline character labels now preserve source punctuation rather than rewriting `(Summer)` as `[Summer]`.
- Future support cards not yet in fallback data retain rarity-prefix handling, so SR targets still use gold LB crystals.

No public route, backend contract, manifest shape, local-storage key, saved-filter format, UQL link format, planner import/export format, or authentication redirect was deliberately migrated.

## Route/browser verification

The deterministic matrix has 290 passing cases:

- 29 explicit routes/query states, redirects, parameterized paths, guarded/profile child paths, CSV route, and wildcard behavior. This includes direct and warm navigation to `/timeline?tab=carat-planner`.
- Direct load and warm client navigation for every path.
- Desktop Chromium, Firefox, and WebKit.
- Pixel 7 Chromium and iPhone 13 WebKit profiles.
- Visible shell, expected redirect/path, uncaught page errors, and horizontal viewport overflow.

The audit server owns dedicated port 4317 to prevent accidental reuse of a developer server from another worktree. Local concurrency is capped at four and CI at two to avoid browser-process pressure flakes.

## Lighthouse status

The repository contains four deterministic five-run configs (mobile/desktop, shell/heavy) and a separate five-run production/beta comparison. Local configs now use Lighthouse CI's built-in static `dist/browser` SPA server, so they cannot attach to an unrelated `ng serve` process.

No valid five-run median is claimed in this report. The first attempted collection attached to an existing server from the original worktree and was discarded. Subsequent Windows collections left Lighthouse child trees alive after the command wrapper timed out; those task-owned processes were removed, and no generated score was accepted as evidence. The live production/beta comparison was therefore not run. These gates should be executed by the Linux CI workflow or a clean browser host before merge.

## Assets

Tracked deployment assets remain approximately 175 MB, dominated by timeline images. The production compression step converts 14 PNGs to WebP in the built artifact, reducing those files from 7.63 MB to 1.36 MB (6.27 MB saved), but the release archive is still approximately 170.64 MB.

No tracked duplicate URL was deleted in this branch. The initial hash audit found about 21.5 MB of byte-identical files, but deleting historical URLs without a deployed-reference manifest can break cached clients. Asset deletion and timeline synchronizer canonicalization remain a separate compatibility-aware task.

## Deliberately deferred P2 work

These items are not represented as complete:

- The UQL implementation is now isolated behind a deferred advanced-mode component, but its tokenizer/compiler/validation/suggestion/state code is still concentrated in the large UQL component. A full pure-domain extraction needs a dedicated characterization branch because serialized saved filters and links are compatibility-critical.
- Statistics benefited substantially from lazy chart/data ownership, but pure selector/view-model decomposition is incomplete.
- Timeline shares existing avatar/services and deferred view decisions, but desktop/mobile templates are not yet fully driven by one typed event view model.
- Carat reward behavior gained characterization/fixes, but reward/allocation/presentation builders and the remaining large component were not fully split.
- A broad automated `OnPush`/loop-tracking rewrite was not applied. Components with mutable inputs or unstable identity need route-specific profiling rather than a mechanical change.
- Tracked duplicate asset removal and synchronizer enforcement are deferred as described above.
- Valid deterministic and live Lighthouse five-run medians remain required before merge.

## Commands

- `npm run audit:bundle` - optimized audit build and strict output-graph budgets
- `npm run audit:bundle:report` - same measurement without a failing exit code
- `npm run audit:duplicates` - configured clone detection and per-language gates
- `npm run audit:routes` - 290-case Playwright browser/device matrix
- `npm run audit:lighthouse` - build plus deterministic five-run mobile/desktop gates
- `npm run audit:lighthouse:live` - non-gating production/beta comparison with third parties
- `npm run audit:frontend` - aggregate deterministic audit

Generated reports are ignored by Git and uploaded by `.github/workflows/frontend-quality.yml`.

## Final verification performed

- `npm run build:prod` - pass; image compression pass
- `npm run build:profile` - pass
- `npm test -- --watch=false --browsers=ChromeHeadless --progress=false` - 194 pass
- `node scripts/frontend-audit/check-bundles.mjs` after audit build - pass
- `npm run audit:duplicates` - pass
- `npm run audit:routes` - 280 original route cases plus 10 planner-query cases pass (290 total)
- Lighthouse deterministic/live runtime - not completed; see status above
