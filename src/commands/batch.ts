import * as fs from "fs";

import YAML from "yaml";

import { getFlagString } from "../args";
import { CliError } from "../errors";
import { batchPlanSchema, type BatchPlan } from "../schemas";
import { CommandContext, GlobalOptions, JsonValue, ParsedArgs } from "../types";

interface BatchStepResult {
    id: string;
    command: string;
    status: "ok" | "error" | "skipped";
    startedAt: string;
    finishedAt: string;
    data?: JsonValue;
    error?: {
        code: string;
        message: string;
    };
}

export type BatchExecutor = (ctx: CommandContext) => Promise<{ commandName: string; data: JsonValue }>;

function parseBatchFile(filePath: string): BatchPlan {
    if (!fs.existsSync(filePath)) {
        throw new CliError("BATCH_FILE_NOT_FOUND", `Batch file not found: ${filePath}`, 2);
    }

    const source = fs.readFileSync(filePath, "utf8");
    const raw = YAML.parse(source);

    const parsed = batchPlanSchema.safeParse(raw);
    if (!parsed.success) {
        throw new CliError("INVALID_BATCH_PLAN", "Batch plan validation failed.", 2, {
            issues: parsed.error.issues,
        });
    }

    return parsed.data;
}

function createStepArgs(stepCommand: string, args: Record<string, string | number | boolean> | undefined): ParsedArgs {
    const positionals = stepCommand.split(" ").map((entry) => entry.trim()).filter(Boolean);

    const flags: ParsedArgs["flags"] = {};
    for (const [key, value] of Object.entries(args || {})) {
        flags[key] = typeof value === "number" ? String(value) : value;
    }

    return {
        positionals,
        flags,
    };
}

function mergeGlobals(parent: GlobalOptions, plan: BatchPlan): GlobalOptions {
    return {
        ...parent,
        mode: plan.mode || parent.mode,
        profile: plan.profile || parent.profile,
        json: true,
        yes: true,
    };
}

function dependenciesDone(stepDependsOn: string[] | undefined, completed: Set<string>): boolean {
    if (!stepDependsOn || stepDependsOn.length === 0) {
        return true;
    }

    return stepDependsOn.every((dep) => completed.has(dep));
}

export async function runBatchRunCommand(ctx: CommandContext, executor: BatchExecutor): Promise<JsonValue> {
    const filePath = getFlagString(ctx.args.flags, "file") || getFlagString(ctx.args.flags, "f");
    if (!filePath) {
        throw new CliError("MISSING_ARGUMENT", "batch run requires --file <plan.yaml>", 2);
    }

    const plan = parseBatchFile(filePath);
    const globals = mergeGlobals(ctx.globals, plan);

    const completed = new Set<string>();
    const failed = new Set<string>();
    const results: BatchStepResult[] = [];

    const pending = [...plan.steps];

    while (pending.length > 0) {
        let progressed = false;

        for (let index = 0; index < pending.length; index++) {
            const step = pending[index];
            if (!dependenciesDone(step.dependsOn, completed)) {
                continue;
            }

            progressed = true;
            pending.splice(index, 1);
            index--;

            const startedAt = new Date().toISOString();

            if (step.dependsOn && step.dependsOn.some((dep) => failed.has(dep))) {
                results.push({
                    id: step.id,
                    command: step.command,
                    status: "skipped",
                    startedAt,
                    finishedAt: new Date().toISOString(),
                    error: {
                        code: "DEPENDENCY_FAILED",
                        message: "One or more dependency steps failed.",
                    },
                });
                continue;
            }

            const stepArgs = createStepArgs(step.command, step.args);

            try {
                const childCtx: CommandContext = {
                    commandPath: stepArgs.positionals,
                    args: {
                        positionals: stepArgs.positionals,
                        flags: {
                            ...stepArgs.flags,
                            ...(globals.profile ? { profile: globals.profile } : {}),
                        },
                    },
                    globals,
                };

                const executed = await executor(childCtx);
                completed.add(step.id);

                results.push({
                    id: step.id,
                    command: step.command,
                    status: "ok",
                    startedAt,
                    finishedAt: new Date().toISOString(),
                    data: {
                        commandName: executed.commandName,
                        data: executed.data,
                    },
                });
            } catch (error) {
                failed.add(step.id);

                const normalized = error instanceof CliError ? error : new CliError("STEP_FAILED", String(error));
                results.push({
                    id: step.id,
                    command: step.command,
                    status: "error",
                    startedAt,
                    finishedAt: new Date().toISOString(),
                    error: {
                        code: normalized.code,
                        message: normalized.message,
                    },
                });

                const shouldContinue = step.continueOnError ?? plan.continueOnError ?? false;
                if (!shouldContinue) {
                    return {
                        filePath,
                        aborted: true,
                        results,
                    };
                }
            }
        }

        if (!progressed) {
            throw new CliError("BATCH_DEPENDENCY_CYCLE", "Batch plan has unmet/cyclic dependencies.", 2, {
                pending: pending.map((step) => ({
                    id: step.id,
                    dependsOn: step.dependsOn || [],
                })),
                completed: [...completed],
                failed: [...failed],
            });
        }
    }

    return {
        filePath,
        completed: [...completed],
        failed: [...failed],
        results,
    };
}
