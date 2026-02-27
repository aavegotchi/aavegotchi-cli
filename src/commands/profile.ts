import { getFlagString } from "../args";
import { getProfileOrThrow, loadConfig, saveConfig, setActiveProfile } from "../config";
import { CliError } from "../errors";
import { CommandContext, JsonValue } from "../types";

function resolveProfileSelection(ctx: CommandContext): string | undefined {
    return getFlagString(ctx.args.flags, "profile") || ctx.globals.profile;
}

export async function runProfileListCommand(): Promise<JsonValue> {
    const config = loadConfig();
    const profiles = Object.values(config.profiles)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((profile) => ({
            name: profile.name,
            chain: profile.chain,
            chainId: profile.chainId,
            rpcUrl: profile.rpcUrl,
            policy: profile.policy,
            signerType: profile.signer.type,
            active: config.activeProfile === profile.name,
            updatedAt: profile.updatedAt,
        }));

    return {
        activeProfile: config.activeProfile || null,
        profiles,
    };
}

export async function runProfileShowCommand(ctx: CommandContext): Promise<JsonValue> {
    const config = loadConfig();
    const requestedProfile = resolveProfileSelection(ctx);
    const profile = getProfileOrThrow(config, requestedProfile);

    return {
        activeProfile: config.activeProfile || null,
        profile,
    };
}

export async function runProfileUseCommand(ctx: CommandContext): Promise<JsonValue> {
    const selectedProfile = resolveProfileSelection(ctx);
    if (!selectedProfile) {
        throw new CliError("MISSING_PROFILE", "profile use requires --profile <name>.", 2);
    }

    const config = loadConfig();
    const updated = setActiveProfile(config, selectedProfile);
    const configPath = saveConfig(updated);

    return {
        message: `Active profile set to '${selectedProfile}'.`,
        activeProfile: selectedProfile,
        configPath,
    };
}
