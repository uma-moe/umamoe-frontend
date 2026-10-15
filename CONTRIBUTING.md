# Working on the frontend

Start with the route's `*Page.svelte` in `src/pages/`. Shared UI lives in `src/components/`, page frames in `src/layouts/`, domain calculations in `src/lib/`, and HTTP access in repositories and `src/services/`.

Find components by purpose: `components/controls/`, `overlays/`, `navigation/`, `feedback/`, `cards/`, `data/`, `charts/`, `pickers/`, `filters/`, `sparks/`, `lineage/`, and `game/`. Existing specialized editors, parent pickers, and tours keep their own folders. Imports point directly to the implementation; there are no forwarding files at the old paths.

Crowded pages are organized by feature. A page file composes sections and coordinates routing and data; each subfolder holds one part of the page with its components, styles, state classes (`*.svelte.ts`), and helpers:

- `pages/database/`: the page and repositories, with `search/` (filter, search, and layout state), `filters/`, `results/`, and `uql/`.
- `pages/profile/`: the page and profile context, with `overview/`, `cm-logs/`, and `veterans/` (`roster/` and `details/`).
- `pages/competitive/`: routed pages and shared data, with `champions-meeting/` (`archetypes/`, `uma/`, `skills/`, `strategy/`, `lobby/`), `race-analysis/` (`replay/`, `diagnostics/`, `results/`), `runners/`, and `sessions/`.
- `pages/simulator/`: routed pages and shared state, with `setup/` (`runner/`, `hp/`, `build/`, `veterans/`), `courses/`, `requests/`, `shell/`, and `reports/`. Reports group outcomes, skills, replay, and telemetry with their related calculations and tests.
- `pages/carat-planner/`: the planner shell, with `setup/`, `manager/`, `goals/`, `income/`, `rewards/`, and `cloud/`. Its calculations live in `lib/carat-planner/`.
- `pages/timeline/`: the page and content, with `board/`, `controls/`, and `details/`.
- Smaller pages use one subfolder for their sections, such as `statistics/sections/`, `clubs/details/`, and `lineage-planner/tree/`.

Domain code in `src/lib/` follows the same features (`lib/carat-planner/rewards/`, `lib/inheritance/uql/`). Services group by concern (`services/sentry/`, `services/analytics/`, `services/auth/`), and ad slots live in `layouts/ads/`.

For example, `src/pages/settings/SettingsPage.svelte` handles authentication and composes linked accounts, connected logins, and API keys. Each settings component owns that feature's loading state, actions, and markup. Shared settings styles live beside them in `settings.css`, scoped under `.settings-page`.

## Component structure

Read a component from top to bottom: imports, props and types, local state, derived values, event handlers, lifecycle hooks, markup, then its style block or stylesheet reference. Keep related feature code together so readers can follow its data flow without jumping around the file.

Write nested elements, Svelte branches, and loops on separate lines. Expand event handlers with multiple statements and put each CSS declaration on its own line. Prettier handles indentation and wrapping; a multi-line Svelte branch stays multi-line.

Keep a component when it is reused, owns meaningful behavior, or makes a large feature easier to follow. An independent section such as `database/filters/DatabasePropertyFilters.svelte` can own its controls and related state. Repeated markup with one owner, such as metric help in `ReplayDiagnostics.svelte`, belongs in a named local snippet. A component that only forwards props or wraps one element usually adds a file without helping the reader.

## Styles

Long style blocks live in a named CSS file beside their component. The component loads that file through its Svelte style block:

```svelte
<style>
  @import './race-replay.css';
</style>
```

The installed Vite preprocessor reads the stylesheet before Svelte scopes it. This retains component isolation, dependency tracking, and source maps. Keep short styles inline. Shared feature rules, such as simulator calculator layout and stamina editor panels, use a shared CSS file imported through each component's style block.

Use a global import only for site-wide styles or deliberately bounded feature styles such as `settings.css` under `.settings-page`. Shared visually hidden labels use the existing `.sr-only` utility in `styles/global.css`; do not duplicate that rule in components.

## Behavior

Keep calculations and API details in the existing helpers and repositories. Preserve bindings, request counters, cancellation, teardown, validation, keyboard access, and CSS scope when moving code. Update every importer, dynamic import, worker URL, and UI-gallery source path. Extra comments do not replace a clear structure.

## Checks

```sh
npm run format
npm run format:check
npm run check
npm run test:run
```

The formatting workflow checks Svelte files and styles on pull requests. For changes to page structure or interactions, also run the relevant tests in `tests/e2e/` on desktop and mobile:

```sh
npm run test:e2e -- tests/e2e/settings-parity.spec.ts tests/e2e/settings-concurrency.spec.ts --project=chromium --project=mobile-chromium
```
