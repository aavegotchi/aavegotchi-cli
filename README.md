# aavegotchi-cli

Agent-first CLI for automating Aavegotchi app and onchain workflows on Base.

## Install

```bash
npm install -g aavegotchi-cli
```

For local development:

```bash
npm install
```

## First command an agent should run

```bash
AGCLI_PRIVATE_KEY=0x... npm run ag -- bootstrap \
  --mode agent \
  --profile prod \
  --chain base \
  --signer env:AGCLI_PRIVATE_KEY \
  --policy default \
  --json
```

For read-only automation:

```bash
npm run ag -- bootstrap --mode agent --profile prod --chain base --signer readonly --json
```

## Command surface (v0.2.0)

- `bootstrap`
- `profile list|show|use|export`
- `signer check`
- `signer keychain list|import|remove`
- `policy list|show|upsert`
- `rpc check`
- `tx send|status|resume|watch`
- `batch run --file plan.yaml`
- `onchain call|send`
- `subgraph list|check|query`
- `baazaar listing get|active|mine` (subgraph-first read wrappers)
- `auction get|active|mine|bids|bids-mine` (subgraph-first read wrappers)
- `<domain> read` (routes to generic onchain call for that domain)

Planned domain namespaces are stubbed for parity tracking:

- `gotchi`, `portal`, `wearables`, `items`, `inventory`, `baazaar`, `auction`, `lending`, `staking`, `gotchi-points`, `realm`, `alchemica`, `forge`, `token`

Many Base-era write flows are already executable as mapped aliases in those namespaces (internally routed through `onchain send`).
Example: `ag lending create --abi-file ./abis/GotchiLendingFacet.json --address 0x... --args-json '[...]' --json`

## Command help and discoverability

The CLI supports command-targeted help:

```bash
ag --help
ag tx send --help
ag help baazaar buy-now
```

Mapped write commands now expose their onchain function mapping and required flags:

```bash
ag baazaar buy-now --help
```

If you provide `--abi-file` with `--help`, the CLI prints ABI-derived function signature and input names for the mapped method:

```bash
ag baazaar buy-now --help --abi-file ./abis/BaazaarFacet.json
```

Unknown commands return suggestions:

```bash
ag tx snd --json
```

## Dry-run writes

Use `--dry-run` on write commands to run full preflight without broadcasting:

- runs simulation (`eth_call`)
- runs gas + fee estimation
- enforces policy checks
- resolves nonce
- returns `status: \"simulated\"` with simulation details

Supported write surfaces:

- `tx send --dry-run`
- `onchain send --dry-run`
- mapped write aliases (for example: `token approve --dry-run`)

Safety rule:

- `--dry-run` cannot be combined with `--wait` / `--confirm`

## Subgraph sources and endpoint policy

Canonical source aliases:

- `core-base` -> `https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn`
- `gbm-base` -> `https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-gbm-baazaar-base/prod/gn`

Default policy is strict allowlist:

- Non-canonical subgraph URLs are blocked by default (`SUBGRAPH_ENDPOINT_BLOCKED`)
- Override is explicit and per-command only: pass both `--subgraph-url <https-url>` and `--allow-untrusted-subgraph`
- Non-HTTPS custom URLs are rejected

Auth:

- Public Goldsky endpoints work without auth
- If `GOLDSKY_API_KEY` is set, CLI injects `Authorization: Bearer <token>`
- Override env var name per command with `--auth-env-var <ENV>`

## Subgraph command examples

List configured canonical sources:

```bash
npm run ag -- subgraph list --json
```

Check source reachability/introspection:

```bash
npm run ag -- subgraph check --source core-base --json
```

Run custom GraphQL query:

```bash
npm run ag -- subgraph query \
  --source gbm-base \
  --query 'query($first:Int!){ auctions(first:$first){ id } }' \
  --variables-json '{"first":5}' \
  --json
```

Baazaar wrappers:

```bash
npm run ag -- baazaar listing active --kind erc721 --first 20 --skip 0 --json
npm run ag -- baazaar listing mine --kind erc1155 --seller 0x... --json
npm run ag -- baazaar listing get --kind erc721 --id 123 --verify-onchain --json
```

GBM wrappers:

```bash
npm run ag -- auction active --first 20 --json
npm run ag -- auction bids --auction-id 123 --json
npm run ag -- auction get --id 123 --verify-onchain --json
```

Raw GraphQL passthrough (typed projection remains included):

```bash
npm run ag -- auction active --first 5 --raw --json
```

## Signer backends

- `readonly` (read-only mode)
- `env:ENV_VAR` (private key from env var)
- `keychain:ACCOUNT_ID` (encrypted local key store; requires `AGCLI_KEYCHAIN_PASSPHRASE`)
- `remote:URL|ADDRESS|AUTH_ENV` (HTTP signer service)
- `ledger:DERIVATION_PATH|ADDRESS|BRIDGE_ENV` (external bridge command signer)
- `bankr[:ADDRESS|API_KEY_ENV|API_URL]` (Bankr-native signer via `/agent/me` + `/agent/submit`; defaults: `BANKR_API_KEY`, `https://api.bankr.bot`)

Remote signer contract:

- `GET /address` -> `{ "address": "0x..." }` (optional if address configured)
- `POST /sign-transaction` -> `{ "rawTransaction": "0x..." }` or `{ "txHash": "0x..." }`

Bankr signer contract:

- `GET /agent/me` -> resolves wallet address when signer address is not pinned
- `POST /agent/submit` -> submits transaction and returns transaction hash
- auth header: `x-api-key: <BANKR_API_KEY>`

Bankr bootstrap example:

```bash
BANKR_API_KEY=... \
npm run ag -- bootstrap --mode agent --profile bankr --chain base --signer bankr --json
```

Ledger bridge contract:

- Set `AGCLI_LEDGER_BRIDGE_CMD` (or custom env var in signer config) to a command that reads tx payload JSON from stdin and outputs JSON containing either `rawTransaction` or `txHash`.

Keychain import example:

```bash
AGCLI_KEYCHAIN_PASSPHRASE=your-passphrase \
AGCLI_PRIVATE_KEY=0x... \
npm run ag -- signer keychain import --account-id bot --private-key-env AGCLI_PRIVATE_KEY --json
```

## Agent-mode behavior

`--mode agent` implies:

- `--json`
- `--yes`

All successful/error responses use a stable envelope:

```json
{
  "schemaVersion": "1.0.0",
  "command": "tx send",
  "status": "ok",
  "data": {},
  "meta": { "timestamp": "...", "mode": "agent" }
}
```

## Config and journal

- Config default path: `~/.aavegotchi-cli/config.json`
- Journal default path: `~/.aavegotchi-cli/journal.sqlite`
- Override both via `AGCLI_HOME=/custom/path`

## Parity artifacts

- Method inventory: [`docs/parity/base-method-inventory.md`](docs/parity/base-method-inventory.md)
- Command mapping: [`docs/parity/base-command-matrix.md`](docs/parity/base-command-matrix.md)
- Subgraph endpoints/policy: [`docs/subgraph/endpoints-and-policy.md`](docs/subgraph/endpoints-and-policy.md)
- Subgraph query matrix: [`docs/subgraph/query-matrix.md`](docs/subgraph/query-matrix.md)

Raffle/ticket flows are intentionally excluded for Base-era scope.

## Development

```bash
npm run typecheck
npm test
npm run build
npm run parity:check
npm run smoke:write-dryrun
npm run ag -- help
```

Write dry-run smoke test notes:

- `npm run smoke:write-dryrun` validates write paths without broadcasting any transaction.
- To run against an installed binary instead of local source:
  - `AG_BIN=/absolute/path/to/ag npm run smoke:write-dryrun`
