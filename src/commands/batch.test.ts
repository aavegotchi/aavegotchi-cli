import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { afterEach, describe, expect, it } from "vitest";

import { runBatchRunCommand } from "./batch";
import { CommandContext } from "../types";

const files: string[] = [];

afterEach(() => {
    for (const file of files.splice(0)) {
        fs.rmSync(file, { force: true });
    }
});

function writePlan(contents: string): string {
    const file = path.join(os.tmpdir(), `agcli-batch-${Date.now()}-${Math.random()}.yaml`);
    fs.writeFileSync(file, contents, "utf8");
    files.push(file);
    return file;
}

function createContext(filePath: string): CommandContext {
    return {
        commandPath: ["batch", "run"],
        args: {
            positionals: ["batch", "run"],
            flags: {
                file: filePath,
            },
        },
        globals: {
            mode: "agent",
            json: true,
            yes: true,
            profile: "prod",
        },
    };
}

describe("batch runner", () => {
    it("runs dependency-ordered steps", async () => {
        const planFile = writePlan(`
version: 1
profile: prod
steps:
  - id: first
    command: profile list
  - id: second
    command: policy list
    dependsOn: [first]
`);

        const calls: string[] = [];
        const result = await runBatchRunCommand(createContext(planFile), async (ctx) => {
            calls.push(ctx.commandPath.join(" "));
            return {
                commandName: ctx.commandPath.join(" "),
                data: { ok: true },
            };
        });

        expect(calls).toEqual(["profile list", "policy list"]);
        expect((result as { results: unknown[] }).results.length).toBe(2);
    });

    it("aborts on step failure when continueOnError is false", async () => {
        const planFile = writePlan(`
version: 1
steps:
  - id: a
    command: profile list
  - id: b
    command: rpc check
`);

        const result = await runBatchRunCommand(createContext(planFile), async (ctx) => {
            if (ctx.commandPath.join(" ") === "rpc check") {
                throw new Error("boom");
            }
            return {
                commandName: "ok",
                data: { ok: true },
            };
        });

        expect((result as { aborted: boolean }).aborted).toBe(true);
    });
});
