import { CliError } from "./errors";
import { GlobalOptions, JsonValue, OutputEnvelope } from "./types";

function stringifyWithBigInt(input: unknown): string {
    return JSON.stringify(
        input,
        (_, value) => {
            if (typeof value === "bigint") {
                return value.toString();
            }

            return value;
        },
        2,
    );
}

function buildMeta(mode: GlobalOptions["mode"]): OutputEnvelope["meta"] {
    return {
        timestamp: new Date().toISOString(),
        mode,
    };
}

export function outputSuccess(command: string, data: JsonValue, globals: GlobalOptions): void {
    if (globals.json) {
        const envelope: OutputEnvelope = {
            schemaVersion: "1.0.0",
            command,
            status: "ok",
            data,
            meta: buildMeta(globals.mode),
        };

        console.log(stringifyWithBigInt(envelope));
        return;
    }

    console.log(`[ok] ${command}`);
    console.log(stringifyWithBigInt(data));
}

export function outputError(command: string, error: CliError, globals: GlobalOptions): void {
    if (globals.json) {
        const envelope: OutputEnvelope = {
            schemaVersion: "1.0.0",
            command,
            status: "error",
            error: {
                code: error.code,
                message: error.message,
                details: error.details,
            },
            meta: buildMeta(globals.mode),
        };

        console.error(stringifyWithBigInt(envelope));
        return;
    }

    console.error(`[error:${error.code}] ${error.message}`);
    if (error.details) {
        console.error(stringifyWithBigInt(error.details));
    }
}

export function outputHelp(): void {
    console.log(`
Aavegotchi CLI (agent-first foundation)

Usage:
  ag <command> [options]

Core commands:
  bootstrap                         Create/update and activate a profile with RPC/signer preflight
  profile list|show|use|export      Manage profiles
  signer check                      Verify active profile signer backend and account readiness
  signer keychain list|import|remove
  policy list|show|upsert           Manage transaction policies
  rpc check                          Verify RPC connectivity + signer backend health

Tx commands:
  tx send                            Send a raw EVM transaction with simulation + policy checks + journaling
  tx status                          Read tx status by idempotency key/hash or list recent
  tx resume                          Resume waiting for a previously submitted tx
  tx watch                           Poll journal until tx is confirmed

Automation commands:
  batch run --file plan.yaml         Run a YAML execution plan (dependency-aware)

Power-user commands:
  onchain call                       Call any ABI function from --abi-file
  onchain send                       Send any ABI function as a transaction
  subgraph list|check|query          List/check/query canonical Goldsky subgraphs

Domain namespaces:
  gotchi, portal, wearables, items, inventory, baazaar, auction, lending, staking, gotchi-points, realm, alchemica, forge, token
  (many write flows are mapped to onchain send aliases; unmatched commands return typed not-implemented)

Subgraph wrappers:
  baazaar listing get|active|mine    Read Baazaar listing data from core-base subgraph
  auction get|active|mine|bids|bids-mine
                                     Read GBM auction/bid data from gbm-base subgraph

Global flags:
  --mode <agent|human>               Agent mode implies --json --yes
  --json, -j                         Emit JSON envelope output
  --yes, -y                          Skip prompts (write commands assume explicit flags)
  --profile NAME                     Select profile globally

Bootstrap flags:
  --profile NAME                     Profile to create or update (required)
  --chain base|base-sepolia|<id>     Chain key or numeric chain id (default: base)
  --rpc-url URL                      RPC endpoint (optional when chain preset exists)
  --signer readonly|env:VAR|keychain:<id>|ledger[:path|address|bridgeEnv]|remote:<url|address|authEnv>
  --signer-address 0x...             Optional override for remote/ledger signer address
  --signer-auth-env-var ENV_VAR      Optional remote signer bearer token env var
  --signer-bridge-env-var ENV_VAR    Optional ledger bridge command env var name
  --policy NAME                      Policy label (default: default)
  --skip-signer-check                Persist signer config without backend validation

Examples:
  ag bootstrap --mode agent --profile prod --chain base --signer env:AGCLI_PRIVATE_KEY --json
  AGCLI_KEYCHAIN_PASSPHRASE=... AGCLI_PRIVATE_KEY=0x... ag signer keychain import --account-id bot --private-key-env AGCLI_PRIVATE_KEY --json
  ag tx send --profile prod --to 0xabc... --value-wei 1000000000000000 --wait --json
  ag subgraph check --source core-base --json
  ag baazaar listing active --kind erc721 --first 20 --json
  ag auction active --first 20 --json
  ag lending create --profile prod --abi-file ./abis/GotchiLendingFacet.json --address 0xabc... --args-json '[...]' --json
  ag batch run --file ./plan.yaml --json
`);
}
