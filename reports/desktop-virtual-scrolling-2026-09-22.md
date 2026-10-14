# Desktop virtual scrolling default

Keep virtual scrolling **on by default on mobile and desktop**, with the existing per-device override in Footer → Global settings. No automatic hardware or viewport-based switching is warranted by this comparison. Explicit saved choices continue to win.

## Measured results

Medians of three serial runs per scenario (24 runs total), against the packaged beta build on this Windows desktop using installed headless Chrome, a 1536×960 viewport and no CPU throttling. APIs, catalog data and ads use the existing browser-test fixtures. No build or other browser benchmark ran concurrently.

| Collection | Loaded cards | Virtualization | First cards painted¹ | Retained JS heap² | DOM elements³ | Scroll frame interval p95⁴ |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| Database | 24 | On | 389 ms | 5.55 MiB | 1,198 | 5.8 ms |
| Database | 24 | Off | 406 ms | 12.79 MiB | 6,494 | 5.1 ms |
| Database | 600 | On | 365 ms | 6.28 MiB | 1,198 | 6.3 ms |
| Database | 600 | Off | 2,055 ms | 187.16 MiB | 151,639 | 41.5 ms |
| Veterans | 24 | On | 251 ms | 6.35 MiB | 2,040 | 7.2 ms |
| Veterans | 24 | Off | 295 ms | 10.18 MiB | 5,126 | 5.3 ms |
| Veterans | 600 | On | 263 ms | 6.87 MiB | 2,040 | 8.4 ms |
| Veterans | 600 | Off | 1,631 ms | 122.36 MiB | 116,278 | 27.3 ms |

With 600 Database cards, the median worst scroll frame interval was 15.5 ms with virtualization and 105.8 ms without it; the latter had five intervals over 50 ms per run (median). Veterans' corresponding worst intervals were 31.8 and 44.1 ms. Small lists had no intervals over 50 ms in either mode.

For small lists, virtualization does add some script/layout work as rows are mounted. The measured small-list difference was modest; the large-list savings were substantial even on this desktop. Disabling virtualization globally based on a desktop viewport would expose long browsing sessions to the expensive case. Keep the simple default and manual opt-out rather than introduce device classification or a runtime benchmark for visitors.

## Method and limits

1. Browser navigation start through the first visible card plus two animation frames. Includes application/module/catalog startup with mocked APIs, not just component render time or real network latency. The 600-card payload models a large loaded collection; it does not model incremental network pagination.
2. Chrome's `JSHeapUsedSize` after forced garbage collection, after a 300 ms idle-buffer settling period. This is retained JavaScript heap, **not** total tab/process memory or native DOM/GPU memory.
3. Whole-document element count after initial settling. Initially mounted cards were 3 for Database and 8 for Veterans with virtualization; all loaded cards were mounted without it.
4. Two synthetic scrolling bursts: jump to the list start, then to 80% of its height, advancing 120 px per animation frame for 90 frames in each burst. Reported frame intervals include rendering/scheduling delays. These are comparisons on this browser/host, **not** a universal FPS guarantee or a physical mobile-device measurement; no fixed 60 Hz refresh rate was imposed. Short lists reach their end earlier than large lists, so compare on/off within the same collection size.

The fixtures repeat representative cards. Real images, card complexity, extensions, other tabs and hardware can change absolute values. These measurements support the conservative default, not a claim that every user or every list benefits equally.

## Reproduce

Build beta, serve it on port 4178, and run without another build or browser benchmark in parallel:

```powershell
npm run build:beta
npm run preview -- --host 127.0.0.1 --port 4178
# In a second terminal:
$env:PLAYWRIGHT_BASE_URL = 'http://127.0.0.1:4178'
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
$env:VIRTUAL_SCROLL_BENCHMARK = '1'
node node_modules/@playwright/test/cli.js test tests/e2e/virtual-scroll-benchmark.spec.ts --project=chromium --workers=1 --repeat-each=3 --trace=off --reporter=list
```

Each run prints `VIRTUAL_BENCHMARK` JSON and attaches the same measurements to its test result. The benchmark is opt-in and has no machine-specific timing pass/fail threshold. `VIRTUAL_SCROLL_CPU` optionally sets Chrome's synthetic CPU slowdown; the results above use its default of 1.
