import { getFlagString } from "../args";
import { getProfileOrThrow, loadConfig } from "../config";
import { runRpcPreflight } from "../rpc";
import { resolveSignerAccount } from "../signer";
import { CommandContext, JsonValue } from "../types";

export async function runRpcCheckCommand(ctx: CommandContext): Promise<JsonValue> {
    const profileName = getFlagString(ctx.args.flags, "profile") || ctx.globals.profile;
    const config = loadConfig();
    const profile = getProfileOrThrow(config, profileName);

    const preflight = await runRpcPreflight(profile.rpcUrl, profile.chainId);
    const signerAccount = await resolveSignerAccount(profile.signer, preflight.provider);

    return {
        profile: profile.name,
        chain: profile.chain,
        chainId: preflight.chainId,
        networkName: preflight.networkName,
        rpcUrl: profile.rpcUrl,
        signer: signerAccount,
    };
}
