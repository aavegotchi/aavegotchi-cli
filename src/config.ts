import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { CliError } from "./errors";
import { CliConfig, ProfileConfig } from "./types";

const CONFIG_FILE = "config.json";

function createDefaultConfig(): CliConfig {
    return {
        schemaVersion: 1,
        profiles: {},
    };
}

export function resolveAgcliHome(customHome?: string): string {
    if (customHome) {
        return customHome;
    }

    if (process.env.AGCLI_HOME) {
        return process.env.AGCLI_HOME;
    }

    return path.join(os.homedir(), ".aavegotchi-cli");
}

export function resolveConfigPath(customHome?: string): string {
    const home = resolveAgcliHome(customHome);
    return path.join(home, CONFIG_FILE);
}

export function loadConfig(customHome?: string): CliConfig {
    const configPath = resolveConfigPath(customHome);

    if (!fs.existsSync(configPath)) {
        return createDefaultConfig();
    }

    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as CliConfig;

    if (parsed.schemaVersion !== 1 || typeof parsed.profiles !== "object") {
        throw new CliError("INVALID_CONFIG", `Unsupported config format in ${configPath}.`, 2);
    }

    return parsed;
}

export function saveConfig(config: CliConfig, customHome?: string): string {
    const home = resolveAgcliHome(customHome);
    const configPath = resolveConfigPath(customHome);

    fs.mkdirSync(home, { recursive: true });

    const tmpPath = `${configPath}.tmp`;
    fs.writeFileSync(tmpPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    fs.renameSync(tmpPath, configPath);

    return configPath;
}

export function upsertProfile(config: CliConfig, profile: ProfileConfig): CliConfig {
    return {
        ...config,
        profiles: {
            ...config.profiles,
            [profile.name]: profile,
        },
    };
}

export function setActiveProfile(config: CliConfig, profileName: string): CliConfig {
    if (!config.profiles[profileName]) {
        throw new CliError("PROFILE_NOT_FOUND", `Profile '${profileName}' does not exist.`, 2);
    }

    return {
        ...config,
        activeProfile: profileName,
    };
}

export function getProfileOrThrow(config: CliConfig, profileName?: string): ProfileConfig {
    const selectedName = profileName || config.activeProfile;
    if (!selectedName) {
        throw new CliError("NO_ACTIVE_PROFILE", "No active profile. Set one with 'ag profile use --profile <name>'.", 2);
    }

    const profile = config.profiles[selectedName];
    if (!profile) {
        throw new CliError("PROFILE_NOT_FOUND", `Profile '${selectedName}' does not exist.`, 2);
    }

    return profile;
}
