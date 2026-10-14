# Firefox recordings: identified stalls and fixes

The earlier performance audit inspected selected Chromium JavaScript profiles, not every flagged interaction. That was incomplete: input timings alone do not identify a cause, and JavaScript samples do not fully describe layout, paint or garbage collection.

This follow-up inspects the two supplied Firefox recordings, plus five local Chromium stress workflows with JavaScript sampling and browser rendering traces. Shared Firefox data is kept locally; only the uma.moe page's main-thread findings are reported here.

## What the Firefox recordings show

| Recording | Main-thread event delay | Work inside the interval |
| --- | ---: | --- |
| [Veteran/profile recording](https://share.firefox.dev/474N3Nk) | ~55 ms | ~41 ms microtask marker creating/updating veteran cards, including affinity work; ~6.4 ms synchronous reflow follows. |
| [Timeline recording](https://share.firefox.dev/4jdHFyz) | ~103 ms | ~101 ms microtask marker. About 50 ms of sampled inclusive time is in `expectedRecurringRewards`; Global/JP reward matching also appears. An 18.7 ms minor GC occurs in this interval. |
| Same timeline recording | ~63 ms | Card/Svelte updates, style work and animation-frame callbacks. |
| Same timeline recording | ~50 ms | A 50.5 ms Firefox cycle-collection slice, without an application JS stack in that slice. |

These are approximate stalls from the sampled event-delay track, not full click-to-content or INP measurements. Function times are inclusive and overlap; they must not be added together. Network request and CSS animation durations are not themselves CPU stalls. A 55 ms stall can miss multiple display frames despite meeting a 300 ms interaction budget.

## Changes supported by those stacks

- Recurring rewards: index existing reward IDs and matching UTC days once. Remove the candidate-by-reward loop that repeatedly joined text, ran regular expressions and parsed dates. Keep the existing one-day matching window and exact-ID precedence.
- Global/JP rewards: classify each JP row once and precompute Global login dates. The previous nested comparison repeatedly parsed both reward descriptions for every pair.
- Veteran affinity: remove spark decoding from the intermediate record. Affinity uses character relationships and race wins; the query builder already resolves its own sparks. Return stored scores immediately while the affinity resource is unavailable. Existing target/unknown/zero-score and spark-query tests remain valid.
- Diagnostic fixtures now save a browser trace alongside the JS CPU profile, with native console timestamps identifying clicks even when Playwright freezes the date.

## Focused calculation measurements

`node tests/performance/profile-hotspots.mjs` runs serially with production source modules loaded through Vite. Each measurement uses three warmups and the median of 15 samples. The fallback benchmark uses fresh resource identities so it does not measure a cache hit. Baseline: `33306b9`; after: this change, same host, no CPU throttle.

| Calculation | Synthetic workload | Before | After |
| --- | --- | ---: | ---: |
| Reward fallback preparation | 4,000 events and reward rows | 17.31 ms | 5.28 ms |
| Global/JP precedence | 4,000 JP rows and 100 Global login rows | 48.61 ms | 1.99 ms |
| Veteran affinity | 200 calculations, 60 sparks per veteran | 8.32 ms | 1.14 ms |

These isolate calculation savings. They do not claim the entire page or the user's Firefox stall improved by the same percentage. The supplied recordings contain an earlier asset build; they cannot provide an after measurement themselves.

## Other costs revealed by full local traces

At 4× CPU slowdown, the five stress recordings also show UQL field-phrase indexing, compiler name normalization and CodeMirror setup; planner reward-group construction; timeline DOM creation; and chart initialization. These remain separate work. Some very large tasks are Playwright accessibility/locator scans, which must not be attributed to the application. The full-browser trace now makes forced layouts and GC visible alongside the JS samples.

The profile fixes do not establish that every interaction or completed route is below 300 ms under 8× slowdown. Heavy synthetic data, production networking, third-party ads and actual phone hardware remain distinct conditions.

## Verification

- Beta production build: Svelte check reports zero errors/warnings; all 315 unit tests pass. Shell budgets remain 55.2 KiB JavaScript and 12.8 KiB CSS compressed.
- Five stress workflows pass their functional checks at 4× with full profiling enabled (52 native interaction groups, none over 300 ms). This diagnostic run is not a claim about completed-content timing.
- Five stress workflows also pass their functional checks at 8× without profiling, with **15 of 54 measured controls over 300 ms** (20 of 125 native interaction samples). Budget enforcement was disabled to collect the entire run; the budget did not pass. UQL, timeline direction changes, race dialogs, pickers and statistics still appear among the failures. No browser-level speedup is claimed from unmatched single-run timings.
- Four targeted veteran, timeline-detail and planner-reward workflows pass in Firefox 153 and mobile Chromium. The Chromium diagnostic run at 4× has one 320 ms veteran-detail opening among 28 native interaction groups. Firefox required execution outside the Windows sandbox: the sandbox blocked even a blank-page smoke test, before application loading.
- Verified native click timestamps in traces from fixed-date timeline/planner fixtures. These traces include both rendering/GC events and the separate JS CPU recording.
