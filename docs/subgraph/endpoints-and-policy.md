# Subgraph Endpoints and Policy

## Canonical aliases

- `core-base`
  - `https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn`
- `gbm-base`
  - `https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-gbm-baazaar-base/prod/gn`

## Security model (v0.2.0)

- Default: strict allowlist for canonical endpoints only.
- Custom endpoint requires both:
  - `--subgraph-url <https-url>`
  - `--allow-untrusted-subgraph`
- Custom non-HTTPS endpoint is rejected.

## Auth behavior

- Endpoint works without auth by default.
- CLI injects bearer auth only when env var exists.
  - Default env var: `GOLDSKY_API_KEY`
  - Per-command override: `--auth-env-var <ENV>`

## Core flags

- `--timeout-ms <ms>`
- `--raw`
- `--subgraph-url <url> --allow-untrusted-subgraph`
- `--auth-env-var <ENV>`

## Error codes

- `SUBGRAPH_SOURCE_UNKNOWN`
- `SUBGRAPH_ENDPOINT_BLOCKED`
- `SUBGRAPH_TIMEOUT`
- `SUBGRAPH_HTTP_ERROR`
- `SUBGRAPH_GRAPHQL_ERROR`
- `SUBGRAPH_INVALID_RESPONSE`
- `SUBGRAPH_VERIFY_MISMATCH`
- `INVALID_VARIABLES_JSON`
