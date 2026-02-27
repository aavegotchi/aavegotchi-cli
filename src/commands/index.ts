import { CommandContext, JsonValue } from "../types";
import { runBootstrapCommand } from "./bootstrap";
import { runProfileListCommand, runProfileShowCommand, runProfileUseCommand } from "./profile";
import { runRpcCheckCommand } from "./rpc";

export async function dispatchCommand(ctx: CommandContext): Promise<{ commandName: string; data: JsonValue }> {
    const [root, sub] = ctx.commandPath;

    if (root === "bootstrap") {
        return {
            commandName: "bootstrap",
            data: await runBootstrapCommand(ctx),
        };
    }

    if (root === "profile" && sub === "list") {
        return {
            commandName: "profile list",
            data: await runProfileListCommand(),
        };
    }

    if (root === "profile" && sub === "show") {
        return {
            commandName: "profile show",
            data: await runProfileShowCommand(ctx),
        };
    }

    if (root === "profile" && sub === "use") {
        return {
            commandName: "profile use",
            data: await runProfileUseCommand(ctx),
        };
    }

    if (root === "rpc" && sub === "check") {
        return {
            commandName: "rpc check",
            data: await runRpcCheckCommand(ctx),
        };
    }

    return {
        commandName: "help",
        data: {
            help: true,
        },
    };
}
