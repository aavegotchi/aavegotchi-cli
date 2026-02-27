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
- `policy list|show|upsert`
- `rpc check`
- `tx send|status|resume|watch`
- `batch run --file plan.yaml`
- `onchain call|send`

Planned domain namespaces are stubbed for parity tracking:

- `gotchi`, `portal`, `wearables`, `items`, `inventory`, `baazaar`, `lending`, `realm`, `alchemica`, `forge`, `token`

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
npm run ag -- help
```
