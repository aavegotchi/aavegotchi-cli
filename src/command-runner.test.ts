import { afterEach, describe, expect, it, vi } from "vitest";

import { CommandContext } from "./types";

const {
    findMappedFunctionMock,
    runMappedDomainCommandMock,
    runAuctionSubgraphCommandMock,
    runBaazaarListingSubgraphCommandMock,
} = vi.hoisted(() => ({
    findMappedFunctionMock: vi.fn(),
    runMappedDomainCommandMock: vi.fn(),
    runAuctionSubgraphCommandMock: vi.fn(),
    runBaazaarListingSubgraphCommandMock: vi.fn(),
}));

vi.mock("./commands/mapped", () => ({
    findMappedFunction: findMappedFunctionMock,
    runMappedDomainCommand: runMappedDomainCommandMock,
}));

vi.mock("./commands/auction-subgraph", () => ({
    runAuctionSubgraphCommand: runAuctionSubgraphCommandMock,
}));

vi.mock("./commands/baazaar-subgraph", () => ({
    runBaazaarListingSubgraphCommand: runBaazaarListingSubgraphCommandMock,
}));

import { executeCommand } from "./command-runner";

function createCtx(path: string[]): CommandContext {
    return {
        commandPath: path,
        args: { positionals: path, flags: {} },
        globals: { mode: "agent", json: true, yes: true },
    };
}

describe("command runner routing", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("routes auction active to subgraph wrapper before mapped fallback", async () => {
        findMappedFunctionMock.mockReturnValue("unexpectedMapping");
        runAuctionSubgraphCommandMock.mockResolvedValue({ auctions: [] });

        const result = await executeCommand(createCtx(["auction", "active"]));

        expect(result.commandName).toBe("auction active");
        expect(result.data).toEqual({ auctions: [] });
        expect(runAuctionSubgraphCommandMock).toHaveBeenCalledTimes(1);
        expect(runMappedDomainCommandMock).not.toHaveBeenCalled();
    });

    it("routes baazaar listing get to subgraph wrapper", async () => {
        runBaazaarListingSubgraphCommandMock.mockResolvedValue({ listing: null });

        const result = await executeCommand(createCtx(["baazaar", "listing", "get"]));

        expect(result.commandName).toBe("baazaar listing get");
        expect(result.data).toEqual({ listing: null });
        expect(runBaazaarListingSubgraphCommandMock).toHaveBeenCalledTimes(1);
    });

    it("keeps mapped writes working for auction buy-now", async () => {
        findMappedFunctionMock.mockReturnValue("buyNow");
        runMappedDomainCommandMock.mockResolvedValue({ mappedMethod: "buyNow" });

        const result = await executeCommand(createCtx(["auction", "buy-now"]));

        expect(result.commandName).toBe("auction buy-now");
        expect(result.data).toEqual({ mappedMethod: "buyNow" });
        expect(runAuctionSubgraphCommandMock).not.toHaveBeenCalled();
        expect(runMappedDomainCommandMock).toHaveBeenCalledTimes(1);
    });
});
