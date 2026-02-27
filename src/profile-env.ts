import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { resolveAgcliHome } from "./config";
import { CliError } from "./errors";
import { ProfileConfig, SignerConfig } from "./types";

export interface SignerEnvDiagnostics {
    source: "profile" | "auto" | "none";
    path: string | null;
    loaded: string[];
    skippedExisting: string[];
    searched?: string[];
}

function parseAssignment(rawLine: string, lineNumber: number, filePath: string): [string, string] | null {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
        return null;
    }

    const withoutExport = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trim() : trimmed;
    const equalsIndex = withoutExport.indexOf("=");
    if (equalsIndex <= 0) {
        throw new CliError("INVALID_ENV_FILE", `Invalid env assignment at ${filePath}:${lineNumber}.`, 2, {
            line: rawLine,
        });
    }

    const key = withoutExport.slice(0, equalsIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        throw new CliError("INVALID_ENV_FILE", `Invalid env key '${key}' at ${filePath}:${lineNumber}.`, 2);
    }

    let value = withoutExport.slice(equalsIndex + 1).trim();
    if (
        (value.startsWith("\"") && value.endsWith("\"") && value.length >= 2) ||
        (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
        value = value.slice(1, -1);
    }

    return [key, value];
}

function loadEnvAssignments(filePath: string): Array<[string, string]> {
    const raw = fs.readFileSync(filePath, "utf8");
    const lines = raw.split(/\r?\n/);
    const assignments: Array<[string, string]> = [];

    for (let index = 0; index < lines.length; index++) {
        const parsed = parseAssignment(lines[index], index + 1, filePath);
        if (parsed) {
            assignments.push(parsed);
        }
    }

    return assignments;
}

function resolveEnvPath(envFile: string, customHome?: string): string {
    if (envFile.startsWith("~/")) {
        return path.join(os.homedir(), envFile.slice(2));
    }

    if (path.isAbsolute(envFile)) {
        return envFile;
    }

    return path.resolve(resolveAgcliHome(customHome), envFile);
}

function applyEnvFromPath(
    source: "profile" | "auto",
    envPath: string,
    searched?: string[],
): SignerEnvDiagnostics {
    const loaded: string[] = [];
    const skippedExisting: string[] = [];
    const assignments = loadEnvAssignments(envPath);

    for (const [key, value] of assignments) {
        if (process.env[key] === undefined) {
            process.env[key] = value;
            loaded.push(key);
        } else {
            skippedExisting.push(key);
        }
    }

    return {
        source,
        path: envPath,
        loaded,
        skippedExisting,
        ...(searched ? { searched } : {}),
    };
}

function uniquePaths(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        const normalized = path.resolve(value);
        if (!seen.has(normalized)) {
            seen.add(normalized);
            result.push(normalized);
        }
    }

    return result;
}

function buildBankrAutoCandidates(customHome?: string): string[] {
    const home = resolveAgcliHome(customHome);
    const configured = process.env.AGCLI_BANKR_ENV_FILE;
    const cwd = process.cwd();

    return uniquePaths(
        [
            configured || "",
            path.join(home, "bankr.env"),
            path.join(home, ".env.bankr"),
            path.join(os.homedir(), ".config/openclaw/bankr.env"),
            path.join(cwd, ".env.bankr"),
            path.join(cwd, "bankr.env"),
        ].filter(Boolean),
    );
}

export function applySignerEnvironment(
    signer: SignerConfig,
    options?: {
        envFile?: string;
        customHome?: string;
    },
): SignerEnvDiagnostics {
    const explicitEnvFile = options?.envFile?.trim();
    if (explicitEnvFile) {
        const resolvedPath = resolveEnvPath(explicitEnvFile, options?.customHome);
        if (!fs.existsSync(resolvedPath)) {
            throw new CliError("ENV_FILE_NOT_FOUND", `Environment file not found: ${resolvedPath}`, 2, {
                envFile: explicitEnvFile,
                resolvedPath,
            });
        }

        return applyEnvFromPath("profile", resolvedPath);
    }

    if (signer.type !== "bankr") {
        return {
            source: "none",
            path: null,
            loaded: [],
            skippedExisting: [],
        };
    }

    const searched = buildBankrAutoCandidates(options?.customHome);
    for (const candidate of searched) {
        if (fs.existsSync(candidate)) {
            return applyEnvFromPath("auto", candidate, searched);
        }
    }

    return {
        source: "none",
        path: null,
        loaded: [],
        skippedExisting: [],
        searched,
    };
}

export function applyProfileEnvironment(profile: ProfileConfig, customHome?: string): SignerEnvDiagnostics {
    return applySignerEnvironment(profile.signer, {
        envFile: profile.envFile,
        customHome,
    });
}
