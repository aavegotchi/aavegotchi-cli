import { describe, expect, it } from "vitest";

import { listKnownCommands, suggestCommands } from "./command-catalog";

describe("command catalog", () => {
    it("contains built-in and mapped commands", () => {
        const commands = listKnownCommands();
        expect(commands).toContain("tx send");
        expect(commands).toContain("baazaar buy-now");
    });

    it("suggests close command matches", () => {
        const suggestions = suggestCommands("baazaar buy-nw");
        expect(suggestions[0]).toBe("baazaar buy-now");
    });
});
