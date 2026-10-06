# Repository preferences

- Open regular pull requests. Use a draft only when explicitly requested.
- Keep the Sentry organization slug and organization domain private. Never include them in public source, commit messages, PR content, or logs. Read the organization from the `SENTRY_ORG` Actions secret and pass build credentials through secret mounts.
- Before publishing Sentry changes, check the diff and PR text for identifying provider values. Do not include private Sentry dashboard links.
