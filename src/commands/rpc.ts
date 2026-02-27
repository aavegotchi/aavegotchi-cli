import { getFlagBoolean, getFlagString } from "../args";
import { resolveChain, resolveRpcUrl, toViemChain } from "../chains";
import { getProfileOrThrow, loadConfig } from "../config";
import { runRpcPreflight } from "../rpc";
import { resolveSignerRuntime } from "../signer";
import { CommandContext, JsonValue } from "../types";

export async function runRpcCheckCommand(ctx: CommandContext): Promise<JsonValue> {
    const profileName = getFlagString(ctx.args.flags, "profile") || ctx.globals.profile;
    const skipSignerCheck = getFlagBoolean(ctx.args.flags, "skip-signer-check");

    const config = loadConfig();
    const profile = getProfileOrThrow(config, profileName);

    const chain = resolveChain(profile.chain);
    const rpcUrl = resolveRpcUrl(chain, getFlagString(ctx.args.flags, "rpc-url") || profile.rpcUrl);

    const preflight = await runRpcPreflight(chain, rpcUrl);

    const signer = skipSignerCheck
        ? { signerType: profile.signer.type, backendStatus: "not-checked", canSign: false }
        : (await resolveSignerRuntime(profile.signer, preflight.client, rpcUrl, toViemChain(chain, rpcUrl))).summary;

    return {
        profile: profile.name,
        chain: profile.chain,
        chainId: preflight.chainId,
        chainName: preflight.chainName,
        blockNumber: preflight.blockNumber,
        rpcUrl,
        signer,
    };
}
