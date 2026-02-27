import { afterEach, describe, expect, it, vi } from "vitest";

import { CommandContext } from "../types";

const { executeSubgraphQueryMock, runRpcPreflightMock } = vi.hoisted(() => ({
    executeSubgraphQueryMock: vi.fn(),
    runRpcPreflightMock: vi.fn(),
}));

vi.mock("../subgraph/client", () => ({
    executeSubgraphQuery: executeSubgraphQueryMock,
}));

vi.mock("../rpc", () => ({
    runRpcPreflight: runRpcPreflightMock,
}));

import {
    runBaazaarListingActiveSubgraphCommand,
    runBaazaarListingGetSubgraphCommand,
    runBaazaarListingMineSubgraphCommand,
} from "./baazaar-subgraph";

function createContext(positionals: string[], flags: Record<string, string | boolean>): CommandContext {
    return {
        commandPath: positionals,
        args: { positionals, flags },
        globals: {
            mode: "agent",
            json: true,
            yes: true,
        },
    };
}

afterEach(() => {
    vi.clearAllMocks();
});

describe("baazaar subgraph commands", () => {
    it("gets erc721 listing and normalizes fields", async () => {
        executeSubgraphQueryMock.mockResolvedValueOnce({
            source: "core-base",
            endpoint: "https://example.com/core",
            queryName: "baazaar.listing.get.erc721",
            data: {
                erc721Listing: {
                    id: "10",
                    category: "3",
                    erc721TokenAddress: "0xA99c4B08201F2913Db8D28e71d020c4298F29dBF",
                    tokenId: "99",
                    seller: "0xAb59CA4A16925b0a4BaC5026C94bEB20A29Df479",
                    priceInWei: "100",
                    cancelled: false,
                    timeCreated: "1700000",
                    timePurchased: "0",
                },
            },
        });

        const result = await runBaazaarListingGetSubgraphCommand(
            createContext(["baazaar", "listing", "get"], {
                kind: "erc721",
                id: "10",
            }),
        );

        expect(executeSubgraphQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
                source: "core-base",
                queryName: "baazaar.listing.get.erc721",
                variables: { id: "10" },
            }),
        );

        expect(result).toMatchObject({
            source: "core-base",
            endpoint: "https://example.com/core",
            listingKind: "erc721",
            listing: {
                id: "10",
                erc721TokenAddress: "0xa99c4b08201f2913db8d28e71d020c4298f29dbf",
                seller: "0xab59ca4a16925b0a4bac5026c94beb20a29df479",
            },
        });
    });

    it("returns active erc1155 listings with pagination", async () => {
        executeSubgraphQueryMock.mockResolvedValueOnce({
            source: "core-base",
            endpoint: "https://example.com/core",
            queryName: "baazaar.listing.active.erc1155",
            data: {
                erc1155Listings: [
                    {
                        id: "11",
                        category: "4",
                        erc1155TokenAddress: "0xA99c4B08201F2913Db8D28e71d020c4298F29dBF",
                        erc1155TypeId: "44",
                        quantity: "2",
                        seller: "0xAb59CA4A16925b0a4BaC5026C94bEB20A29Df479",
                        priceInWei: "123",
                        cancelled: false,
                        sold: false,
                        timeCreated: "1700001",
                    },
                ],
            },
        });

        const result = await runBaazaarListingActiveSubgraphCommand(
            createContext(["baazaar", "listing", "active"], {
                kind: "erc1155",
                first: "5",
                skip: "10",
            }),
        );

        expect(executeSubgraphQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
                queryName: "baazaar.listing.active.erc1155",
                variables: { first: 5, skip: 10 },
            }),
        );

        expect(result).toMatchObject({
            listingKind: "erc1155",
            pagination: { first: 5, skip: 10 },
            listings: [
                {
                    id: "11",
                    erc1155TypeId: "44",
                },
            ],
        });
    });

    it("filters mine query with lowercased seller address", async () => {
        executeSubgraphQueryMock.mockResolvedValueOnce({
            source: "core-base",
            endpoint: "https://example.com/core",
            queryName: "baazaar.listing.mine.erc721",
            data: {
                erc721Listings: [],
            },
        });

        await runBaazaarListingMineSubgraphCommand(
            createContext(["baazaar", "listing", "mine"], {
                kind: "erc721",
                seller: "0xAb59CA4A16925b0a4BaC5026C94bEB20A29Df479",
            }),
        );

        expect(executeSubgraphQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
                queryName: "baazaar.listing.mine.erc721",
                variables: expect.objectContaining({
                    seller: "0xab59ca4a16925b0a4bac5026c94beb20a29df479",
                }),
            }),
        );
    });

    it("includes raw payload when requested", async () => {
        executeSubgraphQueryMock.mockResolvedValueOnce({
            source: "core-base",
            endpoint: "https://example.com/core",
            queryName: "baazaar.listing.get.erc1155",
            data: {
                erc1155Listing: {
                    id: "1",
                    category: "4",
                    erc1155TokenAddress: "0xA99c4B08201F2913Db8D28e71d020c4298F29dBF",
                    erc1155TypeId: "44",
                    quantity: "1",
                    seller: "0xAb59CA4A16925b0a4BaC5026C94bEB20A29Df479",
                    priceInWei: "1",
                    cancelled: false,
                    sold: false,
                    timeCreated: "1",
                },
            },
            raw: {
                data: {
                    erc1155Listing: { id: "1" },
                },
            },
        });

        const result = await runBaazaarListingGetSubgraphCommand(
            createContext(["baazaar", "listing", "get"], {
                kind: "erc1155",
                id: "1",
                raw: true,
            }),
        );

        expect(result).toMatchObject({
            raw: {
                data: {
                    erc1155Listing: { id: "1" },
                },
            },
        });
    });

    it("throws verify mismatch when onchain snapshot differs", async () => {
        executeSubgraphQueryMock.mockResolvedValueOnce({
            source: "core-base",
            endpoint: "https://example.com/core",
            queryName: "baazaar.listing.get.erc721",
            data: {
                erc721Listing: {
                    id: "10",
                    category: "3",
                    erc721TokenAddress: "0xA99c4B08201F2913Db8D28e71d020c4298F29dBF",
                    tokenId: "99",
                    seller: "0xAb59CA4A16925b0a4BaC5026C94bEB20A29Df479",
                    priceInWei: "100",
                    cancelled: false,
                    timeCreated: "1700000",
                    timePurchased: "0",
                },
            },
        });

        runRpcPreflightMock.mockResolvedValueOnce({
            chainId: 8453,
            client: {
                readContract: vi.fn(async () => ({
                    listingId: 10n,
                    seller: "0xab59ca4a16925b0a4bac5026c94beb20a29df479",
                    erc721TokenAddress: "0xa99c4b08201f2913db8d28e71d020c4298f29dbf",
                    erc721TokenId: 99n,
                    category: 3n,
                    priceInWei: 200n,
                    timeCreated: 1700000n,
                    timePurchased: 0n,
                    cancelled: false,
                })),
            },
        });

        await expect(
            runBaazaarListingGetSubgraphCommand(
                createContext(["baazaar", "listing", "get"], {
                    kind: "erc721",
                    id: "10",
                    "verify-onchain": true,
                }),
            ),
        ).rejects.toMatchObject({
            code: "SUBGRAPH_VERIFY_MISMATCH",
        });
    });
});
