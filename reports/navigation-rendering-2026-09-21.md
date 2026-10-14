# Immediate route frames and lazy content

## Evidence and changes

The supplied Lineage Planner HAR showed about 233 ms fetching route CSS, followed by 146 ms fetching its JavaScript; artwork requests started around 410 ms. The route was waiting for its implementation before replacing the previous page. The [shared Firefox recording](https://share.firefox.dev/3VqktmZ) also contained a roughly 113 ms main-thread stall involving Clubs mounting 100 cards, repeated number-formatter construction, style calculation and layout. These overlapping CPU intervals are not additive.

- All public routes now commit their destination frame independently of the page-module download. A shared eager boundary displays the destination title/container, gives it a paint, then mounts the implementation. Query changes retain the mounted page and local state. Failed imports show the existing recovery page.
- Timeline's actual heading, tabs, search, direction controls and filter popover are eager. Its content implementation is separate; selections made before it arrives are preserved. The mobile toolbar stays available while loading, and the footer ad still clears it.
- Page code warms sequentially during idle time, pauses when the document is hidden, and respects Save-Data. This imports code without mounting pages or loading their datasets. Hashed assets and native module caching are reused; the UI gallery remains outside this warming list.
- Clubs, Rankings, Activity and the shared table mount rows in automatic scroll batches. Profile sections, lower tier groups, planner targets and offscreen lineage branches mount near the viewport and retain their state once mounted. Existing Timeline windows, Veterans batches, Database factor deferral and lazy Statistics charts remain in use. No Show more control was added.
- Lineage Planner restores its tree before catalogs finish, enriches current edits when data arrives, and only mounts expanded great-grandparent branches. Clubs reuse their number formatters.

## Validation

Local beta production build, mocked APIs and advertising, Pixel 5 Chrome viewport. The 8× CPU measurements ran serially with profiling disabled, in fresh browser contexts, three repeats each. Durations start at the link click and finish after the readiness condition and two animation frames.

| Readiness condition | 8× CPU results |
| --- | --- |
| Destination frame and URL, 16 routes with page code held | 25–183 ms across 48 transitions |
| Timeline tabs/frame with content code held | 168, 180, 171 ms |
| Cached Lineage Planner tree with character catalogs held | 223, 219, 217 ms |

All nine benchmark workflows passed the unchanged 300 ms limit. Frame timing intentionally does not claim that asynchronously loaded page content is complete. Timeline's blocked-download workflow additionally uses its filters before releasing the code and verifies that the selection survives. A separate normal-speed check painted populated cached Timelines with 5 and 1,000 events in 45–66 ms.

The 93-case route/layout/browser pass exercised 81 cases across desktop Chrome, Android Chrome and mobile WebKit; 12 cases were inapplicable on mobile. Four initially failing cases passed targeted reruns after correcting a filter-label locator and checking scroll restoration against the browser's clamped scroll range, including visibility of the last event. Planner target edits, reordering and restored lineage trees also passed on all three browsers.

Static validation reports zero Svelte errors/warnings; all 320 unit tests pass. The beta build and asset budgets pass: base JavaScript 63.8 KiB compressed (100 KiB budget), CSS 15.2 KiB (35 KiB budget).

These are local measurements, not a guarantee for every interaction, device, production dataset or third-party script. No release was performed. Reproduction commands are in [the performance README](../tests/performance/README.md#destination-frame-and-deferred-content).
