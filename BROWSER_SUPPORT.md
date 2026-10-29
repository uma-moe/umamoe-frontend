# Browser compatibility

Production builds target Chromium 109 (Chrome, Edge, Brave), Firefox 115 ESR,
Safari 16.4 and iOS 16.4 or newer. Chromium 109 and Firefox 115 ESR cover the last
official browser generations for Windows 7. Internet Explorer is not supported.

Vite's legacy plugin scans all built JavaScript, including dependencies and lazy
pages, and loads the required core-js polyfills before the app. It produces a
single module build. OddBird supplies the Popover API when native support is
missing; shared popup positioning accounts for its lack of a native top layer.
Older-browser verification must use a production build, not Vite's dev server.

The independent HTML fallback handles app startup, rendering and uncaught
runtime failures. It offers reload and support links, includes browser/build
details, omits URL query strings and does not clear saved plans. Page download
failures also retain the existing in-app retry screen. Third-party script errors
do not trigger the app fallback on their own.

Run `npm run build`, then `npm run test:e2e -- tests/e2e/browser-compatibility.spec.ts tests/e2e/startup-failure.spec.ts --project=chromium`.
Set `PLAYWRIGHT_BASE_URL` to an existing preview server to avoid rebuilding.
Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an older Chromium executable to run the
same tests and existing workflow tests on the actual engine. The compatibility
tests also remove the reported APIs on current browsers to exercise polyfills.

Polyfills cover JavaScript APIs, not every CSS feature or third-party service's
browser policy. Keep critical flows usable when newer visual features are absent.
