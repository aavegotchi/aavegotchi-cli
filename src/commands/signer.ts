import { getFlagString } from "../args";
import { resolveChain, resolveRpcUrl, toViemChain } from "../chains";
import { getProfileOrThrow, loadConfig } from "../config";
import { CliError } from "../errors";
import { keychainImportFromEnv, keychainList, keychainRemove } from "../keychain";
import { applyProfileEnvironment } from "../profile-env";
import { runRpcPreflight } from "../rpc";
import { resolveSignerRuntime } from "../signer";
import { CommandContext, JsonValue } from "../types";

export async function runSignerCheckCommand(ctx: CommandContext): Promise<JsonValue> {
    const config = loadConfig();
    const profileName = getFlagString(ctx.args.flags, "profile") || ctx.globals.profile;
    const profile = getProfileOrThrow(config, profileName);
    const environment = applyProfileEnvironment(profile);

    const chain = resolveChain(profile.chain);
    const rpcUrl = resolveRpcUrl(chain, getFlagString(ctx.args.flags, "rpc-url") || profile.rpcUrl);
    const preflight = await runRpcPreflight(chain, rpcUrl);

    const runtime = await resolveSignerRuntime(profile.signer, preflight.client, rpcUrl, toViemChain(chain, rpcUrl));

    return {
        profile: profile.name,
        chainId: chain.chainId,
        environment,
        signer: runtime.summary,
    };
}

export async function runSignerKeychainImportCommand(ctx: CommandContext): Promise<JsonValue> {
    const accountId = getFlagString(ctx.args.flags, "account-id");
    const privateKeyEnv = getFlagString(ctx.args.flags, "private-key-env") || "AGCLI_PRIVATE_KEY";

    if (!accountId) {
        throw new CliError("MISSING_ARGUMENT", "signer keychain import requires --account-id.", 2);
    }

    const imported = keychainImportFromEnv(accountId, privateKeyEnv);

    return {
        message: `Imported keychain entry '${imported.accountId}'.`,
        ...imported,
    };
}

export async function runSignerKeychainListCommand(): Promise<JsonValue> {
    return {
        entries: keychainList(),
    };
}

export async function runSignerKeychainRemoveCommand(ctx: CommandContext): Promise<JsonValue> {
    const accountId = getFlagString(ctx.args.flags, "account-id");

    if (!accountId) {
        throw new CliError("MISSING_ARGUMENT", "signer keychain remove requires --account-id.", 2);
    }

    return keychainRemove(accountId);
}
