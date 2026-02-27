import { CliError } from "./errors";
import { CommandContext, JsonValue } from "./types";
import { runBatchRunCommand } from "./commands/batch";
import { runBootstrapCommand } from "./commands/bootstrap";
import { findMappedFunction, runMappedDomainCommand } from "./commands/mapped";
import { runOnchainCallCommand, runOnchainSendCommand } from "./commands/onchain";
import {
    runPolicyListCommand,
    runPolicyShowCommand,
    runPolicyUpsertCommand,
} from "./commands/policy";
import {
    runProfileExportCommand,
    runProfileListCommand,
    runProfileShowCommand,
    runProfileUseCommand,
} from "./commands/profile";
import { runRpcCheckCommand } from "./commands/rpc";
import {
    runSignerCheckCommand,
    runSignerKeychainImportCommand,
    runSignerKeychainListCommand,
    runSignerKeychainRemoveCommand,
} from "./commands/signer";
import { isDomainStubRoot, runDomainStubCommand } from "./commands/stubs";
import { runTxResumeCommand, runTxSendCommand, runTxStatusCommand, runTxWatchCommand } from "./commands/tx";

export interface CommandExecutionResult {
    commandName: string;
    data: JsonValue;
}

export function normalizeCommandPath(positionals: string[]): string[] {
    if (positionals.length === 0 || positionals[0] === "help") {
        return ["help"];
    }

    return positionals;
}

export async function executeCommand(ctx: CommandContext): Promise<CommandExecutionResult> {
    const [root, sub] = ctx.commandPath;

    if (root === "help") {
        return {
            commandName: "help",
            data: { help: true },
        };
    }

    if (root === "bootstrap") {
        return {
            commandName: "bootstrap",
            data: await runBootstrapCommand(ctx),
        };
    }

    if (root === "profile") {
        if (!sub || sub === "show") {
            return {
                commandName: "profile show",
                data: await runProfileShowCommand(ctx),
            };
        }

        if (sub === "list") {
            return {
                commandName: "profile list",
                data: await runProfileListCommand(),
            };
        }

        if (sub === "use") {
            return {
                commandName: "profile use",
                data: await runProfileUseCommand(ctx),
            };
        }

        if (sub === "export") {
            return {
                commandName: "profile export",
                data: await runProfileExportCommand(ctx),
            };
        }
    }

    if (root === "policy") {
        if (!sub || sub === "list") {
            return {
                commandName: "policy list",
                data: await runPolicyListCommand(),
            };
        }

        if (sub === "show") {
            return {
                commandName: "policy show",
                data: await runPolicyShowCommand(ctx),
            };
        }

        if (sub === "upsert" || sub === "set") {
            return {
                commandName: "policy upsert",
                data: await runPolicyUpsertCommand(ctx),
            };
        }
    }

    if (root === "rpc") {
        if (!sub || sub === "check") {
            return {
                commandName: "rpc check",
                data: await runRpcCheckCommand(ctx),
            };
        }
    }

    if (root === "signer") {
        if (!sub || sub === "check") {
            return {
                commandName: "signer check",
                data: await runSignerCheckCommand(ctx),
            };
        }

        if (sub === "keychain") {
            const action = ctx.commandPath[2];
            if (!action || action === "list") {
                return {
                    commandName: "signer keychain list",
                    data: await runSignerKeychainListCommand(),
                };
            }

            if (action === "import") {
                return {
                    commandName: "signer keychain import",
                    data: await runSignerKeychainImportCommand(ctx),
                };
            }

            if (action === "remove") {
                return {
                    commandName: "signer keychain remove",
                    data: await runSignerKeychainRemoveCommand(ctx),
                };
            }
        }
    }

    if (root === "tx") {
        if (!sub || sub === "status") {
            return {
                commandName: "tx status",
                data: await runTxStatusCommand(ctx),
            };
        }

        if (sub === "send") {
            return {
                commandName: "tx send",
                data: await runTxSendCommand(ctx),
            };
        }

        if (sub === "resume") {
            return {
                commandName: "tx resume",
                data: await runTxResumeCommand(ctx),
            };
        }

        if (sub === "watch") {
            return {
                commandName: "tx watch",
                data: await runTxWatchCommand(ctx),
            };
        }
    }

    if (root === "onchain") {
        if (!sub || sub === "call") {
            return {
                commandName: "onchain call",
                data: await runOnchainCallCommand(ctx),
            };
        }

        if (sub === "send") {
            return {
                commandName: "onchain send",
                data: await runOnchainSendCommand(ctx),
            };
        }
    }

    if (root === "batch" && (!sub || sub === "run")) {
        return {
            commandName: "batch run",
            data: await runBatchRunCommand(ctx, executeCommand),
        };
    }

    if (findMappedFunction(ctx.commandPath)) {
        return {
            commandName: ctx.commandPath.join(" "),
            data: await runMappedDomainCommand(ctx),
        };
    }

    if (isDomainStubRoot(root) && sub === "read") {
        return {
            commandName: ctx.commandPath.join(" "),
            data: await runOnchainCallCommand(ctx),
        };
    }

    if (isDomainStubRoot(root)) {
        return {
            commandName: ctx.commandPath.join(" "),
            data: await runDomainStubCommand(ctx),
        };
    }

    throw new CliError("UNKNOWN_COMMAND", `Unknown command '${ctx.commandPath.join(" ")}'.`, 2);
}
