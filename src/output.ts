import { getFlagString } from "./args";
import {
    formatAbiFunctionInputs,
    formatAbiFunctionSignature,
    getAbiFunctionEntries,
    parseAbiFile,
} from "./abi";
import { suggestCommands } from "./command-catalog";
import { getMappedWriteDefaults } from "./commands/mapped-defaults";
import { findMappedFunction, listMappedCommandsForRoot } from "./commands/mapped";
import { isDomainStubRoot } from "./commands/stubs";
import { CliError } from "./errors";
import { FlagValue, GlobalOptions, JsonValue, OutputEnvelope } from "./types";

type Flags = Record<string, FlagValue>;

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

function toLines(items: string[], prefix = "  "): string {
    if (items.length === 0) {
        return `${prefix}(none)`;
    }

    return items.map((item) => `${prefix}${item}`).join("\n");
}

function buildGlobalHelpText(): string {
    return `
Aavegotchi CLI (agent-first foundation)

Usage:
  ag <command> [options]
  ag <command> --help
  ag help <command>

Core commands:
  bootstrap
  profile list|show|use|export
  signer check
  signer keychain list|import|remove
  policy list|show|upsert
  rpc check

Tx commands:
  tx send|status|resume|watch

Automation commands:
  batch run --file plan.yaml

Power-user commands:
  onchain call|send
  subgraph list|check|query

Subgraph wrappers:
  baazaar listing get|active|mine
  auction get|active|mine|bids|bids-mine
  auction bid|bid-unbid

Domain namespaces:
  gotchi, portal, wearables, items, inventory, baazaar, auction, lending, staking, gotchi-points, realm, alchemica, forge, token
  (many write flows are mapped aliases that route through onchain send)

Global flags:
  --mode <agent|human>   Agent mode implies --json --yes
  --json, -j             Emit JSON envelope output
  --yes, -y              Skip prompts
  --profile NAME         Select profile globally
  --help, -h             Show command-specific help

Examples:
  ag bootstrap --profile prod --chain base --signer readonly --json
  ag tx send --profile prod --to 0xabc... --value-wei 0 --dry-run --json
  ag onchain send --profile prod --abi-file ./abi.json --address 0xabc... --function approve --args-json '["0xdef...", "1"]' --dry-run --json
  BANKR_API_KEY=... ag bootstrap --profile bankr --chain base --signer bankr --json
  ag baazaar buy-now --help
  ag help tx send
`;
}

const STATIC_HELP: Record<string, string> = {
    bootstrap: `
Usage:
  ag bootstrap --profile <name> [--chain <base|base-sepolia|id>] [--rpc-url <url>] [--signer <config>] [--env-file <path>] [--policy <name>] [--skip-signer-check] [--json]

Required:
  --profile <name>

Signer formats:
  readonly
  env:ENV_VAR
  keychain:ACCOUNT_ID
  ledger[:DERIVATION_PATH|ADDRESS|BRIDGE_ENV_VAR]
  remote:URL|ADDRESS|AUTH_ENV_VAR
  bankr[:ADDRESS|API_KEY_ENV|API_URL]
`,
    profile: `
Usage:
  ag profile list [--json]
  ag profile show [--profile <name>] [--json]
  ag profile use --profile <name> [--json]
  ag profile export [--profile <name>] [--json]
`,
    "profile list": `
Usage:
  ag profile list [--json]
`,
    "profile show": `
Usage:
  ag profile show [--profile <name>] [--json]
`,
    "profile use": `
Usage:
  ag profile use --profile <name> [--json]
`,
    "profile export": `
Usage:
  ag profile export [--profile <name>] [--json]
`,
    signer: `
Usage:
  ag signer check [--profile <name>] [--json]
  ag signer keychain list [--json]
  ag signer keychain import --account-id <id> --private-key-env <ENV> [--json]
  ag signer keychain remove --account-id <id> [--json]
`,
    "signer check": `
Usage:
  ag signer check [--profile <name>] [--json]
`,
    "signer keychain": `
Usage:
  ag signer keychain list [--json]
  ag signer keychain import --account-id <id> --private-key-env <ENV> [--json]
  ag signer keychain remove --account-id <id> [--json]
`,
    "signer keychain list": `
Usage:
  ag signer keychain list [--json]
`,
    "signer keychain import": `
Usage:
  ag signer keychain import --account-id <id> --private-key-env <ENV> [--json]
`,
    "signer keychain remove": `
Usage:
  ag signer keychain remove --account-id <id> [--json]
`,
    policy: `
Usage:
  ag policy list [--json]
  ag policy show --policy <name> [--json]
  ag policy upsert --policy <name> [--max-value-wei <wei>] [--max-gas-limit <gas>] [--max-fee-per-gas-wei <wei>] [--max-priority-fee-per-gas-wei <wei>] [--allowed-to <0x...,0x...>] [--json]
`,
    "policy list": `
Usage:
  ag policy list [--json]
`,
    "policy show": `
Usage:
  ag policy show --policy <name> [--json]
`,
    "policy upsert": `
Usage:
  ag policy upsert --policy <name> [policy flags...] [--json]
`,
    rpc: `
Usage:
  ag rpc check [--profile <name>] [--rpc-url <url>] [--json]
`,
    "rpc check": `
Usage:
  ag rpc check [--profile <name>] [--rpc-url <url>] [--json]
`,
    tx: `
Usage:
  ag tx send --to <0x...> [--value-wei <wei>] [--data <0x...>] [--profile <name>] [--nonce-policy <safe|replace|manual>] [--nonce <n>] [--dry-run] [--wait|--confirm] [--timeout-ms <ms>] [--json]
  ag tx status [--idempotency-key <key> | --tx-hash <0x...> | --limit <n>] [--json]
  ag tx resume --idempotency-key <key> [--profile <name>] [--timeout-ms <ms>] [--json]
  ag tx watch --idempotency-key <key> [--interval-ms <ms>] [--timeout-ms <ms>] [--json]

Notes:
  --dry-run cannot be combined with --wait/--confirm.
`,
    "tx send": `
Usage:
  ag tx send --to <0x...> [--value-wei <wei>] [--data <0x...>] [--profile <name>] [--dry-run] [--wait|--confirm] [--json]
`,
    "tx status": `
Usage:
  ag tx status [--idempotency-key <key> | --tx-hash <0x...> | --limit <n>] [--json]
`,
    "tx resume": `
Usage:
  ag tx resume --idempotency-key <key> [--profile <name>] [--timeout-ms <ms>] [--json]
`,
    "tx watch": `
Usage:
  ag tx watch --idempotency-key <key> [--interval-ms <ms>] [--timeout-ms <ms>] [--json]
`,
    onchain: `
Usage:
  ag onchain call --profile <name> --abi-file <path> --address <0x...> --function <name> [--args-json '[...]'] [--json]
  ag onchain send --profile <name> --abi-file <path> --address <0x...> --function <name> [--args-json '[...]'] [--value-wei <wei>] [--nonce-policy <safe|replace|manual>] [--nonce <n>] [--dry-run] [--wait] [--json]
`,
    "onchain call": `
Usage:
  ag onchain call --profile <name> --abi-file <path> --address <0x...> --function <name> [--args-json '[...]'] [--json]
`,
    "onchain send": `
Usage:
  ag onchain send --profile <name> --abi-file <path> --address <0x...> --function <name> [--args-json '[...]'] [--value-wei <wei>] [--nonce-policy <safe|replace|manual>] [--nonce <n>] [--dry-run] [--wait] [--json]

Required:
  --abi-file
  --address
  --function
  --profile (or active profile)

Notes:
  --dry-run cannot be combined with --wait.
`,
    subgraph: `
Usage:
  ag subgraph list [--json]
  ag subgraph check --source <core-base|gbm-base> [--timeout-ms <ms>] [--raw] [--json]
  ag subgraph query --source <core-base|gbm-base> (--query <graphql> | --query-file <path>) [--variables-json '{...}'] [--timeout-ms <ms>] [--raw] [--json]
`,
    "subgraph list": `
Usage:
  ag subgraph list [--json]
`,
    "subgraph check": `
Usage:
  ag subgraph check --source <core-base|gbm-base> [--timeout-ms <ms>] [--raw] [--json]
`,
    "subgraph query": `
Usage:
  ag subgraph query --source <core-base|gbm-base> (--query <graphql> | --query-file <path>) [--variables-json '{...}'] [--timeout-ms <ms>] [--raw] [--json]
`,
    batch: `
Usage:
  ag batch run --file <plan.yaml> [--json]
`,
    "batch run": `
Usage:
  ag batch run --file <plan.yaml> [--json]
`,
    baazaar: `
Usage:
  ag baazaar listing get --kind <erc721|erc1155> --id <listingId> [--verify-onchain] [--json]
  ag baazaar listing active --kind <erc721|erc1155> [--first <n>] [--skip <n>] [--json]
  ag baazaar listing mine --kind <erc721|erc1155> --seller <0x...> [--first <n>] [--skip <n>] [--json]
  ag baazaar <mapped-write> --help
`,
    "baazaar listing": `
Usage:
  ag baazaar listing get --kind <erc721|erc1155> --id <listingId> [--verify-onchain] [--json]
  ag baazaar listing active --kind <erc721|erc1155> [--first <n>] [--skip <n>] [--json]
  ag baazaar listing mine --kind <erc721|erc1155> --seller <0x...> [--first <n>] [--skip <n>] [--json]
`,
    "baazaar listing get": `
Usage:
  ag baazaar listing get --kind <erc721|erc1155> --id <listingId> [--verify-onchain] [--json]
`,
    "baazaar listing active": `
Usage:
  ag baazaar listing active --kind <erc721|erc1155> [--first <n>] [--skip <n>] [--json]
`,
    "baazaar listing mine": `
Usage:
  ag baazaar listing mine --kind <erc721|erc1155> --seller <0x...> [--first <n>] [--skip <n>] [--json]
`,
    auction: `
Usage:
  ag auction get --id <auctionId> [--verify-onchain] [--json]
  ag auction active [--first <n>] [--skip <n>] [--at-time <unixSec>] [--json]
  ag auction mine --seller <0x...> [--first <n>] [--skip <n>] [--at-time <unixSec>] [--json]
  ag auction bids --auction-id <auctionId> [--first <n>] [--skip <n>] [--json]
  ag auction bids-mine --bidder <0x...> [--first <n>] [--skip <n>] [--json]
  ag auction bid --auction-id <auctionId> --amount-ghst <amount> [--dry-run] [--auto-approve] [--json]
  ag auction bid-unbid --amount-ghst <amount> --max-total-ghst <amount> [--dry-run] [--auto-approve] [--json]
  ag auction <mapped-write> --help
`,
    "auction get": `
Usage:
  ag auction get --id <auctionId> [--verify-onchain] [--json]
`,
    "auction active": `
Usage:
  ag auction active [--first <n>] [--skip <n>] [--at-time <unixSec>] [--json]
`,
    "auction mine": `
Usage:
  ag auction mine --seller <0x...> [--first <n>] [--skip <n>] [--at-time <unixSec>] [--json]
`,
    "auction bids": `
Usage:
  ag auction bids --auction-id <auctionId> [--first <n>] [--skip <n>] [--json]
`,
    "auction bids-mine": `
Usage:
  ag auction bids-mine --bidder <0x...> [--first <n>] [--skip <n>] [--json]
`,
    "auction bid": `
Usage:
  ag auction bid --auction-id <auctionId> (--amount-ghst <amount> | --amount-wei <wei>) [--require-unbid] [--expected-highest-bid-ghst <amount> | --expected-highest-bid-wei <wei>] [--auto-approve] [--auto-approve-max-ghst <amount> | --auto-approve-max-wei <wei>] [--nonce-policy <safe|replace|manual>] [--nonce <n>] [--dry-run] [--wait] [--timeout-ms <ms>] [--idempotency-key <key>] [--json]

Notes:
  - Resolves GBM diamond + ABI internally (no manual ABI/address flags).
  - Runs preflight checks (auction state, min bid, GHST balance, GHST allowance).
  - Rechecks auction state immediately before submit to prevent stale-state sends.
  - --dry-run with --auto-approve simulates approval and skips bid simulation because allowance state is unchanged on-chain.
`,
    "auction bid-unbid": `
Usage:
  ag auction bid-unbid (--amount-ghst <amount> | --amount-wei <wei>) (--max-total-ghst <amount> | --max-total-wei <wei>) [--first <n>] [--skip <n>] [--auto-approve] [--dry-run] [--wait] [--timeout-ms <ms>] [--idempotency-key <key>] [--json]

Behavior:
  - Scans active auctions, selects unbid auctions, and skips those above your target amount.
  - Emits per-auction status plus clear skip reasons in one JSON report.
`,
};

function buildDomainRootHelp(root: string): string {
    const mapped = listMappedCommandsForRoot(root);
    return `
Usage:
  ag ${root} read --profile <name> --abi-file <path> --address <0x...> --function <name> [--args-json '[...]'] [--json]
  ag ${root} <mapped-write> --help

Mapped writes for '${root}':
${toLines(mapped)}
`;
}

function buildMappedCommandHelp(commandPath: string[], flags: Flags): string {
    const command = commandPath.join(" ");
    const method = findMappedFunction(commandPath);
    if (!method) {
        return "";
    }

    const defaults = getMappedWriteDefaults(commandPath);
    const abiFile = getFlagString(flags, "abi-file");
    const signatureLines: string[] = [];
    const inputLines: string[] = [];

    if (abiFile) {
        try {
            const abi = parseAbiFile(abiFile);
            const entries = getAbiFunctionEntries(abi, method);
            if (entries.length === 0) {
                signatureLines.push(`No function named '${method}' found in '${abiFile}'.`);
            } else {
                for (const entry of entries) {
                    signatureLines.push(formatAbiFunctionSignature(entry));
                    inputLines.push(...formatAbiFunctionInputs(entry));
                }
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unable to parse ABI file.";
            signatureLines.push(`Could not inspect ABI file '${abiFile}': ${message}`);
        }
    } else if (defaults?.abi) {
        const entries = getAbiFunctionEntries(defaults.abi, method);
        if (entries.length === 0) {
            signatureLines.push("Built-in ABI defaults are available, but no matching function entry was found.");
        } else {
            for (const entry of entries) {
                signatureLines.push(formatAbiFunctionSignature(entry));
                inputLines.push(...formatAbiFunctionInputs(entry));
            }
        }
    } else {
        signatureLines.push("Pass --abi-file <path> with --help to print exact ABI-derived signature and input names.");
    }

    const requiredFlags = ["--args-json", "--profile (or active profile)"];
    const optionalOverrides: string[] = [];

    if (!defaults?.abi) {
        requiredFlags.unshift("--abi-file");
    } else {
        optionalOverrides.push("--abi-file (override built-in ABI)");
    }

    if (!defaults?.address) {
        requiredFlags.unshift("--address");
    } else {
        optionalOverrides.push("--address (override default)");
    }

    const usageParts = [`ag ${command}`, "--profile <name>"];
    if (!defaults?.abi) {
        usageParts.push("--abi-file <path>");
    }
    if (!defaults?.address) {
        usageParts.push("--address <0x...>");
    }
    usageParts.push(
        "--args-json '[...]'",
        "[--value-wei <wei>]",
        "[--nonce-policy <safe|replace|manual>]",
        "[--nonce <n>]",
        "[--dry-run]",
        "[--wait]",
        "[--json]",
    );
    const usage = `  ${usageParts.join(" ")}`;

    const defaultLines = [
        defaults?.address ? `address: ${defaults.address}` : "address: none",
        defaults?.abi ? "abi: available" : "abi: none",
        `source: ${defaults?.source || "none"}`,
    ];

    const dryRunParts = [`ag ${command}`, "--profile prod"];
    if (!defaults?.abi) {
        dryRunParts.push("--abi-file ./abi.json");
    }
    if (!defaults?.address) {
        dryRunParts.push("--address 0xabc...");
    }
    dryRunParts.push("--args-json '[<arg0>,<arg1>]'", "--dry-run", "--json");
    const dryRunExample = `  ${dryRunParts.join(" ")}`;

    return `
Usage:
${usage}

Mapped to onchain function:
  ${method}

Required flags:
${toLines(requiredFlags)}

Mapped defaults:
${toLines(defaultLines)}

Optional overrides:
${toLines(optionalOverrides)}

Dry-run example:
${dryRunExample}

ABI signature info:
${toLines(signatureLines)}

ABI inputs:
${toLines(inputLines)}
`;
}

function buildUnknownHelpText(commandPath: string[]): string {
    const command = commandPath.join(" ");
    const suggestions = suggestCommands(command);
    const suggestionBlock = suggestions.length
        ? `\nSuggested commands:\n${toLines(suggestions)}`
        : "";

    return `No command-specific help found for '${command}'.${suggestionBlock}

Use 'ag help' for the full command surface.
`;
}

function normalizeHelpPath(commandPath: string[]): string[] {
    return commandPath.map((part) => part.trim()).filter(Boolean);
}

export function buildHelpText(commandPath: string[] = [], flags: Flags = {}): string {
    const target = normalizeHelpPath(commandPath);

    if (target.length === 0) {
        return buildGlobalHelpText().trim();
    }

    const key = target.join(" ");
    if (STATIC_HELP[key]) {
        return STATIC_HELP[key].trim();
    }

    const mappedHelp = buildMappedCommandHelp(target, flags);
    if (mappedHelp) {
        return mappedHelp.trim();
    }

    if (target.length === 1 && isDomainStubRoot(target[0])) {
        return buildDomainRootHelp(target[0]).trim();
    }

    if (target.length > 1 && isDomainStubRoot(target[0])) {
        const root = target[0];
        const mapped = listMappedCommandsForRoot(root);
        return `
No direct help entry for '${key}'.

Mapped writes under '${root}':
${toLines(mapped)}

Try:
  ag ${root} --help
  ag ${root} read --help
`.trim();
    }

    return buildUnknownHelpText(target).trim();
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

export function outputHelp(commandPath: string[] = [], flags: Flags = {}): void {
    console.log(buildHelpText(commandPath, flags));
}
