import { describe, expect, it } from "vitest";

import { CliError } from "./errors";
import { executeCommand, normalizeCommandPath } from "./command-runner";
import { CommandContext } from "./types";

function createCtx(path: string[]): CommandContext {
    return {
        commandPath: path,
        args: { positionals: path, flags: {} },
        globals: { mode: "agent", json: true, yes: true },
    };
}

describe("command runner UX", () => {
    it("keeps explicit help targets", () => {
        expect(normalizeCommandPath(["help", "tx", "send"])).toEqual(["help", "tx", "send"]);
    });

    it("normalizes empty command path to help", () => {
        expect(normalizeCommandPath([])).toEqual(["help"]);
    });

    it("returns unknown command suggestions", async () => {
        try {
            await executeCommand(createCtx(["tx", "snd"]));
            throw new Error("expected unknown command");
        } catch (error: unknown) {
            const cliError = error as CliError;
            expect(cliError.code).toBe("UNKNOWN_COMMAND");
            const details = cliError.details as { suggestions?: string[] };
            expect(details.suggestions).toContain("tx send");
        }
    });
});
