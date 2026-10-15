# Repository preferences

- Open regular pull requests. Use a draft only when explicitly requested.
- Keep the Sentry organization slug and organization domain private. Never include them in public source, commit messages, PR content, or logs. Read the organization from the `SENTRY_ORG` Actions secret and pass build credentials through secret mounts.
- Before publishing Sentry changes, check the diff and PR text for identifying provider values. Do not include private Sentry dashboard links.

# Code quality

Write for the next maintainer. Passing tests and compiling are necessary, but the intent, control flow, and data ownership must also be clear on first read.

- Keep functions and components focused on one responsibility. Extract a part when it has a meaningful job and name; do not split code just to meet a line count or introduce wrappers that only forward arguments.
- Name folders, files, and APIs for their actual responsibility: resource caching, game data, image lookup, query preparation, and so on. Keep infrastructure separate from domain data and page state; update all consumers when moving or renaming code.
- Split crowded existing feature folders into responsibility subfolders, such as `veterans/affinity/`, `veterans/sparks/`, and `veterans/records/`. Keep related implementation, tests, and styles together; reserve the feature root for code that coordinates or spans those responsibilities.
- Use descriptive domain names. Name intermediate calculations and conditions when that explains their purpose better than a dense expression. Comments explain reasons, constraints, and invariants rather than narrating the code.
- Leave one blank line after a completed logical block before the next statement or declaration. Separate setup, execution, and cleanup into readable groups. Keep connected `else`, `catch`, and `finally` clauses together, and keep object/array entries and their closing delimiters together.
- Prefer guard clauses and early returns over deeply nested conditionals. Avoid nested ternaries, compressed multi-statement lines, and long boolean expressions that hide distinct validation steps.
- Default to `const`; use `let` when reassignment is needed. Keep mutation local and explicit. Do not copy large collections or add allocations solely to appear immutable, particularly in chart, replay, and worker code.
- Distinguish missing values from valid falsy values such as `0`, `false`, and empty strings. Use explicit null/undefined checks when absence is the condition; use `Boolean(value)` when truthiness is actually intended. Prefer positive conditions when they make branches easier to follow.
- Use object parameters for long or ambiguous argument lists, especially adjacent booleans or values of the same type. Prefer named result fields when tuple positions need explanation; retain established coordinate and packed-data formats where appropriate.
- Model variants with different required data as discriminated unions. Reuse existing discriminator names and check exhaustive handling with `never`. Simple string unions suffice when cases carry no different payloads.
- Validate external data at repository/service boundaries and narrow `unknown` before use. Reuse existing domain types and validators; do not silence uncertainty with `any`, unchecked casts, or non-null assertions.
- Keep a single simple event action inline. Use a named handler for meaningful branching, shared logic, or an asynchronous workflow. Handle loading, empty, error, and pending states explicitly; preserve cancellation and cleanup. Do not swallow rejected promises or add memoization without a demonstrated need.
- Follow the existing page and repository ownership of requests. Feature components may own independent requests, but do not introduce per-row fetching or assume requests are deduplicated. Share already-loaded data through the existing feature state or context when needed.
- Keep state with its closest meaningful owner. Use context for shared feature state and local state for forms and transient interactions; persistence should follow an actual product requirement.
- Before finishing, read the changed code and its callers as a maintainer: is control flow predictable, are variants explicit, are exceptional states handled, and are responsibilities cohesive? Simplify unclear code and run the relevant checks from `CONTRIBUTING.md`, with focused tests for changed behavior and important edge cases.
- Make tests readable as arrange, act, and assert. Give substantial transformations and results meaningful names before asserting on them, and split tests that cover unrelated behaviors. Keep simple property assertions direct.

# Svelte readability

- Run `npm run format` after editing components or styles; `npm run format:check` must pass.
- Put imports together at the top of each script, followed by props/types, state, derived values, handlers, and lifecycle hooks. Keep related feature code together.
- Write Svelte branches and loops on separate, indented lines. Keep CSS declarations on separate lines.
- Pages compose sections and coordinate routing and data requests. Keep components with their feature and organize crowded directories by purpose.
- Keep a component when it is reused, owns meaningful behavior, or makes a large feature easier to follow. Use a local snippet for repeated markup with one owner; avoid forwarding wrappers and components for arbitrary elements.
- Put substantial styles in a named CSS file beside their component and load them with `@import` inside `<style>` to retain Svelte scoping. Compact styles can stay inline. Share repeated feature rules in a feature stylesheet; do not turn component styles into global imports.
- Use the existing `.sr-only` utility for visually hidden labels and descriptions.
- Use existing domain helpers and repositories; update all callers, worker URLs, tests, and UI-gallery paths when moving files.
- Preserve reactive dependencies, bindings, request ordering, cleanup, validation, accessibility, and scoped styles when moving code.
- See [CONTRIBUTING.md](CONTRIBUTING.md) for the source layout and checks.

When connected to the svelte-llm MCP server, you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available MCP Tools:

### 1. list_sections
Use this FIRST to discover all available documentation sections. Returns a structured list with titles and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get_documentation
Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list_sections tool, you MUST analyze the returned documentation sections and then use the get_documentation tool to fetch ALL documentation sections that are relevant for the users task.
