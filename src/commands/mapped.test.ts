import { describe, expect, it } from "vitest";

import { findMappedFunction, listMappedCommands, listMappedCommandsForRoot } from "./mapped";

describe("mapped domain commands", () => {
    it("resolves known mapping", () => {
        expect(findMappedFunction(["lending", "create"])).toBe("addGotchiLending");
        expect(findMappedFunction(["portal", "open"])).toBe("openPortals");
        expect(findMappedFunction(["auction", "bid"])).toBe("commitBid");
        expect(findMappedFunction(["staking", "withdraw-pool"])).toBe("withdrawFromPool");
        expect(findMappedFunction(["gotchi-points", "convert-alchemica"])).toBe("convertAlchemica");
    });

    it("lists mapped commands per root", () => {
        const lending = listMappedCommandsForRoot("lending");
        expect(lending).toContain("lending create");
        expect(lending).toContain("lending agree");
    });

    it("lists mapped commands globally", () => {
        const all = listMappedCommands();
        expect(all).toContain("baazaar buy-now");
        expect(all).toContain("token approve");
    });
});
