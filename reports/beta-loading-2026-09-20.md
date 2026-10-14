# beta.uma.moe loading audit - 20 September 2026

The live site's largest loading problems were Timeline image downloads, oversized scenario logos, and data requests waiting unnecessarily for label catalogs. Focused fixes are implemented in the Svelte worktree and verified locally. They have **not been deployed**, so the live measurements below describe the existing beta release.

## Method

- Measured https://beta.uma.moe; audit batches completed between 01:17 and 01:24 Europe/Berlin on 20 September (19 September UTC).
- Chromium, a fresh browser context and HTTP cache for every route, no account session. Onboarding was marked completed so it did not obscure the page.
- Mobile: Pixel 5 viewport, 4× CPU slowdown, 10 Mbps download, 2 Mbps upload, 80 ms added network latency. Advertising and analytics were declined through the site's stored consent preference; browser verification remained enabled.
- Desktop: 1536 × 960, unthrottled, default consent/provider behavior. Its privacy banner often became the largest painted element. Desktop and mobile numbers therefore represent different scenarios and must not be treated as a device-only comparison.
- One exploratory sample per route; 15 seconds of observation after mobile DOMContentLoaded and 10 seconds on desktop. These are lab observations, not Lighthouse scores, production percentiles, or an INP assessment.
- **FCP:** first content painted. **LCP:** largest visible element painted. **Ready:** approximate final disappearance of visible route spinners, sampled every 100 ms after a route heading appeared. This heuristic is not an interactivity guarantee and can precede image paint. **Transfer:** CDP-reported bytes completed during the observation window, including providers; KiB = 1,024 bytes.
- Layout-shift figures below sum observed shifts without recent user input across the observation window. They identify movement to investigate; they are not the standard session-window CLS calculation.

Raw observations are in `.tmp/beta-performance/live-desktop.json`, `live-mobile.json`, and `live-details.json`. The local audit runner is `.tmp/audit-beta-loading.mjs`.

## Mobile: every measured page

All times are seconds. These are the live, pre-deployment results.

| Page | FCP | LCP | Ready ≈ | Transfer KiB | Finding / action |
| --- | ---: | ---: | ---: | ---: | --- |
| Home `/` | 0.62 | 0.63 | 0.61 | 303 | Fast shell; provider overhead dominates the default-consent run. |
| Database `/database` | 0.55 | 1.25 | 3.31 | 1,573 | Search waited for display catalogs; large scenario PNGs. Both addressed locally. |
| Clubs `/circles` | 0.54 | 1.23 | 2.51 | 398 | Data loads after the heading; visible layout movement (shift sum 0.238) remains worth addressing. |
| Trainer rankings `/rankings` | 0.56 | 0.89 | 1.39 | 331 | Modest payload; layout movement (shift sum 0.216) is a stronger concern than download size. |
| Activity `/activity` | 0.50 | 0.91 | 1.38 | 385 | No major route-specific loading bottleneck in this sample. |
| Timeline `/timeline` | 0.61 | **3.96** | **5.67** | **4,549** | Largest outlier: banners outside the viewport plus an extra artwork URL module. Both addressed locally. Manifest also received an initial 429. |
| Carat Planner `/timeline?tab=carat-planner` | 0.56 | 2.26 | 4.84 | 666 | Timeline dependencies and manifest retries delay data. Benefits from artwork-module removal and the earlier proof-coordination fix. |
| Tierlist `/tierlist` | 0.58 | 0.94 | 1.39 | 593 | Artwork-heavy, but no significant paint delay in this sample. |
| Statistics `/tools/statistics` | 0.50 | 0.98 | 2.54 | **2,435** | Heading paints early; data follows. Oversized scenario images and a catalog → statistics waterfall addressed locally. |
| Lineage Planner `/tools/lineage-planner` | 0.53 | 1.68 | 1.68 | 646 | Shared catalog/proof setup contributes to startup. Shift sum 0.185 warrants a follow-up with layout-shift attribution. |
| Tools `/tools` | 0.57 | 0.97 | 0.96 | 307 | Small page; shared provider cost is the main opportunity. |
| Privacy `/privacy-policy` | 0.49 | 0.78 | 0.76 | 282 | No route-specific optimization justified by this run. |
| Login `/login` | 0.55 | 0.73 | - | 277 | Sign-in choices loaded; no OAuth interaction performed. No matching heading for the Ready heuristic. |
| Veterans `/veterans` | 0.54 | 1.20 | 1.20 | 475 | Public landing/upload view measured, without a user collection. |
| Settings `/settings` | 0.52 | 1.20 | - | 291 | Signed-out sign-in view only; authenticated settings were not measured. |
| Club details `/circles/354170328` | 0.59 | 1.34 | 1.89 | 607 | Public club rendered successfully. Export actions were not triggered. |
| Trainer activity `/activity/112852554709` | 0.55 | 0.94 | 1.49 | 349 | Public trainer activity rendered successfully. |
| Trainer profile `/profile/112852554709` | 0.57 | 2.37 | 2.26 | 1,162 | **Partial load:** profile rendered, but eight circle-history requests returned 429. Ready does not mean complete history here. |
| Trainer veterans `/veterans/112852554709` | 0.49 | - | - | 521 | **Failed load:** profile API returned 429; error appeared at 3.69 s. |
| Champions Meeting `/profile/112852554709/cm` | 0.56 | - | - | 370 | **Failed load:** profile API returned 429; error appeared at 4.60 s. |
| Achievements `/profile/112852554709/achievements` | 0.55 | - | - | 369 | **Failed load:** profile API returned 429; error appeared at 3.70 s. |
| Titles `/profile/112852554709/titles` | 0.50 | - | - | 369 | **Failed load:** profile API returned 429; error appeared at 3.78 s. |

The error-screen paints are deliberately not presented as successful profile loading times. Repeated cold profile testing was stopped after these rate-limit failures. The previous console-cleanup changes coordinate browser proof before protected requests; whether that also resolves these live history/profile failures requires deployment and a fresh live check. A server-side rate limit is also possible and cannot be ruled out from the browser trace alone.

Coverage: 22 representative public route variants. Legacy redirects (`/inheritance`, `/support-cards`, `/shame`, and profile/veterans aliases) share the canonical pages above. OAuth callback `/signin`, club export URLs/actions, authenticated settings, uploaded account collections, the internal UI gallery, and the WIP/error page were not benchmarked as normal content pages. Other trainers, filters, and every query-string combination were not exhaustively sampled.

## Desktop with default consent/providers

LCP here frequently measures the privacy banner, so it is not a reliable proxy for when page data finishes loading. The mobile table above is more useful for isolating application work.

| Page | FCP (s) | LCP (s) | Transfer KiB |
| --- | ---: | ---: | ---: |
| Home | 0.60 | 1.46 | 1,525 |
| Database | 0.32 | 0.95 | 2,967 |
| Clubs | 0.41 | 1.24 | 1,619 |
| Rankings | 0.26 | 1.04 | 1,552 |
| Activity | 0.30 | 1.02 | 1,639 |
| Timeline | 0.25 | 0.86 | 4,132 |
| Carat Planner | 0.28 | 1.00 | 1,923 |
| Tierlist | 0.44 | 1.17 | 1,846 |
| Statistics | 0.28 | 1.02 | 4,061 |
| Lineage Planner | 0.24 | 0.85 | 1,868 |
| Tools | 0.28 | 1.14 | 1,525 |
| Privacy | 0.47 | 1.00 | 1,539 |
| Login | 0.22 | 0.99 | 1,498 |
| Veterans | 0.23 | 0.83 | 1,732 |
| Settings, signed out | 0.26 | 0.89 | 1,545 |

Initial HTML response times were approximately 0.12–0.34 s. The home page transferred around 1.49 MiB with default provider behavior despite its small first-party shell. Consent/ad scripts are a meaningful independent performance cost. They were not disabled or removed as part of this optimization.

## Implemented changes and measured local gains

| Change | Before | After | Evidence |
| --- | ---: | ---: | --- |
| All 13 scenario-logo source variants used by the UI | 7,367,420 B PNG | 800,272 B WebP | **89.1% smaller**; quality 85, maximum dimension 512 px. Original PNG sources retained. |
| Three scenario logos observed in Database | 753,628 B | 159,848 B | **78.8% smaller** for those same images. |
| Four scenario logos observed in Statistics | 1,583,876 B | 221,792 B | **86.0% smaller**; closed filter images also use native lazy loading. |
| Extra Timeline artwork URL module | 126,940 B JS / 22,346 B gzip | Removed | Reuses the already-published artwork paths and manifests. Removes a sequential module dependency and its parse work. |
| Initial mobile Timeline image requests, controlled fixture | 26 / 2,172,004 B image bodies | 18 / 1,481,642 B | **31.8% fewer image bytes**, with the same 180-event dataset and viewport. |
| Initial desktop Timeline image requests, same fixture | 18 / 1,473,394 B | 14 / 1,069,076 B | **27.4% fewer image bytes**. |
| Database request ordering | Search waited for character/support display catalogs | Search starts independently | Browser test holds the character catalog response and confirms search results still render. |
| Statistics request ordering | Global statistics waited for label catalogs | Global data loads alongside catalogs | Browser test holds the skill catalog response and confirms the statistics request already started. Reuses existing query caching. |

Timeline mounts a smaller margin of content around the viewport, preserving its virtualized scroll window and Today navigation. The image-request comparison uses identical synthetic data, real bundled artwork, local production builds, and a fixed date. It is a controlled before/after download comparison, **not** a claimed production LCP improvement. Its results are in `.tmp/beta-performance/timeline-comparison-mobile.json` and `timeline-comparison-desktop.json`.

The candidate's initial shell remains within the existing budgets: **53.9 KiB gzip JavaScript and 12.0 KiB gzip CSS**, against 100/35 KiB limits. The shell was already small; optimizing route payloads and request dependencies offers better value than a framework rewrite. No dependency was added.

## Validation

- Svelte check: **0 errors, 0 warnings**.
- Artwork, resource-catalog, and Timeline layout unit checks: **20 passed**.
- Database/Statistics loading-order, Statistics interactions, Timeline layout, scrolling, and navigation: **69 passed**, across Chromium, mobile Chromium, and mobile WebKit. Six desktop-only wheel/paint checks were intentionally skipped on the two mobile projects.
- Controlled before/after Timeline download comparisons: **2 passed**.
- Beta Vite production build completed; initial shell budgets pass. The existing warning for large lazy chart/export chunks remains; those chunks are outside the initial shell.
- Screenshots confirm scenario logos remain legible and Timeline/Carat artwork renders from the published asset paths.
- `git diff --check` passes.

## Remaining live checks

After deploying the code **and generated public assets**, repeat the mobile audit under the same consent, cache, viewport, and throttle conditions. Focus on Timeline image bytes/LCP, Database result arrival, Statistics result arrival, and the profile/manifest 429s. Use several samples per route before judging a timing improvement.

Clubs, Rankings, and Lineage Planner still showed layout movement; capture shift-source attribution before changing their placeholders. Provider initialization is the next shared payload opportunity, but changes must preserve the intended consent and advertising behavior. Signed-in pages need a separate authorized session-based run. No production deployment or account mutation was performed during this audit.

## Follow-up: graceful loading and smaller Timeline cards

The 4,549 KiB live figure means about **4.4 MiB of total page traffic**, not a single file. The images already used native lazy loading. Browsers can fetch images near the viewport before they become visible ([browser lazy-loading behavior](https://web.dev/articles/browser-level-image-lazy-loading)). The Timeline also mounted its opening dates before automatically scrolling to Today, allowing those discarded cards to start image downloads.

The new implementation waits until the initial positioning finishes before assigning image URLs. It retains native lazy loading afterward. Card-shaped placeholders appear while event data loads; event text and controls work while artwork loads. Artwork fades in within a fixed area, and failed artwork keeps that area in place. Reduced-motion preferences disable the fade. A failed data request now has an inline Try again action.

Banner height decreases from 70 to 56 px, with less unused space in card bodies. Font sizes and mobile button targets are preserved. The same controlled 180-event comparison against the preceding local optimization now gives:

| Metric | Previous local build | Graceful-loading build |
| --- | ---: | ---: |
| Desktop story card height | 193 px | 167 px |
| Mobile story card height | 173 px | 151 px |
| Initial desktop image requests / image bytes | 14 / 1,069,076 B | 9 / 818,910 B |
| Initial mobile image requests / image bytes | 18 / 1,481,642 B | 12 / 1,131,948 B |

This is roughly **13% shorter cards** and **another 24% reduction in initial image bytes**, measured locally with identical data. Actual card heights depend on their contents. Live production timings remain unmeasured for these changes because they are not deployed.

Validation: 33 Timeline loading, failure/retry, layout, scrolling, and navigation browser checks passed across desktop Chromium, mobile Chromium, and mobile WebKit, plus two before/after comparisons. Six desktop-only checks were skipped on mobile. After a final lifecycle guard and placeholder contrast adjustment, the 14 applicable loading/navigation checks and both comparisons passed again. Svelte check reported zero errors/warnings, and the beta build completed. Measurements: `.tmp/beta-performance/graceful-comparison-desktop.json` and `graceful-comparison-mobile.json`.
