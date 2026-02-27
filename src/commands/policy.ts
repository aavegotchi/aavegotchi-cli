import { getFlagString } from "../args";
import { createDefaultPolicy, loadConfig, saveConfig, upsertPolicy } from "../config";
import { CliError } from "../errors";
import { CommandContext, JsonValue } from "../types";

function parseIntegerString(value: string | undefined, flag: string): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (!/^\d+$/.test(value)) {
        throw new CliError("INVALID_ARGUMENT", `${flag} must be an integer string.`, 2, {
            value,
        });
    }

    return value;
}

function parseAllowlist(value: string | undefined): `0x${string}`[] | undefined {
    if (!value) {
        return undefined;
    }

    const addresses = value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => entry.toLowerCase());

    if (addresses.some((entry) => !/^0x[a-f0-9]{40}$/.test(entry))) {
        throw new CliError("INVALID_ARGUMENT", "--allowed-to expects comma-separated EVM addresses.", 2);
    }

    return addresses as `0x${string}`[];
}

export async function runPolicyListCommand(): Promise<JsonValue> {
    const config = loadConfig();

    return {
        policies: Object.values(config.policies).sort((a, b) => a.name.localeCompare(b.name)),
    };
}

export async function runPolicyShowCommand(ctx: CommandContext): Promise<JsonValue> {
    const config = loadConfig();
    const policyName = getFlagString(ctx.args.flags, "policy") || "default";
    const policy = config.policies[policyName];

    if (!policy) {
        throw new CliError("POLICY_NOT_FOUND", `Policy '${policyName}' does not exist.`, 2);
    }

    return {
        policy,
    };
}

export async function runPolicyUpsertCommand(ctx: CommandContext): Promise<JsonValue> {
    const config = loadConfig();
    const policyName = getFlagString(ctx.args.flags, "policy") || "default";

    const timestamp = new Date().toISOString();
    const existing = config.policies[policyName] || createDefaultPolicy(policyName, timestamp);

    const updated = {
        ...existing,
        name: policyName,
        maxValueWei: parseIntegerString(getFlagString(ctx.args.flags, "max-value-wei"), "--max-value-wei") ?? existing.maxValueWei,
        maxGasLimit: parseIntegerString(getFlagString(ctx.args.flags, "max-gas-limit"), "--max-gas-limit") ?? existing.maxGasLimit,
        maxFeePerGasWei:
            parseIntegerString(getFlagString(ctx.args.flags, "max-fee-per-gas-wei"), "--max-fee-per-gas-wei") ??
            existing.maxFeePerGasWei,
        maxPriorityFeePerGasWei:
            parseIntegerString(getFlagString(ctx.args.flags, "max-priority-fee-per-gas-wei"), "--max-priority-fee-per-gas-wei") ??
            existing.maxPriorityFeePerGasWei,
        allowedTo: parseAllowlist(getFlagString(ctx.args.flags, "allowed-to")) ?? existing.allowedTo,
        updatedAt: timestamp,
    };

    const merged = upsertPolicy(config, updated);
    const configPath = saveConfig(merged);

    return {
        message: `Policy '${policyName}' updated.`,
        policy: updated,
        configPath,
    };
}
