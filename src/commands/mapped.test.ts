import { describe, expect, it } from "vitest";

import { findMappedFunction, listMappedCommandsForRoot } from "./mapped";

describe("mapped domain commands", () => {
    it("resolves known mapping", () => {
        expect(findMappedFunction(["lending", "create"])).toBe("addGotchiLending");
        expect(findMappedFunction(["portal", "open"])).toBe("openPortals");
    });

    it("lists mapped commands per root", () => {
        const lending = listMappedCommandsForRoot("lending");
        expect(lending).toContain("lending create");
        expect(lending).toContain("lending agree");
    });
});
