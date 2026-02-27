import { describe, expect, it } from "vitest";

import { normalizeGlobals, parseArgv } from "./args";

describe("agcli args", () => {
    it("parses positionals and flags", () => {
        const parsed = parseArgv([
            "bootstrap",
            "--profile",
            "prod",
            "--mode=agent",
            "--json",
            "-y",
        ]);

        expect(parsed.positionals).toEqual(["bootstrap"]);
        expect(parsed.flags.profile).toBe("prod");
        expect(parsed.flags.mode).toBe("agent");
        expect(parsed.flags.json).toBe(true);
        expect(parsed.flags.y).toBe(true);
    });

    it("enables json and yes by default in agent mode", () => {
        const parsed = parseArgv(["profile", "list", "--mode", "agent"]);
        const globals = normalizeGlobals(parsed);

        expect(globals.mode).toBe("agent");
        expect(globals.json).toBe(true);
        expect(globals.yes).toBe(true);
    });

    it("keeps human defaults when mode is omitted", () => {
        const parsed = parseArgv(["profile", "list"]);
        const globals = normalizeGlobals(parsed);

        expect(globals.mode).toBe("human");
        expect(globals.json).toBe(false);
        expect(globals.yes).toBe(false);
    });
});
