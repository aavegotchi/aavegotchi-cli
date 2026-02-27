import { getFlagString } from "../args";
import { resolveChain, resolveRpcUrl } from "../chains";
import { loadConfig, saveConfig, setActiveProfile, upsertProfile } from "../config";
import { CliError } from "../errors";
import { runRpcPreflight } from "../rpc";
import { parseSigner, resolveSignerAccount } from "../signer";
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
    const policy = getFlagString(ctx.args.flags, "policy") || "default";

    const chain = resolveChain(chainInput);
    const rpcUrl = resolveRpcUrl(chain, rpcFlag);

    const preflight = await runRpcPreflight(rpcUrl, chain.chainId);
    const signer = parseSigner(signerInput);
    const signerAccount = await resolveSignerAccount(signer, preflight.provider);

    const now = new Date().toISOString();
    const config = loadConfig();

    const existing = config.profiles[profileName];
    const profile: ProfileConfig = {
        name: profileName,
        chain: chain.key,
        chainId: preflight.chainId,
        rpcUrl,
        signer,
        policy,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
    };

    const upserted = upsertProfile(config, profile);
    const activated = setActiveProfile(upserted, profileName);
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
        account: signerAccount,
        configPath,
    };
}
