import { CliError } from "./errors";
import { GlobalOptions, JsonValue, OutputEnvelope } from "./types";

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

        console.log(JSON.stringify(envelope, null, 2));
        return;
    }

    console.log(`[ok] ${command}`);
    console.log(JSON.stringify(data, null, 2));
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

        console.error(JSON.stringify(envelope, null, 2));
        return;
    }

    console.error(`[error:${error.code}] ${error.message}`);
    if (error.details) {
        console.error(JSON.stringify(error.details, null, 2));
    }
}

export function outputHelp(): void {
    console.log(`
Aavegotchi CLI (agent-first foundation)

Usage:
  ag <command> [options]

Commands:
  bootstrap                   Create/update and activate a profile with RPC/signer preflight
  profile list                List profiles
  profile show [--profile]    Show a profile (or active profile)
  profile use --profile NAME  Set active profile
  rpc check [--profile NAME]  Verify current RPC and chain connectivity

Global flags:
  --mode <agent|human>        Agent mode implies --json --yes
  --json, -j                  Emit JSON envelope output
  --yes, -y                   Skip confirmation prompts (reserved for next write commands)
  --profile NAME              Select profile globally

Bootstrap flags:
  --profile NAME              Profile to create or update (required)
  --chain base|base-sepolia   Chain key (default: base)
  --rpc-url URL               RPC endpoint (optional when chain preset exists)
  --signer readonly|env:VAR   Signer backend (default: readonly)
  --policy NAME               Policy label (default: default)

Examples:
  ag bootstrap --mode agent --profile prod --chain base --signer env:AGCLI_PRIVATE_KEY --json
  ag profile list --json
`);
}
