import { CliError } from "./errors";
import { FlagValue, GlobalOptions, ParsedArgs, RunMode } from "./types";

export function parseArgv(argv: string[]): ParsedArgs {
    const positionals: string[] = [];
    const flags: Record<string, FlagValue> = {};

    for (let i = 0; i < argv.length; i++) {
        const token = argv[i];

        if (!token.startsWith("-")) {
            positionals.push(token);
            continue;
        }

        if (token.startsWith("--")) {
            const body = token.slice(2);
            const eqIndex = body.indexOf("=");

            if (eqIndex >= 0) {
                const key = body.slice(0, eqIndex);
                const value = body.slice(eqIndex + 1);
                flags[key] = value;
                continue;
            }

            const key = body;
            const next = argv[i + 1];
            if (next && !next.startsWith("-")) {
                flags[key] = next;
                i++;
                continue;
            }

            flags[key] = true;
            continue;
        }

        // Short flags can be grouped, e.g. -jy
        const shorts = token.slice(1).split("");
        for (const shortFlag of shorts) {
            flags[shortFlag] = true;
        }
    }

    return { positionals, flags };
}

export function getFlagString(flags: Record<string, FlagValue>, ...keys: string[]): string | undefined {
    for (const key of keys) {
        const value = flags[key];
        if (typeof value === "string") {
            return value;
        }
    }

    return undefined;
}

export function getFlagBoolean(flags: Record<string, FlagValue>, ...keys: string[]): boolean {
    for (const key of keys) {
        const value = flags[key];
        if (typeof value === "boolean") {
            return value;
        }

        if (typeof value === "string") {
            const normalized = value.toLowerCase();
            if (normalized === "true") {
                return true;
            }

            if (normalized === "false") {
                return false;
            }
        }
    }

    return false;
}

export function normalizeGlobals(args: ParsedArgs): GlobalOptions {
    const modeValue = getFlagString(args.flags, "mode");
    const mode = normalizeMode(modeValue);

    const explicitJson = getFlagBoolean(args.flags, "json", "j");
    const explicitYes = getFlagBoolean(args.flags, "yes", "y");

    // Agent mode defaults to machine-first behavior.
    const json = explicitJson || mode === "agent";
    const yes = explicitYes || mode === "agent";

    const profile = getFlagString(args.flags, "profile");

    return {
        mode,
        json,
        yes,
        profile,
    };
}

export function normalizeMode(value?: string): RunMode {
    if (!value) {
        return "human";
    }

    const normalized = value.toLowerCase();
    if (normalized === "human" || normalized === "agent") {
        return normalized;
    }

    throw new CliError("INVALID_MODE", `Unsupported mode '${value}'. Expected 'human' or 'agent'.`, 2);
}
