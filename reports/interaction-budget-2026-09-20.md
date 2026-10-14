# Interaction budget audit - 20 September 2026

The 300 ms target is **not met everywhere**. The audit now checks native clicks, taps and keyboard interactions across the existing browser suite, with additional checks for completed dialogs, filtering and populated routes. The measured follow-ups contain 507 named control groups; 63 have at least one input-to-next-paint measurement over 300 ms. Full results, including every measured control group and workflow status, are retained in [the JSON inventory](interaction-budget-2026-09-20.json).

## Method and coverage

Beta production build, Chromium, Pixel 5 touch emulation and desktop viewports, 8× CPU slowdown, one worker. Builds, profilers and other browser suites were not run alongside timing runs. Baseline commit: `661fc7df03683002e3a2a7e6150e21babe918136`. Follow-ups use the changes accompanying this report. The lazy-loading, database and final stress runs use the final production build.

The complete mobile suite was run before and after the first fixes. The broad second run completed 337 mobile workflows and 38 desktop workflows before it was stopped to correct failures. Windows interruption lost that run's final native timing JSON; its workflow results survive in the log and are included in the inventory. Completed-workflow checkpoint files have since been added to the reporter. Follow-ups retest changed areas and add desktop-only controls and the UI component galleries. This is not a claim that every possible dynamic state or external control has been enumerated.

| Run | Workflows | Functional outcomes | Measured control groups | Groups over 300 ms |
| --- | ---: | --- | ---: | ---: |
| baseline | 336 | {"passed":315,"skipped":8,"failed":11,"timedOut":2} | 884 | 33 |
| regression | 31 | {"passed":28,"failed":3} | 105 | 12 |
| mobile | 44 | {"passed":43,"failed":1} | 243 | 18 |
| desktop | 19 | {"passed":19} | 63 | 9 |
| lazy | 32 | {"passed":31,"skipped":1} | 114 | 27 |
| database | 23 | {"passed":23} | 55 | 4 |
| stress | 5 | {"passed":5} | 53 | 9 |

Diagnostic runs used `PERF_ENFORCE=0` to collect all cases. A functional pass does **not** mean the timing passed. The default benchmark fails any measured interaction or explicit completion check over 300 ms. Timing is not relaxed using averages or percentiles. Coverage differs between baseline and follow-ups, so their aggregate counts are not a direct speed comparison.

## Slow native interactions in the follow-ups

Worst observation per project, route, scope and label, using the latest completed run of each workflow. Earlier measurements remain in the per-run inventories, but replaced workflow results are not counted as current. Chrome reports durations in 8 ms steps. The full inventory also retains controls within budget. Earlier workflows that were not affected by the final targeted changes were not rerun.

| Project | Route | Control | Worst ms |
| --- | --- | --- | ---: |
| chromium | /ui | button: Game displays10 | 1336 |
| chromium | /timeline | button: Open details for Umayuru Celebration | 944 |
| mobile-chromium | /timeline | button: Toggle theme | 824 |
| mobile-chromium | /circles/7 | button: Toggle theme | 752 |
| chromium | /timeline | button: Toggle theme | 744 |
| mobile-chromium | /database | button: Select Grass Wonder | 736 |
| chromium | /database | radio: Advanced | 736 |
| mobile-chromium | /veterans/123456789012 | textbox: UQL query | 688 |
| chromium | /database | input: Trainer ID | 624 |
| chromium | /veterans/123456789012 | button: Add Speed spark | 584 |
| chromium | /circles/7 | button: Toggle theme | 584 |
| chromium | /veterans/123456789012 | button: Add Stamina spark | 568 |
| mobile-chromium | /veterans/123456789012 | button: View Grass Wonder details | 560 |
| chromium | /veterans/123456789012 | radio: OR | 528 |
| mobile-chromium | /circles/7 | button: Show member rows | 504 |
| chromium | /database | button: Borrow support card | 504 |
| chromium | /ui | button: Statistics4 | 480 |
| chromium | /circles/7 | button: Show member rows | 480 |
| mobile-chromium | /veterans/123456789012 | button: Add Speed spark | 472 |
| mobile-chromium | /profile/123456789012 | button: View Grass Wonder details | 464 |
| chromium | /veterans/123456789012 | radio: AND | 464 |
| chromium | /database | button: Filters | 448 |
| mobile-chromium | /database | button: Race Schedule Filter 0 | 448 |
| stress (mixed viewport) | /timeline | radio: Horizontal | 440 |
| mobile-chromium | /veterans/123456789012 | button: Add Stamina spark | 432 |
| stress (mixed viewport) | /timeline | radio: Vertical | 432 |
| mobile-chromium | /database | button: Pick your legacy | 424 |
| mobile-chromium | /circles/7 | button: Show member cards | 424 |
| chromium | /ui | button: Open race history | 416 |
| mobile-chromium | /database | button: Races | 408 |
| stress (mixed viewport) | /tools/statistics | radio: All distances | 408 |
| chromium | /database | radio: Kitasan Black Fire at My Heels | 400 |
| mobile-chromium | /timeline | button: Remove 100 free-pull campaign from plan | 392 |
| mobile-chromium | /profile/123456789012 | button: Toggle theme | 384 |
| mobile-chromium | /database | button: Change Parent 1 | 384 |
| stress (mixed viewport) | /database | textbox: UQL query | 384 |
| stress (mixed viewport) | /timeline | button: Unselect all | 384 |
| mobile-chromium | /veterans/123456789012 | radio: AND | 376 |
| chromium | /database | button: Add included characters to Main parent (P1/P2) | 376 |
| chromium | /database | button: Add 1 Character | 376 |
| stress (mixed viewport) | /database | button: Borrow support card | 376 |
| mobile-chromium | /database | button: Borrow support card | 368 |
| mobile-chromium | /profile/123456789012 | button: Details | 368 |
| mobile-chromium | /tools/lineage-planner | button: Pick Veteran for Parent 1 | 368 |
| mobile-chromium | /veterans/123456789012 | radio: OR | 368 |
| mobile-chromium | /circles/7 | button: Show member chart | 360 |
| mobile-chromium | /circles/7 | button: Show Trainer 30 | 360 |
| mobile-chromium | /database | button: Race wins for Parent 1 | 360 |
| mobile-chromium | /veterans/123456789012 | button: Filters | 360 |
| chromium | /ui | button: Open optimal races | 352 |
| mobile-chromium | /profile/123456789012 | button: Races | 344 |
| chromium | /database | button: Add Trainer ID | 336 |
| stress (mixed viewport) | /database | button: Races | 336 |
| mobile-chromium | /database | button: Choose Parent 1 | 328 |
| mobile-chromium | /circles/7 | button: Apply | 328 |
| chromium | /ui | button: Navigation3 | 328 |
| mobile-chromium | /database | textbox: UQL query | 328 |
| mobile-chromium | /timeline | button: Remove Second banner banner | 320 |
| stress (mixed viewport) | /database | button: Pick target character | 312 |
| mobile-chromium | /timeline | tab: Rewards | 304 |
| mobile-chromium | /tools/lineage-planner | button: Select Mejiro McQueen | 304 |
| mobile-chromium | /timeline | radio: Vertical | 304 |
| stress (mixed viewport) | /tools/statistics | radio: Sprint | 304 |

## Time to completed content

These measurements start at dispatched user input and finish after a concrete readiness condition plus two animation frames. They exclude locator lookup and assertion polling. A loading indicator alone cannot pass. UQL readiness means a usable editor; route readiness means mounted content, not every image decoded or every remote request completed.

| Project | Action | ms | 300 ms budget |
| --- | --- | ---: | --- |
| chromium | 1000-veteran OR | 528 | OVER |
| chromium | 1000-veteran AND | 466 | OVER |
| chromium | 1000-veteran OR | 452 | OVER |
| chromium | Preloaded Timeline 5 events, visit 1 | 674 | OVER |
| chromium | Preloaded Timeline 5 events, visit 2 | 299 | within budget |
| chromium | Preloaded Timeline 5 events, visit 3 | 310 | OVER |
| chromium | Preloaded Timeline 5 events, visit 4 | 275 | within budget |
| chromium | Preloaded Timeline 5 events, visit 5 | 378 | OVER |
| chromium | Preloaded Timeline 1000 events, visit 1 | 777 | OVER |
| chromium | Preloaded Timeline 1000 events, visit 2 | 373 | OVER |
| chromium | Preloaded Timeline 1000 events, visit 3 | 387 | OVER |
| chromium | Preloaded Timeline 1000 events, visit 4 | 376 | OVER |
| chromium | Preloaded Timeline 1000 events, visit 5 | 378 | OVER |
| mobile-chromium | 1000-veteran OR | 372 | OVER |
| mobile-chromium | 1000-veteran AND | 379 | OVER |
| mobile-chromium | 1000-veteran OR | 319 | OVER |
| stress (mixed viewport) | race history ready | 476 | OVER |
| stress (mixed viewport) | optimal races ready | 288 | within budget |
| stress (mixed viewport) | UQL editor ready | 1961 | OVER |
| stress (mixed viewport) | planner goals ready | 468 | OVER |
| stress (mixed viewport) | populated route /database | 2234 | OVER |
| stress (mixed viewport) | populated route /timeline | 3396 | OVER |
| stress (mixed viewport) | populated route /tools/statistics | 1665 | OVER |
| stress (mixed viewport) | populated route /database | 850 | OVER |
| stress (mixed viewport) | populated route /timeline | 1425 | OVER |
| stress (mixed viewport) | populated route /tools/statistics | 543 | OVER |
| stress (mixed viewport) | large character picker ready | 643 | OVER |
| stress (mixed viewport) | large support picker ready | 882 | OVER |
| stress (mixed viewport) | large UQL editor ready | 4007 | OVER |

## Changes and verification

- Lazily mount unopened dialog/popover contents, render only the active race layout, and load factor, club-member, veteran and reward lists automatically in batches. Stacked timeline days also load automatically when scrolling; their expansion button is removed. Search still covers complete catalogs.
- Reuse planner ledgers when pull counts or goals change, cache immutable reward fallback work and date/number formatters, and avoid deep proxies on immutable snapshots.
- Batch timeline row measurements and prepare the destination viewport before switching direction.
- Remove redundant UQL completion scans and repeated query normalization; stabilize the selected-legacy catalog passed to the editor. Database search debounce is 150 ms instead of 320 ms.
- Keep the original chart update lifecycle: the attempted offscreen-update optimization caused a mobile tooltip regression and was reverted. The tooltip, profile copy tracking and lazy-list behavior were retested.
- Production build, 313 unit tests and Svelte check passed; zero Svelte errors/warnings. Compressed base shell: 55.2 KiB JS and 12.8 KiB CSS. Vite still reports its existing large lazy-chunk warning.

All eight broad-run functional failures passed their subsequent retests. The latest follow-ups cover 137 workflows: 136 functional passes and one desktop wheel test skipped on mobile. Their timing failures remain recorded separately. Cold UQL/catalog preparation, large dialogs, chart/theme changes and populated routes remain priorities where listed above. Profiling shows first UQL key delays overlap catalog/compiler setup rather than the key handler alone.

## Reproduce

See [the benchmark instructions](../tests/performance/README.md). Run `npm run benchmark:interactions` for the full suite with strict 300 ms enforcement, or `npm run benchmark:mobile` for the five large-data scenarios. Synthetic data covers 1,200 database records, 4,000 timeline events/rewards, 30 planner targets and catalogs with 250 extra characters, 500 supports, 2,000 skills and 1,200 factors.

API responses, advertisements and consent providers are mocked. Physical phones, production network latency, publisher CPU work, hover-only behavior, native browser dialogs and third-party pages are outside these measurements. Native Event Timing omits events below its 16 ms reporting floor; synthetic range changes are verified functionally but do not have native interaction IDs.
