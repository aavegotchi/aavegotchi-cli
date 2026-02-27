#!/usr/bin/env node
import { normalizeGlobals, parseArgv } from "./args";
import { dispatchCommand } from "./commands";
import { toCliError } from "./errors";
import { outputError, outputHelp, outputSuccess } from "./output";
import { CommandContext } from "./types";

function resolveCommandPath(positionals: string[]): string[] {
    if (positionals.length === 0) {
        return ["help"];
    }

    if (positionals[0] === "help") {
        return ["help"];
    }

    if (positionals[0] === "profile" || positionals[0] === "rpc") {
        return [positionals[0], positionals[1] || "show"];
    }

    return [positionals[0]];
}

async function run(): Promise<void> {
    const args = parseArgv(process.argv.slice(2));
    const globals = normalizeGlobals(args);
    const commandPath = resolveCommandPath(args.positionals);

    if (commandPath[0] === "help") {
        outputHelp();
        return;
    }

    const ctx: CommandContext = {
        commandPath,
        args,
        globals,
    };

    const { commandName, data } = await dispatchCommand(ctx);
    outputSuccess(commandName, data, globals);
}

run().catch((error: unknown) => {
    const args = parseArgv(process.argv.slice(2));
    const globals = normalizeGlobals(args);
    const cliError = toCliError(error);
    outputError(args.positionals.join(" ") || "unknown", cliError, globals);
    process.exitCode = cliError.exitCode;
});
