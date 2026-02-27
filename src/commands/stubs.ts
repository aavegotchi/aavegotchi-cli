import { CliError } from "../errors";
import { CommandContext, JsonValue } from "../types";
import { listMappedCommandsForRoot } from "./mapped";

const SUPPORTED_STUB_ROOTS = [
    "gotchi",
    "portal",
    "wearables",
    "items",
    "inventory",
    "baazaar",
    "auction",
    "lending",
    "staking",
    "realm",
    "alchemica",
    "forge",
    "token",
] as const;

export function isDomainStubRoot(root: string): boolean {
    return SUPPORTED_STUB_ROOTS.includes(root as (typeof SUPPORTED_STUB_ROOTS)[number]);
}

export function listDomainStubRoots(): readonly string[] {
    return SUPPORTED_STUB_ROOTS;
}

export async function runDomainStubCommand(ctx: CommandContext): Promise<JsonValue> {
    const command = ctx.commandPath.join(" ");
    const root = ctx.commandPath[0];
    const availableMapped = listMappedCommandsForRoot(root);

    throw new CliError("COMMAND_NOT_IMPLEMENTED", `Command '${command}' is planned but not implemented yet.`, 2, {
        command,
        hint: "Run 'ag help <command>' for usage. Mapped writes require --abi-file/--address/--args-json.",
        availableMapped,
        plannedRoots: SUPPORTED_STUB_ROOTS,
    });
}
