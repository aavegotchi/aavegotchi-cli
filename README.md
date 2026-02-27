# aavegotchi-cli

Agent-first CLI for automating Aavegotchi app and onchain workflows on Base.

## Install

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

## Command surface (current)

- `bootstrap`
- `profile list|show|use|export`
- `signer check`
- `signer keychain list|import|remove`
- `policy list|show|upsert`
- `rpc check`
- `tx send|status|resume|watch`
- `batch run --file plan.yaml`
- `onchain call|send`
- `<domain> read` (routes to generic onchain call for that domain)

Planned domain namespaces are stubbed for parity tracking:

- `gotchi`, `portal`, `wearables`, `items`, `inventory`, `baazaar`, `auction`, `lending`, `staking`, `gotchi-points`, `realm`, `alchemica`, `forge`, `token`

Many Base-era write flows are already executable as mapped aliases in those namespaces (internally routed through `onchain send`).
Example: `ag lending create --abi-file ./abis/GotchiLendingFacet.json --address 0x... --args-json '[...]' --json`

## Signer backends

- `readonly` (read-only mode)
- `env:ENV_VAR` (private key from env var)
- `keychain:ACCOUNT_ID` (encrypted local key store; requires `AGCLI_KEYCHAIN_PASSPHRASE`)
- `remote:URL|ADDRESS|AUTH_ENV` (HTTP signer service)
- `ledger:DERIVATION_PATH|ADDRESS|BRIDGE_ENV` (external bridge command signer)

Remote signer contract:

- `GET /address` -> `{ "address": "0x..." }` (optional if address configured)
- `POST /sign-transaction` -> `{ "rawTransaction": "0x..." }` or `{ "txHash": "0x..." }`

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

Raffle/ticket flows are intentionally excluded for Base-era scope.

## Development

```bash
npm run typecheck
npm test
npm run build
npm run parity:check
npm run ag -- help
```
