# Mobile interaction stress test - 20 September 2026

Database sparks, Timeline switching and Planner edits now do substantially less main-thread work. Character/support pickers, parent lists, Statistics rankings and planner rewards load additional entries automatically as they become visible. Pickers still search the complete catalog; keyboard navigation can reveal later entries without a “Show more” button.

## Method

Production beta builds, Chromium, Pixel 5 touch viewport, 8× CPU slowdown, one worker. Direction switching also uses a 1536 × 960 viewport at the same slowdown. The workload contains 1,200 database records (12 → 36 retained during the test), 4,000 timeline events/reward rows, 30 planner targets, and large synthetic catalog/statistics datasets. Full setup and rerun commands are in [the benchmark README](../tests/performance/README.md).

Before: one complete profiled baseline at commit `2ce6154c1c8ccdda3d04777b222233c07b962ee2`. After: median and range from three fresh runs of the implementation accompanying this report. Both use the same stress data and 8× slowdown. The baseline was not repeated three times, so small differences should not be treated as established gains. All figures are milliseconds.

The interaction measurement runs from the capture listener to a frame/timer callback. It approximates handler-to-next-paint latency and includes any overlapping work. It is not field INP, input-delay measurement, or a real phone benchmark. Backend responses, browser verification and ads are mocked; network latency and real publisher/CMP behavior are outside this test.

## Matched interactions

| Interaction | Before, one run | After, median of 3 | After range |
| --- | ---: | ---: | ---: |
| timeline filters | 220 | 104 | 78–111 |
| timeline unselect | 188 | 112 | 109–127 |
| timeline select | 658 | 342 | 337–343 |
| planner tab | 232 | 129 | 128–140 |
| planner pulls | 9867 | 893 | 875–893 |
| planner goals expand | 694 | 365 | 310–387 |
| planner desired copies | 5008 | 333 | 317–353 |
| planner rate-up picker | 333 | 194 | 158–272 |
| timeline tab return | 418 | 239 | 234–248 |
| timeline vertical | 7764 | 785 | 771–793 |
| timeline horizontal | 1292 | 671 | 667–687 |
| spark per run | 1407 | 87 | 76–94 |
| spark occurrences | 1026 | 67 | 64–71 |
| collapse whites | 622 | 41 | 40–48 |
| display options | 446 | 58 | 57–81 |
| focus main | 1876 | 128 | 106–140 |
| focus all | 2899 | 133 | 130–173 |
| filters | 591 | 145 | 141–146 |
| advanced | 4715 | 74 | 72–79 |
| character picker | 1421 | 191 | 185–207 |
| UQL open | 1202 | 481 | 457–489 |
| 36 cards per inheritance | 2836 | 92 | 87–96 |
| statistics Supports | 322 | 180 | 176–189 |
| statistics Skills | 159 | 89 | 85–89 |
| statistics Stats | 134 | 485 | 470–546 |
| statistics Overview | 424 | 221 | 208–443 |
| statistics Sprint | 386 | 223 | 211–251 |
| statistics All distances | 563 | 317 | 303–348 |

The Statistics “Stats” tab sample is slower than the single baseline sample (485 ms versus 134 ms). It is a remaining chart-rendering hotspot; the general interaction timer does not separately measure asynchronous chart completion. No improvement is claimed for that interaction.

## Additional large-catalog interactions

These scenarios were added during the investigation; they have no original-commit baseline. Character/support lists initially mount 36 entries and append on scrolling, with tests also finding entries outside that batch.

| Interaction | Median of 3 | Range |
| --- | ---: | ---: |
| large character picker | 981 | 973–990 |
| character search | 85 | 75–86 |
| large support picker | 617 | 553–647 |
| support search | 51 | 45–56 |
| factor OR | 37 | 36–38 |
| factor AND | 23 | 23–24 |
| large UQL open | 336 | 252–856 |

## Mobile route navigation

Click until populated content is verified: 12 database cards with visible sparks, a visible timeline event, or the selected statistics sample count. Includes Playwright readiness polling overhead. “First visit” and “repeat visit” describe visits in the same test session, not fresh loads of the entire site. These navigation measurements were added after the original baseline; they are not a before/after comparison.

| Route | First visit median | Repeat visit median |
| --- | ---: | ---: |
| /database | 1981 | 1074 |
| /timeline | 2323 | 950 |
| /tools/statistics | 1527 | 625 |

Route content is not instant under this severe slowdown. The shell and loading feedback can paint before the full dataset. First visits still pay for lazy module downloads, parsing and initial rendering. The largest planner and vertical-timeline updates also remain measurable under 8× slowdown; these numbers do not promise identical production timings.

## What changed

- Reuse spark number formatters, avoid deep proxies on immutable result snapshots, and defer offscreen spark rendering. Already-visible card state is retained.
- Render visible date rows inside large vertical timeline months instead of mounting an entire month; preserve Today, scrolling and direction changes.
- Index timeline event lookups, reuse immutable reward summaries/catalogs, and stop rebuilding reward descriptions for unrelated pull-count or balance changes. Refreshed resource snapshots invalidate the cached work.
- Begin route/data preload on touch-down, reuse Statistics catalog preparation, and preserve existing route loading/error feedback.
- Replace manual list expansion with native IntersectionObserver-driven batches. Existing search and selection behavior remains available.

## Verification and artifacts

The final stress run passed all 15 scenarios (five scenarios × three repeats). Functional checks cover desktop Chrome, mobile Chrome and WebKit, including lazy picker scrolling/keyboard access, planner rewards, Statistics, Timeline navigation, database controls and UQL download failure recovery. Unit suite: 313 passing tests; Svelte check: zero errors and warnings. Production build and shell size budgets passed.

Raw local profiles and metrics: `.tmp/stress-baseline-final/` and `.tmp/stress-release/`. The compact action samples and route times are retained in [the result data](mobile-interactions-2026-09-20.json). Profiles can be opened in Chrome DevTools; CodeMirror typing should be read from Event Timing keydown entries, not native input events.
