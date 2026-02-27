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
    runAuctionActiveSubgraphCommand,
    runAuctionBidsMineSubgraphCommand,
    runAuctionGetSubgraphCommand,
    runAuctionMineSubgraphCommand,
} from "./auction-subgraph";

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

describe("auction subgraph commands", () => {
    it("fetches active auctions with pagination and explicit time", async () => {
        executeSubgraphQueryMock.mockResolvedValueOnce({
            source: "gbm-base",
            endpoint: "https://example.com/gbm",
            queryName: "auction.active",
            data: {
                auctions: [
                    {
                        id: "1",
                        contractAddress: "0xA99c4B08201F2913Db8D28e71d020c4298F29dBF",
                        tokenId: "2",
                        quantity: "1",
                        seller: "0xAb59CA4A16925b0a4BaC5026C94bEB20A29Df479",
                        highestBid: "99",
                        totalBids: "2",
                        startsAt: "1700000",
                        endsAt: "1701000",
                        claimed: false,
                        cancelled: false,
                    },
                ],
            },
        });

        const result = await runAuctionActiveSubgraphCommand(
            createContext(["auction", "active"], {
                first: "7",
                skip: "3",
                "at-time": "1700500",
            }),
        );

        expect(executeSubgraphQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
                source: "gbm-base",
                queryName: "auction.active",
                variables: {
                    now: "1700500",
                    first: 7,
                    skip: 3,
                },
            }),
        );

        expect(result).toMatchObject({
            atTime: "1700500",
            pagination: { first: 7, skip: 3 },
            auctions: [
                {
                    id: "1",
                    contractAddress: "0xa99c4b08201f2913db8d28e71d020c4298f29dbf",
                },
            ],
        });
    });

    it("filters mine query by lowercased seller", async () => {
        executeSubgraphQueryMock.mockResolvedValueOnce({
            source: "gbm-base",
            endpoint: "https://example.com/gbm",
            queryName: "auction.mine",
            data: {
                auctions: [],
            },
        });

        await runAuctionMineSubgraphCommand(
            createContext(["auction", "mine"], {
                seller: "0xAb59CA4A16925b0a4BaC5026C94bEB20A29Df479",
            }),
        );

        expect(executeSubgraphQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
                queryName: "auction.mine",
                variables: expect.objectContaining({
                    seller: "0xab59ca4a16925b0a4bac5026c94beb20a29df479",
                }),
            }),
        );
    });

    it("filters bids-mine query by lowercased bidder", async () => {
        executeSubgraphQueryMock.mockResolvedValueOnce({
            source: "gbm-base",
            endpoint: "https://example.com/gbm",
            queryName: "auction.bids-mine",
            data: {
                bids: [],
            },
        });

        await runAuctionBidsMineSubgraphCommand(
            createContext(["auction", "bids-mine"], {
                bidder: "0xAb59CA4A16925b0a4BaC5026C94bEB20A29Df479",
            }),
        );

        expect(executeSubgraphQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
                queryName: "auction.bids-mine",
                variables: expect.objectContaining({
                    bidder: "0xab59ca4a16925b0a4bac5026c94beb20a29df479",
                }),
            }),
        );
    });

    it("includes raw payload when requested", async () => {
        executeSubgraphQueryMock.mockResolvedValueOnce({
            source: "gbm-base",
            endpoint: "https://example.com/gbm",
            queryName: "auction.get",
            data: {
                auction: {
                    id: "1",
                    contractAddress: "0xA99c4B08201F2913Db8D28e71d020c4298F29dBF",
                    tokenId: "2",
                    quantity: "1",
                    seller: "0xAb59CA4A16925b0a4BaC5026C94bEB20A29Df479",
                    highestBid: "99",
                    totalBids: "2",
                    startsAt: "1700000",
                    endsAt: "1701000",
                    claimed: false,
                    cancelled: false,
                },
            },
            raw: {
                data: {
                    auction: { id: "1" },
                },
            },
        });

        const result = await runAuctionGetSubgraphCommand(
            createContext(["auction", "get"], {
                id: "1",
                raw: true,
            }),
        );

        expect(result).toMatchObject({
            raw: {
                data: {
                    auction: { id: "1" },
                },
            },
        });
    });

    it("throws verify mismatch when onchain snapshot differs", async () => {
        executeSubgraphQueryMock.mockResolvedValueOnce({
            source: "gbm-base",
            endpoint: "https://example.com/gbm",
            queryName: "auction.get",
            data: {
                auction: {
                    id: "5",
                    contractAddress: "0xA99c4B08201F2913Db8D28e71d020c4298F29dBF",
                    tokenId: "200",
                    quantity: "1",
                    seller: "0xAb59CA4A16925b0a4BaC5026C94bEB20A29Df479",
                    highestBid: "300",
                    totalBids: "8",
                    startsAt: "1700000",
                    endsAt: "1701000",
                    claimed: false,
                    cancelled: false,
                },
            },
        });

        const readContract = vi.fn(async (input: { functionName: string }) => {
            switch (input.functionName) {
                case "getAuctionHighestBid":
                    return 301n;
                case "getContractAddress":
                    return "0xa99c4b08201f2913db8d28e71d020c4298f29dbf";
                case "getTokenId":
                    return 200n;
                case "getAuctionStartTime":
                    return 1700000n;
                case "getAuctionEndTime":
                    return 1701000n;
                default:
                    return 0n;
            }
        });

        runRpcPreflightMock.mockResolvedValueOnce({
            chainId: 8453,
            client: {
                readContract,
            },
        });

        await expect(
            runAuctionGetSubgraphCommand(
                createContext(["auction", "get"], {
                    id: "5",
                    "verify-onchain": true,
                }),
            ),
        ).rejects.toMatchObject({
            code: "SUBGRAPH_VERIFY_MISMATCH",
        });
    });
});
