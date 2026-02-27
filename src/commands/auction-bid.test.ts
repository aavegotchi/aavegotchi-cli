import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CliError } from "../errors";
import { CommandContext } from "../types";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const {
    loadConfigMock,
    getProfileOrThrowMock,
    getPolicyOrThrowMock,
    resolveChainMock,
    resolveRpcUrlMock,
    toViemChainMock,
    applyProfileEnvironmentMock,
    runRpcPreflightMock,
    resolveSignerRuntimeMock,
    executeSubgraphQueryMock,
    executeTxIntentMock,
} = vi.hoisted(() => ({
    loadConfigMock: vi.fn(),
    getProfileOrThrowMock: vi.fn(),
    getPolicyOrThrowMock: vi.fn(),
    resolveChainMock: vi.fn(),
    resolveRpcUrlMock: vi.fn(),
    toViemChainMock: vi.fn(),
    applyProfileEnvironmentMock: vi.fn(),
    runRpcPreflightMock: vi.fn(),
    resolveSignerRuntimeMock: vi.fn(),
    executeSubgraphQueryMock: vi.fn(),
    executeTxIntentMock: vi.fn(),
}));

vi.mock("../config", () => ({
    loadConfig: loadConfigMock,
    getProfileOrThrow: getProfileOrThrowMock,
    getPolicyOrThrow: getPolicyOrThrowMock,
}));

vi.mock("../chains", () => ({
    resolveChain: resolveChainMock,
    resolveRpcUrl: resolveRpcUrlMock,
    toViemChain: toViemChainMock,
}));

vi.mock("../profile-env", () => ({
    applyProfileEnvironment: applyProfileEnvironmentMock,
}));

vi.mock("../rpc", () => ({
    runRpcPreflight: runRpcPreflightMock,
}));

vi.mock("../signer", () => ({
    resolveSignerRuntime: resolveSignerRuntimeMock,
}));

vi.mock("../subgraph/client", () => ({
    executeSubgraphQuery: executeSubgraphQueryMock,
}));

vi.mock("../tx-engine", () => ({
    executeTxIntent: executeTxIntentMock,
}));

import { runAuctionBidCommand, runAuctionBidUnbidCommand } from "./auction-bid";

function createCtx(path: string[], flags: Record<string, string | boolean>): CommandContext {
    return {
        commandPath: path,
        args: {
            positionals: path,
            flags,
        },
        globals: {
            mode: "agent",
            json: true,
            yes: true,
            profile: "prod",
        },
    };
}

function buildAuctionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: "5666",
        type: "erc721",
        contractAddress: "0x1111111111111111111111111111111111111111",
        tokenId: "1",
        quantity: "1",
        seller: "0x2222222222222222222222222222222222222222",
        highestBid: "0",
        highestBidder: ZERO_ADDRESS,
        totalBids: "0",
        startsAt: "1700000000",
        endsAt: "2700000000",
        claimAt: "0",
        claimed: false,
        cancelled: false,
        presetId: "1",
        category: "1",
        buyNowPrice: "0",
        startBidPrice: "1000000000000000000",
        ...overrides,
    };
}

function setupCommonMocks(): void {
    loadConfigMock.mockReturnValue({});
    getProfileOrThrowMock.mockReturnValue({
        name: "prod",
        chain: "base",
        chainId: 8453,
        rpcUrl: "https://mainnet.base.org",
        signer: { type: "env", envVar: "AGCLI_PRIVATE_KEY" },
        policy: "default",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    });
    getPolicyOrThrowMock.mockReturnValue({
        name: "default",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    });
    resolveChainMock.mockReturnValue({
        key: "base",
        chainId: 8453,
        defaultRpcUrl: "https://mainnet.base.org",
    });
    resolveRpcUrlMock.mockReturnValue("https://mainnet.base.org");
    toViemChainMock.mockReturnValue({
        id: 8453,
        name: "Base",
        network: "base",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: ["https://mainnet.base.org"] } },
    });
    applyProfileEnvironmentMock.mockReturnValue({
        source: "none",
        path: null,
        loaded: [],
        skippedExisting: [],
    });
    resolveSignerRuntimeMock.mockResolvedValue({
        summary: {
            signerType: "env",
            address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            canSign: true,
            backendStatus: "ready",
        },
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    setupCommonMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("auction bid command", () => {
    it("returns structured allowance preflight error when allowance is missing", async () => {
        executeSubgraphQueryMock.mockResolvedValueOnce({
            source: "gbm-base",
            endpoint: "https://example.com",
            queryName: "auction.bid.preflight",
            data: {
                auction: buildAuctionRow(),
            },
        });

        runRpcPreflightMock.mockResolvedValue({
            chainId: 8453,
            blockNumber: "1",
            chainName: "Base",
            client: {
                readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
                    if (functionName === "getAuctionHighestBid") return 0n;
                    if (functionName === "getAuctionHighestBidder") return ZERO_ADDRESS;
                    if (functionName === "getContractAddress") return "0x1111111111111111111111111111111111111111";
                    if (functionName === "getTokenId") return 1n;
                    if (functionName === "getAuctionStartTime") return 1n;
                    if (functionName === "getAuctionEndTime") return 9999999999n;
                    if (functionName === "getAuctionIncMin") return 100n;
                    if (functionName === "balanceOf") return 2_000000000000000000n;
                    if (functionName === "allowance") return 0n;
                    throw new Error(`unexpected function ${functionName}`);
                }),
            },
        });

        await expect(
            runAuctionBidCommand(
                createCtx(["auction", "bid"], {
                    "auction-id": "5666",
                    "amount-ghst": "1",
                    "dry-run": true,
                }),
            ),
        ).rejects.toMatchObject({
            code: "INSUFFICIENT_ALLOWANCE",
            details: expect.objectContaining({
                reasonCode: "INSUFFICIENT_ALLOWANCE",
            }),
        });
    });

    it("supports dry-run auto-approve and returns skipped bid simulation result", async () => {
        executeSubgraphQueryMock.mockResolvedValueOnce({
            source: "gbm-base",
            endpoint: "https://example.com",
            queryName: "auction.bid.preflight",
            data: {
                auction: buildAuctionRow(),
            },
        });

        runRpcPreflightMock.mockResolvedValue({
            chainId: 8453,
            blockNumber: "1",
            chainName: "Base",
            client: {
                readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
                    if (functionName === "getAuctionHighestBid") return 0n;
                    if (functionName === "getAuctionHighestBidder") return ZERO_ADDRESS;
                    if (functionName === "getContractAddress") return "0x1111111111111111111111111111111111111111";
                    if (functionName === "getTokenId") return 1n;
                    if (functionName === "getAuctionStartTime") return 1n;
                    if (functionName === "getAuctionEndTime") return 9999999999n;
                    if (functionName === "getAuctionIncMin") return 100n;
                    if (functionName === "balanceOf") return 2_000000000000000000n;
                    if (functionName === "allowance") return 0n;
                    throw new Error(`unexpected function ${functionName}`);
                }),
            },
        });

        executeTxIntentMock.mockResolvedValue({
            status: "simulated",
            dryRun: true,
            from: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            to: "0xcd2f22236dd9dfe2356d7c543161d4d260fd9bcb",
            nonce: 1,
            gasLimit: "21000",
        });

        const result = (await runAuctionBidCommand(
            createCtx(["auction", "bid"], {
                "auction-id": "5666",
                "amount-ghst": "1",
                "dry-run": true,
                "auto-approve": true,
            }),
        )) as { result: { skippedBidSimulation: boolean }; approval: unknown };

        expect(result.result.skippedBidSimulation).toBe(true);
        expect(result.approval).toBeDefined();
        expect(executeTxIntentMock).toHaveBeenCalledTimes(1);
        expect(executeTxIntentMock).toHaveBeenCalledWith(
            expect.objectContaining({
                command: "auction approve-ghst",
                dryRun: true,
            }),
            expect.objectContaining({ chainId: 8453 }),
        );
    });
});

describe("auction bid-unbid command", () => {
    it("skips auctions whose start bid exceeds target amount", async () => {
        executeSubgraphQueryMock.mockResolvedValueOnce({
            source: "gbm-base",
            endpoint: "https://example.com",
            queryName: "auction.bid-unbid.active",
            data: {
                auctions: [
                    buildAuctionRow({
                        id: "9001",
                        startBidPrice: "2000000000000000000",
                    }),
                ],
            },
        });

        const result = (await runAuctionBidUnbidCommand(
            createCtx(["auction", "bid-unbid"], {
                "amount-ghst": "1",
                "max-total-ghst": "10",
                "dry-run": true,
            }),
        )) as {
            selected: number;
            skipped: Array<{ auctionId: string; reasonCode: string }>;
            summary: { skipped: number };
        };

        expect(result.selected).toBe(0);
        expect(result.summary.skipped).toBe(1);
        expect(result.skipped[0]).toMatchObject({
            auctionId: "9001",
            reasonCode: "START_BID_ABOVE_AMOUNT",
        });
    });
});
