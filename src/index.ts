#!/usr/bin/env node
import { getFlagBoolean, normalizeGlobals, parseArgv } from "./args";
import { executeCommand, normalizeCommandPath } from "./command-runner";
import { toCliError } from "./errors";
import { initializeLogger } from "./logger";
import { outputError, outputHelp, outputSuccess } from "./output";
import { CommandContext } from "./types";

async function run(): Promise<void> {
    const args = parseArgv(process.argv.slice(2));
    const globals = normalizeGlobals(args);
    initializeLogger(globals);

    const commandPath = normalizeCommandPath(args.positionals);
    const helpRequested = getFlagBoolean(args.flags, "help", "h");

    if (commandPath[0] === "help") {
        outputHelp(commandPath.slice(1), args.flags);
        return;
    }

    if (helpRequested) {
        outputHelp(commandPath, args.flags);
        return;
    }

    const ctx: CommandContext = {
        commandPath,
        args,
        globals,
    };

    const { commandName, data } = await executeCommand(ctx);
    outputSuccess(commandName, data, globals);
}

run().catch((error: unknown) => {
    const args = parseArgv(process.argv.slice(2));
    const globals = normalizeGlobals(args);
    initializeLogger(globals);
    const cliError = toCliError(error);
    outputError(args.positionals.join(" ") || "unknown", cliError, globals);
    process.exitCode = cliError.exitCode;
});
