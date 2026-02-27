import { describe, expect, it } from "vitest";

import { findMappedFunction, listMappedCommands, listMappedCommandsForRoot } from "./mapped";
import { getMappedWriteDefaults } from "./mapped-defaults";
import { BASE_AAVEGOTCHI_DIAMOND, BASE_FORGE_DIAMOND, BASE_GBM_DIAMOND, BASE_GLTR_STAKING } from "../subgraph/sources";

describe("mapped domain commands", () => {
    it("resolves known mapping", () => {
        expect(findMappedFunction(["lending", "create"])).toBe("addGotchiLending");
        expect(findMappedFunction(["portal", "open"])).toBe("openPortals");
        expect(findMappedFunction(["auction", "bid"])).toBe("commitBid");
        expect(findMappedFunction(["staking", "withdraw-pool"])).toBe("withdrawFromPool");
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

    it("provides built-in ABI defaults for every mapped command", () => {
        const all = listMappedCommands();
        const missing = all.filter((command) => !getMappedWriteDefaults(command.split(" "))?.abi);
        expect(missing).toEqual([]);
    });

    it("pins canonical contract addresses for high-confidence commands", () => {
        expect(getMappedWriteDefaults(["lending", "create"])?.address).toBe(BASE_AAVEGOTCHI_DIAMOND);
        expect(getMappedWriteDefaults(["auction", "bid"])?.address).toBe(BASE_GBM_DIAMOND);
        expect(getMappedWriteDefaults(["forge", "craft"])?.address).toBe(BASE_FORGE_DIAMOND);
        expect(getMappedWriteDefaults(["realm", "harvest", "batch"])?.address).toBe(BASE_GLTR_STAKING);
        expect(getMappedWriteDefaults(["token", "approve"])?.address).toBeUndefined();
    });
});
