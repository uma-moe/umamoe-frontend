# uma.moe auth.md

This document describes access for scripts, integrations, and AI agents using the uma.moe API.

## Public sources

Public guides, `llms.txt`, `/meta/` navigation metadata, and the `/.well-known/` discovery catalogs require no credentials. They do not contain private account records.

## API key provisioning

An account owner signs in at https://uma.moe/login using Google or Discord, opens https://uma.moe/settings, and creates a named key in the API Keys section. The complete key is displayed once. The owner can revoke it in the same section.

Keys are provisioned by a signed-in account owner. uma.moe does not provide anonymous agent registration, an OAuth authorization server, or an MCP server. Google and Discord login authenticate the website user; they are not uma.moe OAuth grant endpoints for agents.

## Credential use

Send the key in the `X-API-Key` request header to documented endpoints on https://uma.moe. Keep keys out of URLs, page content, public logs, and AI answers.

Use https://uma.moe/api/docs and https://uma.moe/api/docs/openapi.yaml for request parameters and responses. The API definition identifies endpoints that do not require a protection header. Respect API errors and access limits. Private account data requires the account owner's authorization.
