# Cross-page Firefox jank investigation

## Latest shared transition recording

The [third shared recording](https://share.firefox.dev/4y1y6Yh) contains an approximately **74 ms main-thread event-delay interval** in the uma.moe page process. It overlaps a 55.9 ms microtask marker, refresh/rendering work, style flushes, a 3.8 ms minor GC and a 2.2 ms synchronous reflow. Timeline component mounting/update stacks are present. Overlapping inclusive times are not additive.

The recording uses an older asset build. Compiled function-entry locations can map to a neighbouring component's prologue, so a sampled function name alone does not establish that a particular planner calculation caused this transition. Private recording data stays local.

## Changes

- UQL previously rebuilt scoped factor aliases, compiler lookup maps and suggestion search strings for unchanged catalogs. Reuse those objects and indexes, deduplicate aliases before expanding scopes, and invalidate on catalog replacement. A regression test covers reused indexes and refreshed factor IDs.
- The shared chart component applied its initial options twice. A single reactive effect now owns option updates. Keep ECharts' automatic resize behavior: skipping or replacing that resize caused an offscreen mobile tooltip in testing. The final version passes viewport bounds, touch dismissal and zoom checks.
- Timeline preparation formatted date labels for every event, including thousands of offscreen cards. Each record now formats and memoizes its label when read. Card rendering remains lazy.

## Method and limits

Native Firefox startup/shutdown profiles contain JavaScript stacks, event delay, rendering and GC markers. Workflow and click timestamps connect intervals to exercised actions. `tests/performance/firefox-stalls.mjs` retains all detected main-thread event-delay intervals over 50 ms, including browser and automation work, with matching source maps. A preceding click label is context, not proof of causation.

Tests run serially against a beta production build on localhost with mocked APIs and advertising. Firefox runs at normal CPU speed; it does not support Chromium's CPU throttle. Requested sampling is 1 ms, but actual Windows sample spacing can be coarser. Profiling adds overhead. These are diagnostic passes, not repeated medians or measurements of production network/ad performance.

Long recordings can evict early workflows from Firefox's buffer. Recorded workflow names are checked against test output and missing coverage is rerun in smaller batches. Whole GC cycles, network spans and asynchronous compilation durations are not necessarily main-thread stalls; inspect their overlapping slices. Playwright accessibility scans also appear in profiles and must not be assigned to application code.

For the separate 300 ms budget, Chromium runs the five large-data workflows at 8× CPU slowdown with profiling disabled. Native input-to-next-paint timings and completed-content timings are reported separately. A loading indicator does not count as a completed route. Diagnostic budget enforcement is disabled to collect all failures; functional passes do not imply a timing-budget pass.

## Results

Baseline is `4927d33`; after is this change on the same host. Baseline recordings cover 97 unique workflows; final recordings cover 100, adding three timeline-loading checks. Coverage includes Database/UQL, Lineage, Profiles/Veterans, Statistics, Activity, Rankings/Clubs, Home/Tools, Settings, Tierlist, Timeline and Carat Planner. This is broad workflow coverage, not every possible combination of data and controls.

| Firefox event-delay intervals over 50 ms | Baseline | Final |
| --- | ---: | ---: |
| Database, Lineage, Profiles/Veterans, Statistics | 37 | 12 |
| Activity, community, Home/Tools, Settings, Tierlist | 2 | 0 |
| Timeline and planner functional workflows | 0 | 0 |
| Five large-data workflows | 28 | 19 |
| Total, including automation/browser stalls | 67 | 31 |

The final community hover test initially failed because its preview covered the trigger before Playwright's mouse click landed. The keyboard-activation rerun passed all 11 community workflows, with no detected >50 ms intervals. Profile theme tests now wait for lazy spark controls before measuring their layout. All 100 final workflows have passing functional results and recorded coverage. Baseline had two failures from that lazy-control synchronization issue.

Selected matched diagnostic intervals:

| Workload | Baseline | Final |
| --- | ---: | ---: |
| Large-catalog UQL editor startup | 242.0 ms | 160.9 ms |
| Separate large-catalog compiler construction interval | 121.9 ms | 72.6 ms |
| Initial 4,000-event timeline update | 102.8 ms | 66.9 ms |

Five preloaded transitions with 1,000 timeline events painted in **46, 36, 35, 35 and 34 ms** in the final Firefox run. These are same-host single diagnostic passes, not a statistically established production speedup. The earlier experiment that skipped initial chart resizing was rejected because it broke mobile tooltip positioning; its lower stall counts are not the final result.

### Remaining Firefox intervals

All 31 final >50 ms intervals were inspected. The groups below account for every interval; inclusive samples and preceding action names require the interpretation limits above.

| Group | Intervals (ms, rounded) | Evidence / remaining work |
| --- | --- | --- |
| Ordinary UQL workflows | 82, 82, 79, 73, 70, 69, 52 | CodeMirror construction, tokenization/language setup and decoration dispatch. Reusing factor indexes does not remove all editor startup work. |
| Ordinary profile/roster workflows | 58, 52, 52 | Profile layout, chart update/resize and initial large-roster mounting. |
| Profile automation | 58, 55 | Juggler/Playwright evaluation; no application JS sampled in these intervals. |
| Stress: dense Database | 126, 115, 89, 56, 52 | Spark-card DOM creation/updates, rendering/GC and UQL language setup. |
| Stress: timeline/planner | 111, 82, 67 | Mounting 30 planner target rows, building reward groups, and the initial timeline mount. |
| Stress: mobile navigation | 97, 72, 57, 53 | Statistics parsing/mounting and timeline card/render work. |
| Stress: large catalogs | 161, 73, 59 | UQL language/editor setup, first compiler index build and card/render/GC work. |
| Stress: Statistics and route visits | 86, 86, 78, 53 | Timeline reward/render work, Statistics mounting, and two intervals without a useful application stack. Off-thread compilation markers alone do not prove a main-thread compilation bottleneck. |

The next substantial work is editor startup, dense card mounting and planner reward-group construction. Breaking tasks up can improve input responsiveness, but completed-content speed still needs separate verification.

### Unprofiled Chromium at 8× CPU slowdown

Five stress workflows passed functional checks. **6 of 123 native interaction samples exceeded 300 ms**, affecting **6 of 53 measured controls**: All distances 392 ms; Vertical 368 ms; Horizontal 360 ms; Unselect all 344 ms; Pick target character 328 ms; Races 304 ms. The previous baseline had 20/125 samples and 15/54 controls over budget. Browser timing delivery can omit samples below its reporting floor; these are not identical-size statistical samples.

Completed-content measurements expose additional delays:

| Content ready | Final |
| --- | ---: |
| Race history / optimal races | 429 / 231 ms |
| UQL editor / enlarged-catalog UQL editor | 1,494 / 2,841 ms |
| Character / support picker, enlarged catalogs | 617 / 670 ms |
| Planner goal workspace | 295 ms |
| Cold Database / Timeline / Statistics | 1,892 / 2,496 / 1,388 ms |
| Repeat Database / Timeline / Statistics | 773 / 1,265 / 707 ms |

**The 300 ms requirement is not met.** Normal-speed Firefox transitions and throttled Chromium populated-route timings answer different questions. No claim is made that navigation is instant or all jank is gone.

## Verification and local artifacts

- Final beta build: 316 unit tests across 83 files pass; Svelte reports zero errors and warnings. Compressed shell: 55.2 KiB JavaScript, 12.8 KiB CSS, both within budgets.
- Three targeted mobile Chromium chart checks pass at 4× slowdown, covering full-tooltip viewport bounds and member scrolling, source values and touch dismissal, and fan-activity zoom.
- Final Firefox profiles, matching source maps and interval inventories: `.tmp/firefox-final/`; baseline: `.tmp/firefox-before/`.
- Final unprofiled 8× interaction summary and completed-content metrics: `.tmp/firefox-final-chromium-8x/`.
- Reproduction commands and interpretation notes: [performance README](../tests/performance/README.md). Raw profiles and generated test artifacts are intentionally not committed.
