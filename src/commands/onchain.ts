import * as fs from "fs";

import { decodeFunctionResult, encodeFunctionData, type Abi } from "viem";

import { getFlagBoolean, getFlagString } from "../args";
import { resolveChain, resolveRpcUrl } from "../chains";
import { getPolicyOrThrow, getProfileOrThrow, loadConfig } from "../config";
import { CliError } from "../errors";
import { runRpcPreflight } from "../rpc";
import { executeTxIntent } from "../tx-engine";
import { CommandContext, JsonValue, TxIntent } from "../types";

function requireFlag(value: string | undefined, name: string): string {
    if (!value) {
        throw new CliError("MISSING_ARGUMENT", `${name} is required.`, 2);
    }

    return value;
}

function parseArgsJson(value: string | undefined): readonly unknown[] {
    if (!value) {
        return [];
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        throw new CliError("INVALID_ARGUMENT", "--args-json must be valid JSON.", 2);
    }

    if (!Array.isArray(parsed)) {
        throw new CliError("INVALID_ARGUMENT", "--args-json must be a JSON array.", 2);
    }

    return parsed;
}

function parseAbiFile(filePath: string): Abi {
    if (!fs.existsSync(filePath)) {
        throw new CliError("ABI_NOT_FOUND", `ABI file not found: ${filePath}`, 2);
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
        throw new CliError("INVALID_ABI", `ABI file is not valid JSON: ${filePath}`, 2);
    }

    if (Array.isArray(parsed)) {
        return parsed as Abi;
    }

    if (typeof parsed === "object" && parsed !== null && "abi" in parsed && Array.isArray((parsed as { abi: unknown }).abi)) {
        return (parsed as { abi: Abi }).abi;
    }

    throw new CliError("INVALID_ABI", `ABI file must be an array or object containing 'abi'.`, 2);
}

function parseValueWei(value: string | undefined): bigint | undefined {
    if (!value) {
        return undefined;
    }

    if (!/^\d+$/.test(value)) {
        throw new CliError("INVALID_ARGUMENT", "--value-wei must be an integer string.", 2, {
            value,
        });
    }

    return BigInt(value);
}

function parseTimeoutMs(value: string | undefined): number {
    if (!value) {
        return 120000;
    }

    const timeout = Number(value);
    if (!Number.isInteger(timeout) || timeout <= 0) {
        throw new CliError("INVALID_ARGUMENT", "--timeout-ms must be a positive integer.", 2, {
            value,
        });
    }

    return timeout;
}

function parseAddress(value: string | undefined, flagName: string): `0x${string}` {
    if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
        throw new CliError("INVALID_ARGUMENT", `${flagName} must be an EVM address.`, 2, {
            value,
        });
    }

    return value.toLowerCase() as `0x${string}`;
}

export async function runOnchainCallCommand(ctx: CommandContext): Promise<JsonValue> {
    const config = loadConfig();
    const profileName = getFlagString(ctx.args.flags, "profile") || ctx.globals.profile;
    const profile = getProfileOrThrow(config, profileName);

    const chain = resolveChain(profile.chain);
    const rpcUrl = resolveRpcUrl(chain, getFlagString(ctx.args.flags, "rpc-url") || profile.rpcUrl);

    const abiFile = requireFlag(getFlagString(ctx.args.flags, "abi-file"), "--abi-file");
    const abi = parseAbiFile(abiFile);

    const address = parseAddress(getFlagString(ctx.args.flags, "address"), "--address");
    const functionName = requireFlag(getFlagString(ctx.args.flags, "function"), "--function");
    const args = parseArgsJson(getFlagString(ctx.args.flags, "args-json"));

    const preflight = await runRpcPreflight(chain, rpcUrl);

    const calldata = encodeFunctionData({
        abi,
        functionName,
        args,
    });

    const callResult = await preflight.client.call({
        to: address,
        data: calldata,
    });

    if (!callResult.data) {
        throw new CliError("EMPTY_CALL_RESULT", "Call returned no data.", 2);
    }

    const decoded = decodeFunctionResult({
        abi,
        functionName,
        data: callResult.data,
    });

    return {
        chainId: chain.chainId,
        rpcUrl,
        address,
        functionName,
        args,
        result: decoded,
    };
}

export async function runOnchainSendWithFunction(
    ctx: CommandContext,
    forcedFunctionName?: string,
    commandOverride?: string,
): Promise<JsonValue> {
    const config = loadConfig();
    const profileName = getFlagString(ctx.args.flags, "profile") || ctx.globals.profile;
    const profile = getProfileOrThrow(config, profileName);
    const policy = getPolicyOrThrow(config, profile.policy);

    const chain = resolveChain(profile.chain);
    const rpcUrl = resolveRpcUrl(chain, getFlagString(ctx.args.flags, "rpc-url") || profile.rpcUrl);

    const abiFile = requireFlag(getFlagString(ctx.args.flags, "abi-file"), "--abi-file");
    const abi = parseAbiFile(abiFile);

    const address = parseAddress(getFlagString(ctx.args.flags, "address"), "--address");
    const functionName = forcedFunctionName || requireFlag(getFlagString(ctx.args.flags, "function"), "--function");
    const args = parseArgsJson(getFlagString(ctx.args.flags, "args-json"));

    const valueWei = parseValueWei(getFlagString(ctx.args.flags, "value-wei"));

    const data = encodeFunctionData({
        abi,
        functionName,
        args,
    });

    const noncePolicyRaw = getFlagString(ctx.args.flags, "nonce-policy") || "safe";
    if (!["safe", "replace", "manual"].includes(noncePolicyRaw)) {
        throw new CliError("INVALID_NONCE_POLICY", `Unsupported nonce policy '${noncePolicyRaw}'.`, 2);
    }

    const nonceRaw = getFlagString(ctx.args.flags, "nonce");
    const nonce = nonceRaw ? Number(nonceRaw) : undefined;
    if (nonceRaw && (!Number.isInteger(nonce) || (nonce !== undefined && nonce < 0))) {
        throw new CliError("INVALID_ARGUMENT", "--nonce must be a non-negative integer.", 2, {
            value: nonceRaw,
        });
    }

    const waitForReceipt = getFlagBoolean(ctx.args.flags, "wait");
    const dryRun = getFlagBoolean(ctx.args.flags, "dry-run");

    if (dryRun && waitForReceipt) {
        throw new CliError("INVALID_ARGUMENT", "--dry-run cannot be combined with --wait.", 2);
    }

    const intent: TxIntent = {
        idempotencyKey: getFlagString(ctx.args.flags, "idempotency-key"),
        profileName: profile.name,
        chainId: profile.chainId,
        rpcUrl,
        signer: profile.signer,
        policy,
        to: address,
        data,
        valueWei,
        noncePolicy: noncePolicyRaw as TxIntent["noncePolicy"],
        nonce,
        waitForReceipt,
        dryRun,
        timeoutMs: parseTimeoutMs(getFlagString(ctx.args.flags, "timeout-ms")),
        command: commandOverride || `onchain send ${functionName}`,
    };

    const result = await executeTxIntent(intent, chain);

    return {
        profile: profile.name,
        chainId: chain.chainId,
        address,
        functionName,
        args,
        result,
    };
}

export async function runOnchainSendCommand(ctx: CommandContext): Promise<JsonValue> {
    return runOnchainSendWithFunction(ctx);
}
