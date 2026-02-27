import { getFlagBoolean, getFlagString } from "../args";
import { resolveChain, resolveRpcUrl, toViemChain } from "../chains";
import {
    createDefaultPolicy,
    getPolicyOrThrow,
    loadConfig,
    saveConfig,
    setActiveProfile,
    upsertPolicy,
    upsertProfile,
} from "../config";
import { CliError } from "../errors";
import { runRpcPreflight } from "../rpc";
import { parseSigner, resolveSignerRuntime } from "../signer";
import { CommandContext, JsonValue, ProfileConfig } from "../types";

function getRequiredProfileName(ctx: CommandContext): string {
    const fromFlag = getFlagString(ctx.args.flags, "profile");
    const profile = fromFlag || ctx.globals.profile;

    if (!profile) {
        throw new CliError("MISSING_PROFILE", "Bootstrap requires --profile <name>.", 2);
    }

    return profile;
}

export async function runBootstrapCommand(ctx: CommandContext): Promise<JsonValue> {
    const profileName = getRequiredProfileName(ctx);
    const chainInput = getFlagString(ctx.args.flags, "chain");
    const rpcFlag = getFlagString(ctx.args.flags, "rpc-url");
    const signerInput = getFlagString(ctx.args.flags, "signer") || "readonly";
    const policyName = getFlagString(ctx.args.flags, "policy") || "default";
    const skipSignerCheck = getFlagBoolean(ctx.args.flags, "skip-signer-check");

    const chain = resolveChain(chainInput);
    const rpcUrl = resolveRpcUrl(chain, rpcFlag);

    const preflight = await runRpcPreflight(chain, rpcUrl);
    const signer = parseSigner(signerInput);

    let signerSummary: JsonValue = {
        signerType: signer.type,
        backendStatus: "not-checked",
    };

    if (!skipSignerCheck) {
        const signerRuntime = await resolveSignerRuntime(signer, preflight.client, rpcUrl, toViemChain(chain, rpcUrl));
        signerSummary = signerRuntime.summary;
    }

    const now = new Date().toISOString();
    const config = loadConfig();

    const existingProfile = config.profiles[profileName];
    const profile: ProfileConfig = {
        name: profileName,
        chain: chain.key,
        chainId: preflight.chainId,
        rpcUrl,
        signer,
        policy: policyName,
        createdAt: existingProfile?.createdAt || now,
        updatedAt: now,
    };

    const withProfile = upsertProfile(config, profile);
    const withPolicy = withProfile.policies[policyName]
        ? withProfile
        : upsertPolicy(withProfile, createDefaultPolicy(policyName, now));

    // Validate policy existence after potential creation.
    getPolicyOrThrow(withPolicy, policyName);

    const activated = setActiveProfile(withPolicy, profileName);
    const configPath = saveConfig(activated);

    return {
        message: "Bootstrap completed.",
        profile: {
            name: profile.name,
            chain: profile.chain,
            chainId: profile.chainId,
            rpcUrl: profile.rpcUrl,
            signer: profile.signer,
            policy: profile.policy,
        },
        rpc: {
            blockNumber: preflight.blockNumber,
            chainName: preflight.chainName,
        },
        signer: signerSummary,
        configPath,
    };
}
