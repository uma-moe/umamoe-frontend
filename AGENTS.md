# Repository preferences

- Open regular pull requests. Use a draft only when explicitly requested.
- Keep the Sentry organization slug and organization domain private. Never include them in public source, commit messages, PR content, or logs. Read the organization from the `SENTRY_ORG` Actions secret and pass build credentials through secret mounts.
- Before publishing Sentry changes, check the diff and PR text for identifying provider values. Do not include private Sentry dashboard links.

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
