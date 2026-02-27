import { CliError } from "../errors";
import { CommandContext, JsonValue } from "../types";

const SUPPORTED_STUB_ROOTS = [
    "gotchi",
    "portal",
    "wearables",
    "items",
    "inventory",
    "baazaar",
    "lending",
    "realm",
    "alchemica",
    "forge",
    "token",
] as const;

export function isDomainStubRoot(root: string): boolean {
    return SUPPORTED_STUB_ROOTS.includes(root as (typeof SUPPORTED_STUB_ROOTS)[number]);
}

export async function runDomainStubCommand(ctx: CommandContext): Promise<JsonValue> {
    const command = ctx.commandPath.join(" ");

    throw new CliError("COMMAND_NOT_IMPLEMENTED", `Command '${command}' is planned but not implemented yet.`, 2, {
        command,
        plannedRoots: SUPPORTED_STUB_ROOTS,
    });
}
