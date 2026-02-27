import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { CliError } from "./errors";
import { cliConfigSchema, legacyCliConfigSchema } from "./schemas";
import { CliConfig, PolicyConfig, ProfileConfig } from "./types";

const CONFIG_FILE = "config.json";
const JOURNAL_FILE = "journal.sqlite";

function nowIso(): string {
    return new Date().toISOString();
}

export function createDefaultPolicy(name = "default", timestamp = nowIso()): PolicyConfig {
    return {
        name,
        maxValueWei: undefined,
        maxGasLimit: undefined,
        maxFeePerGasWei: undefined,
        maxPriorityFeePerGasWei: undefined,
        allowedTo: undefined,
        createdAt: timestamp,
        updatedAt: timestamp,
    };
}

function createDefaultConfig(): CliConfig {
    const timestamp = nowIso();

    return {
        schemaVersion: 2,
        profiles: {},
        policies: {
            default: createDefaultPolicy("default", timestamp),
        },
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

export function resolveJournalPath(customHome?: string): string {
    const home = resolveAgcliHome(customHome);
    return path.join(home, JOURNAL_FILE);
}

function migrateLegacyConfig(raw: unknown): CliConfig {
    const legacy = legacyCliConfigSchema.parse(raw);
    const base = createDefaultConfig();

    const policies = { ...base.policies };

    for (const profile of Object.values(legacy.profiles)) {
        if (!policies[profile.policy]) {
            policies[profile.policy] = createDefaultPolicy(profile.policy, profile.createdAt);
        }
    }

    return {
        schemaVersion: 2,
        activeProfile: legacy.activeProfile,
        profiles: legacy.profiles as Record<string, ProfileConfig>,
        policies,
    };
}

export function loadConfig(customHome?: string): CliConfig {
    const configPath = resolveConfigPath(customHome);

    if (!fs.existsSync(configPath)) {
        return createDefaultConfig();
    }

    const raw = fs.readFileSync(configPath, "utf8");

    let parsedJson: unknown;
    try {
        parsedJson = JSON.parse(raw);
    } catch {
        throw new CliError("INVALID_CONFIG", `Config file is not valid JSON: ${configPath}`, 2);
    }

    if (
        typeof parsedJson === "object" &&
        parsedJson !== null &&
        "schemaVersion" in parsedJson &&
        (parsedJson as { schemaVersion?: number }).schemaVersion === 1
    ) {
        return migrateLegacyConfig(parsedJson);
    }

    const parsed = cliConfigSchema.safeParse(parsedJson);
    if (!parsed.success) {
        throw new CliError("INVALID_CONFIG", `Unsupported config format in ${configPath}.`, 2, {
            issues: parsed.error.issues,
        });
    }

    return parsed.data;
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

export function upsertPolicy(config: CliConfig, policy: PolicyConfig): CliConfig {
    return {
        ...config,
        policies: {
            ...config.policies,
            [policy.name]: policy,
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

export function getPolicyOrThrow(config: CliConfig, policyName: string): PolicyConfig {
    const policy = config.policies[policyName];
    if (!policy) {
        throw new CliError("POLICY_NOT_FOUND", `Policy '${policyName}' does not exist.`, 2);
    }

    return policy;
}
