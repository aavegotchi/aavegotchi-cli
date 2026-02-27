import { getFlagBoolean, getFlagString } from "../args";
import { resolveChain, resolveRpcUrl } from "../chains";
import { getPolicyOrThrow, getProfileOrThrow, loadConfig } from "../config";
import { CliError } from "../errors";
import { applyProfileEnvironment } from "../profile-env";
import {
    executeTxIntent,
    getJournalEntryByHash,
    getJournalEntryByIdempotency,
    getRecentJournalEntries,
    resumeTransaction,
} from "../tx-engine";
import { CommandContext, JsonValue, NoncePolicy, TxIntent } from "../types";

function parseNoncePolicy(value?: string): NoncePolicy {
    if (!value) {
        return "safe";
    }

    if (value === "safe" || value === "replace" || value === "manual") {
        return value;
    }

    throw new CliError("INVALID_NONCE_POLICY", `Unsupported nonce policy '${value}'.`, 2);
}

function requireHexAddress(value: string | undefined, name: string): `0x${string}` {
    if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
        throw new CliError("INVALID_ARGUMENT", `${name} must be an EVM address.`, 2, {
            value,
        });
    }

    return value.toLowerCase() as `0x${string}`;
}

function parseHexData(value: string | undefined): `0x${string}` | undefined {
    if (!value) {
        return undefined;
    }

    if (!/^0x([a-fA-F0-9]{2})*$/.test(value)) {
        throw new CliError("INVALID_ARGUMENT", "--data must be hex bytes prefixed with 0x.", 2, {
            value,
        });
    }

    return value as `0x${string}`;
}

function parseOptionalBigInt(value: string | undefined, name: string): bigint | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (!/^\d+$/.test(value)) {
        throw new CliError("INVALID_ARGUMENT", `${name} must be a non-negative integer string.`, 2, {
            value,
        });
    }

    return BigInt(value);
}

function parseNumberFlag(value: string | undefined, flag: string, fallback: number): number {
    if (!value) {
        return fallback;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new CliError("INVALID_ARGUMENT", `${flag} must be a non-negative integer.`, 2, {
            value,
        });
    }

    return parsed;
}

export async function runTxSendCommand(ctx: CommandContext): Promise<JsonValue> {
    const config = loadConfig();
    const requestedProfile = getFlagString(ctx.args.flags, "profile") || ctx.globals.profile;
    const profile = getProfileOrThrow(config, requestedProfile);
    const policy = getPolicyOrThrow(config, profile.policy);
    const environment = applyProfileEnvironment(profile);

    const chain = resolveChain(profile.chain);
    const rpcUrl = resolveRpcUrl(chain, getFlagString(ctx.args.flags, "rpc-url") || profile.rpcUrl);

    const to = requireHexAddress(getFlagString(ctx.args.flags, "to"), "--to");
    const valueWei = parseOptionalBigInt(getFlagString(ctx.args.flags, "value-wei"), "--value-wei");
    const data = parseHexData(getFlagString(ctx.args.flags, "data"));
    const idempotencyKey = getFlagString(ctx.args.flags, "idempotency-key");
    const noncePolicy = parseNoncePolicy(getFlagString(ctx.args.flags, "nonce-policy"));
    const nonceValue = getFlagString(ctx.args.flags, "nonce");
    const nonce = nonceValue ? parseNumberFlag(nonceValue, "--nonce", 0) : undefined;
    const waitForReceipt = getFlagBoolean(ctx.args.flags, "wait") || getFlagBoolean(ctx.args.flags, "confirm");
    const dryRun = getFlagBoolean(ctx.args.flags, "dry-run");
    const timeoutMs = parseNumberFlag(getFlagString(ctx.args.flags, "timeout-ms"), "--timeout-ms", 120000);

    if (noncePolicy === "manual" && nonce === undefined) {
        throw new CliError("MISSING_NONCE", "--nonce is required when --nonce-policy=manual.", 2);
    }

    if (dryRun && waitForReceipt) {
        throw new CliError("INVALID_ARGUMENT", "--dry-run cannot be combined with --wait/--confirm.", 2);
    }

    const intent: TxIntent = {
        idempotencyKey,
        profileName: profile.name,
        chainId: profile.chainId,
        rpcUrl,
        signer: profile.signer,
        policy,
        to,
        data,
        valueWei,
        noncePolicy,
        nonce,
        waitForReceipt,
        dryRun,
        timeoutMs,
        command: "tx send",
    };

    const result = await executeTxIntent(intent, chain);

    return {
        profile: profile.name,
        policy: policy.name,
        chainId: chain.chainId,
        environment,
        ...result,
    };
}

export async function runTxStatusCommand(ctx: CommandContext): Promise<JsonValue> {
    const idempotencyKey = getFlagString(ctx.args.flags, "idempotency-key");
    const txHash = getFlagString(ctx.args.flags, "tx-hash");

    if (idempotencyKey) {
        const entry = getJournalEntryByIdempotency(idempotencyKey);
        if (!entry) {
            throw new CliError("TX_NOT_FOUND", `No transaction found for '${idempotencyKey}'.`, 2);
        }

        return {
            type: "idempotency",
            entry,
        };
    }

    if (txHash) {
        const entry = getJournalEntryByHash(txHash);
        if (!entry) {
            throw new CliError("TX_NOT_FOUND", `No transaction found for hash '${txHash}'.`, 2);
        }

        return {
            type: "hash",
            entry,
        };
    }

    return {
        type: "recent",
        entries: getRecentJournalEntries(parseNumberFlag(getFlagString(ctx.args.flags, "limit"), "--limit", 20)),
    };
}

export async function runTxResumeCommand(ctx: CommandContext): Promise<JsonValue> {
    const idempotencyKey = getFlagString(ctx.args.flags, "idempotency-key");
    if (!idempotencyKey) {
        throw new CliError("MISSING_ARGUMENT", "tx resume requires --idempotency-key <value>.", 2);
    }

    const config = loadConfig();
    const requestedProfile = getFlagString(ctx.args.flags, "profile") || ctx.globals.profile;
    const profile = getProfileOrThrow(config, requestedProfile);

    const chain = resolveChain(profile.chain);
    const rpcUrl = resolveRpcUrl(chain, getFlagString(ctx.args.flags, "rpc-url") || profile.rpcUrl);

    const timeoutMs = parseNumberFlag(getFlagString(ctx.args.flags, "timeout-ms"), "--timeout-ms", 120000);

    const result = await resumeTransaction(idempotencyKey, chain, rpcUrl, timeoutMs);

    return {
        profile: profile.name,
        ...result,
    };
}

export async function runTxWatchCommand(ctx: CommandContext): Promise<JsonValue> {
    const idempotencyKey = getFlagString(ctx.args.flags, "idempotency-key");
    if (!idempotencyKey) {
        throw new CliError("MISSING_ARGUMENT", "tx watch requires --idempotency-key <value>.", 2);
    }

    const intervalMs = parseNumberFlag(getFlagString(ctx.args.flags, "interval-ms"), "--interval-ms", 3000);
    const timeoutMs = parseNumberFlag(getFlagString(ctx.args.flags, "timeout-ms"), "--timeout-ms", 180000);

    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
        const entry = getJournalEntryByIdempotency(idempotencyKey);
        if (entry?.status === "confirmed") {
            return {
                idempotencyKey,
                status: "confirmed",
                entry,
            };
        }

        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new CliError("TIMEOUT", `Timed out waiting for '${idempotencyKey}' to confirm.`, 2, {
        timeoutMs,
    });
}
