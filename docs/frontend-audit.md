# Frontend performance and maintainability audit

Audit branch: `codex/frontend-audit`
Original audit baseline: local `beta` commit `bc0e661`
Synchronized base: `origin/main` commit `a7c9176` (2026-08-07)
Worktree: `C:\tmp\umamoe-frontend-audit`
Deterministic environment: Angular `audit` configuration, same-origin data fallbacks, API fixtures, and analytics/advertising/Turnstile disabled
Production comparison targets: [uma.moe](https://uma.moe/) and [beta.uma.moe](https://beta.uma.moe/)

## Outcome

The reported mobile delay was distributed across startup ownership rather than caused by one request. The root shell eagerly initialized game data and conditional integrations, a 1.72 MB skills fallback was compiled as JavaScript, the full Material color surface was global, and chart/export/editor dependencies leaked into large route closures.

This branch moves data and optional integrations to feature/action time, centralizes lazy Chart.js registration, defers offscreen and conditional UI, self-hosts Material Icons, reduces global Material CSS, and adds repeatable browser, bundle, duplicate, CPU, and Lighthouse tooling. URLs, API shapes, authentication, persisted planner/filter formats, ads, analytics, tours, and Cloudflare behavior were not intentionally changed.

## Measured bundle result

Bundle values below are raw emitted JavaScript/CSS and locally calculated Brotli bytes. Static assets are reported separately.

| Measurement | Baseline | Final | Change | Gate |
| --- | ---: | ---: | ---: | ---: |
| Initial bundle raw | 1,320,053 B | 888,568 B | -32.7% | <= 1,000,000 B |
| Initial bundle Brotli | 272,216 B | 199,582 B | -26.7% | <= 200,000 B |
| Initial files | 28 | 20 | -28.6% | <= 20 |
| Global CSS | 252,032 B | 165,075 B | -34.5% | <= 175,000 B |
| Home route | 35,365 B | 16,325 B | -53.8% | <= 25,000 B |
| Database route | 1,574,957 B | 1,122,719 B | -28.7% | <= 1,150,000 B |
| Timeline route | 986,966 B | 724,169 B | -26.6% | <= 750,000 B |
| Statistics route | 2,648,752 B | 573,327 B | -78.4% | <= 1,500,000 B |
| Lineage planner route | 2,760,690 B | 963,723 B | -65.1% | <= 1,500,000 B |

Every configured route budget passes. The carat-planner closure is 511,966 B after the final reward-reconciliation sync, down from the earlier 523,007 B regression and below its 520,000 B gate. Other measured closures also improved: circles 196,271 B, circle details 527,761 B, rankings 200,705 B, activity 387,812 B, tierlist 371,349 B, profile 552,121 B, and veterans 692,103 B.

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
- Navigation badges, status pings, seasonal lights, and the snow toggle no longer run decorative infinite animations while the application is idle. The carat loading indicator is transform-only and becomes static under reduced-motion preferences.
- The tierlist no longer attaches a document-wide mousemove listener. Hover coordinates are captured only when a card interaction starts.
- Normal navigation/home branding uses the tracked favicon. The optional seasonal-logo fallback is terminal and cannot repeatedly reassign the same missing URL from an image error event.
- Broad Material light/dark color output was reduced to component surfaces that need global theming. Feature-only legacy/global blocks were disabled or moved to lazy assets.
- Sass division deprecations in the lineage planner were replaced with `math.div`.
- Offscreen route sections and charts have viewport deferral; LCP/home media retain explicit dimensions and below-fold images retain lazy loading/fallback behavior.
- The carat planner's obsolete selector families were removed after static template/component analysis and deterministic desktop/mobile rendering. Its source SCSS fell from 124,955 to 116,570 bytes and Sass-compressed output from 110,825 to 102,647 bytes.
- The planner's already-namespaced `.cp*` rules now use `ViewEncapsulation.None`, avoiding redundant Angular scope attributes. Stable base rules and later responsive refinements compile as ordered 58,865-byte and 43,782-byte style layers, both below the 75 KB component-style gate. Removing its Material progress-bar dependency reduced the planner component lazy chunk from 267.00 KB to 252.57 KB raw after the final reward-reconciliation sync; the complete route closure is 511.97 KB raw / 86.71 KB Brotli.
- Database result requests now own an immutable page/generation, stale searches cannot mutate a newer result set, the final server page no longer triggers an extra fetch, and HTTP/render-batch completion explicitly removes progress UI without waiting for another user event.
- UQL editor compilation/state persistence is coalesced across rapid document changes, its recurring animated placeholder was replaced by static guidance, and the closed documentation guide no longer builds/tokenizes its article.
- Lineage odds reuse stable parent/summary/combined view models and stable row identities. One responsive odds table replaces byte-identical desktop/mobile markup, and inactive summary tabs instantiate on demand.
- A slow affinity-resource race was fixed: the ready resource emission now recalculates a restored tree, so a populated planner cannot remain permanently stuck on the “add a parent” odds placeholder. The mobile great-grandparent controls are no longer hidden by a later desktop default rule.

## Site-wide idle CPU result

The repeatable CPU audit measures all 29 audited routes in desktop and Pixel-sized mobile Chromium contexts. Each route runs with third parties blocked, deterministic API/resource fixtures, a 4x CPU throttle, a 1.5-second post-render settle, and a two-second idle observation. CDP task/script duration, long tasks, animation-frame callbacks, active animation ownership, errors, and DOM size are recorded. Redirects and wildcard behavior remain individual route cases, matching the route matrix.

| Profile | Mean CPU ms/s before | Mean CPU ms/s final | Change | Median final | p95 final | Maximum final |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Desktop | 73.66 | 2.19 | -97.02% | 1.98 | 11.14 | 18.46 |
| Mobile | 73.63 | 1.92 | -97.40% | 1.72 | 6.08 | 11.10 |

The outliers that motivated the pass improved as follows:

| Route | Desktop before -> final | Mobile before -> final |
| --- | ---: | ---: |
| Home | 427.42 -> 2.15 ms/s (-99.50%) | 479.12 -> 1.94 ms/s (-99.60%) |
| Tools | 380.31 -> 2.44 ms/s (-99.36%) | 294.92 -> 1.97 ms/s (-99.33%) |
| Statistics | 219.87 -> 0.23 ms/s (-99.90%) | 207.30 -> 0.31 ms/s (-99.85%) |
| WIP | 101.00 -> 0.31 ms/s (-99.69%) | 102.08 -> 0.31 ms/s (-99.70%) |

No long tasks or active CSS/Web Animations were present in any final idle observation window. The fixes keep feature highlighting visually distinct with static gradients/shadows, replace indefinitely spinning failure/loading states with accessible static status indicators, and make live/today/timeline placeholders and conditional dialog decoration static. Transient operation spinners, the editor caret, the transform-only carat loading bar, and the opt-in snow effect remain because they communicate active work or are explicitly invoked.

The full 58-case final sweep preceded `main`'s last planner reward reconciliation. Because that commit touched only planner code, the carat route was remeasured on the synchronized base: 11.14 ms/s desktop and 2.89 ms/s mobile, with zero animations and long tasks. The aggregate values above conservatively substitute those post-sync carat measurements into the full sweep.

The strict CI budget is a maximum 25 mean CPU ms/s per profile, 100 CPU ms/s for an individual route, zero idle long tasks, zero active idle animations, and zero page errors. Machine-readable evidence is generated at `reports/frontend-audit/cpu-<label>.json`; the retained local comparison is `cpu-final-sitewide-cpu.json` against `cpu-before-sitewide-cpu.json`.

## Database and lineage interaction CPU

The URL matrix above covers `/database`, the legacy `/inheritance` and `/support-cards` redirects, and `/tools/lineage-planner`. A second cold-context profiler now exercises their internal subpages/states rather than treating a route load as complete coverage. It runs 29 desktop/mobile scenarios at a 4x CPU throttle: Basic/Advanced/UQL mode changes, UQL typing and all six documentation topics, bookmarks, infinite/paginated modes, database scroll/resize, a populated 15-node lineage, all four odds tabs, repeated per-run toggles, mobile great-grandparent expansion, saves/character dialogs, and planner resize.

| Profile | Scenarios | Mean action CPU | Maximum action CPU | Mean settled CPU | Maximum settled CPU |
| --- | ---: | ---: | ---: | ---: | ---: |
| Desktop | 14 | 698.96 ms | 2,078.10 ms (three UQL query replacements) | 0.36 ms/s | 2.54 ms/s |
| Mobile | 15 | 659.07 ms | 1,810.48 ms (three UQL query replacements) | 0.39 ms/s | 3.21 ms/s |

Every scenario passes its multi-action CPU budget. All final settled windows contain zero busy indicators, unexpected animations, long tasks, and page errors. Direct-route idle checks also pass: database is 1.85 ms/s desktop and 1.82 ms/s mobile; lineage planner is 0.31 ms/s desktop and 0.23 ms/s mobile.

Two before/after findings are directly comparable:

- A completed mobile UQL search retained four Material spinner animations and consumed 131.32 CPU ms/s. The final successful-result state retains no spinner/animation and consumes 0.17 ms/s (-99.87%). Desktop likewise drops from four retained animations to zero.
- Before lineage odds consolidation, the same deterministic mobile 15-node fixture used 6,562.05 ms load CPU, 2,203.59 ms to visit its odds tabs, and accumulated 43,515 DOM nodes. Final values are 1,465.11 ms (-77.7%), 628.17 ms (-71.5%), and 3,511 nodes (-91.9%).

The report is generated by `audit:cpu:deep`; retained evidence is `reports/frontend-audit/cpu-final-deep-states-green.json`. CI runs both the complete URL idle sweep and this internal-state matrix.

## Duplication result

Configured jscpd thresholds pass:

| Format | Baseline | Final | Gate |
| --- | ---: | ---: | ---: |
| Overall | 3.02% / 143 blocks | 1.691% / 56 blocks | <= 2% |
| Markup | 6.22% | 3.324% | <= 4% |
| TypeScript | 2.28% | 1.263% | <= 1.75% |
| SCSS | 2.60% | 1.650% | <= 2% |

Intentional generation-specific lineage markup, branded home/tools presentation, and typed ranking-mode rows are documented in `docs/frontend-audit-clone-allowlist.md`. The report is written to `reports/jscpd/jscpd-report.json`.

## Compatibility characterization

The final unit suite contains 213 passing tests after synchronization with current `main`. Characterization covers UQL behavior already present in the repository, rapid editor-change coalescing, planner calculations and reward presentation, timeline ordering/avatar fallback, resource fallback hydration, free-pull allocation, LB crystals, statistics services, and existing serialization behavior.

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
- `npm run audit:cpu -- --label <name>` - 58-case desktop/mobile idle-CPU profile and strict CPU budgets
- `npm run audit:cpu:deep -- --label <name>` - 29-case cold database/lineage internal-state CPU profile
- `npm run audit:lighthouse` - build plus deterministic five-run mobile/desktop gates
- `npm run audit:lighthouse:live` - non-gating production/beta comparison with third parties
- `npm run audit:frontend` - aggregate deterministic audit

Generated reports are ignored by Git and uploaded by `.github/workflows/frontend-quality.yml`.

## Final verification performed

- `npx ng build --configuration production` - pass
- `npm run build:profile` - pass
- `npm test -- --watch=false --browsers=ChromeHeadless --progress=false` - 213 pass
- `node scripts/frontend-audit/check-bundles.mjs` after audit build - pass
- `npm run audit:duplicates` - pass
- `npm run audit:routes` - 280 original route cases plus 10 planner-query cases pass (290 total)
- `npx playwright test --grep carat-planner` after the final `main` sync - 10 pass across all five browser/device projects
- `npm run audit:cpu -- --label final-sitewide-cpu --compare reports/frontend-audit/cpu-before-sitewide-cpu.json` plus post-sync carat recheck - pass; adjusted desktop -97.02%, mobile -97.40%
- `npm run audit:cpu:deep -- --label final-deep-states-green` - 29 database/lineage interaction cases pass; zero retained animations, busy indicators, idle long tasks, or page errors
- Focused database and lineage direct/warm navigation - 20 pass across desktop Chromium/Firefox/WebKit, Pixel 7 Chromium, and iPhone 13 WebKit
- Focused final idle CPU - database 1.85/1.82 ms/s and lineage 0.31/0.23 ms/s desktop/mobile, with zero animations and long tasks
- Lighthouse deterministic/live runtime - not completed; see status above
