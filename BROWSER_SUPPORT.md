# Browser compatibility

Production builds have two outputs. The modern build targets Chromium 109
(Chrome, Edge, Brave), Firefox 115 ESR, Safari 16.4 and iOS 16.4 or newer.
Chromium 109 and Firefox 115 ESR cover the last official browser generations for
Windows 7. Older phones and browsers, down to iOS 12.2, Safari 12.1, Chrome 64,
Edge 79 and Firefox 68, run the compatibility build. Internet Explorer is not
supported.

Vite's legacy plugin scans all built JavaScript, including dependencies and lazy
pages, and loads the required core-js polyfills before the modern build. The
compatibility build is the same app transpiled by Babel for the older targets,
with core-js polyfills for everything it uses.
`src/services/browser-support/compatibility-polyfills.js` adds the browser APIs
core-js does not cover: ResizeObserver, `<dialog>`, `crypto.randomUUID`,
`AbortSignal.timeout` and media query change listeners. OddBird supplies the
Popover API in both builds when native support is missing; shared popup
positioning accounts for its lack of a native top layer.

An inline script in `index.html` picks the build before any module runs. It
checks for features the modern build uses without polyfills (regex lookbehind,
`AbortSignal.timeout`, `Array.prototype.findLast`) and records the result on
`<html data-app-build>`. Modern browsers download only the modern files; the
performance budget counts only those. In the compatibility build,
`modern-build-guard.ts` stops the modern entry before it starts, and the error
fallback ignores the modern files that browser cannot parse. Sentry tags each
event with `app.build`.

The compatibility build still needs Web Workers. The simulator report workers
are created as module workers, which Safari only supports from 15. The simulator
build codes need `CompressionStream`, which Safari only supports from 16.4.
Older-browser verification must use a production build, not Vite's dev server.

The independent HTML fallback handles app startup, rendering and uncaught
runtime failures. It offers reload and support links, includes browser/build
details, omits URL query strings and does not clear saved plans. Page download
failures also retain the existing in-app retry screen. The fallback is reserved
for app crashes: an error whose stack passes through another origin's script
(ads, providers, extensions) never triggers it. All Sentry SDK code is bundled
into `sentry-sdk-*` chunks so the fallback and Sentry's filters can skip its
wrapper frames.

Run `npm run build`, then `npm run test:e2e -- tests/e2e/browser-compatibility.spec.ts tests/e2e/startup-failure.spec.ts --project=chromium`.
Set `PLAYWRIGHT_BASE_URL` to an existing preview server to avoid rebuilding.
Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an older Chromium executable to run the
same tests and existing workflow tests on the actual engine. The compatibility
tests also remove the reported APIs on current browsers to exercise polyfills,
and remove `AbortSignal.timeout` to start the compatibility build.

Polyfills cover JavaScript APIs, not every CSS feature or third-party service's
browser policy. Stylesheets are lowered for the compatibility targets where
esbuild can (nesting, `inset`, colour syntax, vendor prefixes), but older
engines still miss layout features such as flex `gap` before Safari 14.1, `:has()`
and container queries. Keep critical flows usable when newer visual features are
absent.
