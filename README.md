# aavegotchi-cli

Agent-first CLI for automating Aavegotchi app/onchain workflows.

## Install

```bash
npm install
```

## Run in dev

```bash
npm run ag -- help
```

## Agent bootstrap (first command to run)

```bash
AGCLI_PRIVATE_KEY=0x... npm run ag -- bootstrap \
  --mode agent \
  --profile prod \
  --chain base \
  --signer env:AGCLI_PRIVATE_KEY \
  --json
```

For read-only flows:

```bash
npm run ag -- bootstrap --mode agent --profile prod --chain base --signer readonly --json
```

## Current commands

- `bootstrap`
- `profile list`
- `profile show [--profile NAME]`
- `profile use --profile NAME`
- `rpc check [--profile NAME]`

## Config path

- default: `~/.aavegotchi-cli/config.json`
- override: `AGCLI_HOME=/custom/path`

## Development

```bash
npm run typecheck
npm test
npm run build
```
