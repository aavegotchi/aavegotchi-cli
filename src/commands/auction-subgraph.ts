import { parseAbi } from "viem";

import { getFlagBoolean, getFlagString } from "../args";
import { resolveChain, resolveRpcUrl } from "../chains";
import { getProfileOrThrow, loadConfig } from "../config";
import { CliError } from "../errors";
import { runRpcPreflight } from "../rpc";
import {
    normalizeGbmAuction,
    normalizeGbmAuctions,
    normalizeGbmBids,
    toLowercaseAddress,
} from "../subgraph/normalize";
import {
    GBM_ACTIVE_AUCTIONS_QUERY,
    GBM_AUCTION_BY_ID_QUERY,
    GBM_BIDS_BY_AUCTION_QUERY,
    GBM_BIDS_BY_BIDDER_QUERY,
    GBM_MINE_AUCTIONS_QUERY,
} from "../subgraph/queries";
import { BASE_GBM_DIAMOND } from "../subgraph/sources";
import { executeSubgraphQuery } from "../subgraph/client";
import { CommandContext, JsonValue } from "../types";

const DEFAULT_FIRST = 20;
const MAX_FIRST = 200;
const DEFAULT_SKIP = 0;
const MAX_SKIP = 100000;

const GBM_VERIFY_ABI = parseAbi([
    "function getAuctionHighestBid(uint256 _auctionId) view returns (uint256)",
    "function getContractAddress(uint256 _auctionId) view returns (address)",
    "function getTokenId(uint256 _auctionId) view returns (uint256)",
    "function getAuctionStartTime(uint256 _auctionId) view returns (uint256)",
    "function getAuctionEndTime(uint256 _auctionId) view returns (uint256)",
]);

function parseRawFlag(ctx: CommandContext): boolean {
    return getFlagBoolean(ctx.args.flags, "raw");
}

function parseTimeoutMs(value: string | undefined): number | undefined {
    if (!value) {
        return undefined;
    }

    const timeout = Number(value);
    if (!Number.isInteger(timeout) || timeout <= 0) {
        throw new CliError("INVALID_ARGUMENT", "--timeout-ms must be a positive integer.", 2, {
            value,
        });
    }

    return timeout;
}

function parseBoundedIntFlag(
    value: string | undefined,
    flagName: string,
    fallback: number,
    min: number,
    max: number,
): number {
    if (!value) {
        return fallback;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        throw new CliError("INVALID_ARGUMENT", `${flagName} must be an integer between ${min} and ${max}.`, 2, {
            value,
        });
    }

    return parsed;
}

function parsePagination(ctx: CommandContext): { first: number; skip: number } {
    const first = parseBoundedIntFlag(getFlagString(ctx.args.flags, "first"), "--first", DEFAULT_FIRST, 1, MAX_FIRST);
    const skip = parseBoundedIntFlag(getFlagString(ctx.args.flags, "skip"), "--skip", DEFAULT_SKIP, 0, MAX_SKIP);

    return {
        first,
        skip,
    };
}

function parseAddress(value: string | undefined, flagName: string): `0x${string}` {
    if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
        throw new CliError("INVALID_ARGUMENT", `${flagName} must be an EVM address.`, 2, {
            value,
        });
    }

    return toLowercaseAddress(value);
}

function parseAuctionId(value: string | undefined, flagName: string): string {
    if (!value) {
        throw new CliError("MISSING_ARGUMENT", `${flagName} is required.`, 2);
    }

    if (!/^\d+$/.test(value)) {
        throw new CliError("INVALID_ARGUMENT", `${flagName} must be an unsigned integer string.`, 2, {
            value,
        });
    }

    return value;
}

function parseActiveTime(ctx: CommandContext): string {
    const atTime = getFlagString(ctx.args.flags, "at-time");
    if (!atTime) {
        return Math.floor(Date.now() / 1000).toString();
    }

    if (!/^\d+$/.test(atTime)) {
        throw new CliError("INVALID_ARGUMENT", "--at-time must be a unix timestamp (seconds).", 2, {
            value: atTime,
        });
    }

    return atTime;
}

function parseCommonSubgraphOptions(ctx: CommandContext): {
    source: "gbm-base";
    timeoutMs?: number;
    authEnvVar?: string;
    subgraphUrl?: string;
    allowUntrustedSubgraph?: boolean;
} {
    const subgraphUrl = getFlagString(ctx.args.flags, "subgraph-url");
    const allowUntrustedSubgraph = getFlagBoolean(ctx.args.flags, "allow-untrusted-subgraph");

    if (allowUntrustedSubgraph && !subgraphUrl) {
        throw new CliError("INVALID_ARGUMENT", "--allow-untrusted-subgraph requires --subgraph-url.", 2);
    }

    return {
        source: "gbm-base",
        timeoutMs: parseTimeoutMs(getFlagString(ctx.args.flags, "timeout-ms")),
        authEnvVar: getFlagString(ctx.args.flags, "auth-env-var"),
        subgraphUrl,
        allowUntrustedSubgraph,
    };
}

function parseVerifyOnchainFlag(ctx: CommandContext): boolean {
    return getFlagBoolean(ctx.args.flags, "verify-onchain");
}

function resolveReadRpcUrl(ctx: CommandContext): string {
    const explicitRpc = getFlagString(ctx.args.flags, "rpc-url");
    if (explicitRpc) {
        return explicitRpc;
    }

    const profileName = getFlagString(ctx.args.flags, "profile") || ctx.globals.profile;
    if (profileName) {
        const config = loadConfig();
        const profile = getProfileOrThrow(config, profileName);
        return profile.rpcUrl;
    }

    return resolveRpcUrl(resolveChain("base"), undefined);
}

function createMismatchDiff(
    keys: string[],
    subgraph: Record<string, unknown>,
    onchain: Record<string, unknown>,
): Record<string, { subgraph: unknown; onchain: unknown }> {
    const diff: Record<string, { subgraph: unknown; onchain: unknown }> = {};

    for (const key of keys) {
        if (subgraph[key] !== onchain[key]) {
            diff[key] = {
                subgraph: subgraph[key],
                onchain: onchain[key],
            };
        }
    }

    return diff;
}

function withNormalizeContext<T>(
    response: { source: string; endpoint: string; queryName: string },
    normalize: () => T,
): T {
    try {
        return normalize();
    } catch (error) {
        if (error instanceof CliError && error.code === "SUBGRAPH_INVALID_RESPONSE") {
            const extraDetails =
                error.details && typeof error.details === "object" ? (error.details as Record<string, unknown>) : {};

            throw new CliError(error.code, error.message, error.exitCode, {
                source: response.source,
                endpoint: response.endpoint,
                queryName: response.queryName,
                ...extraDetails,
            });
        }

        throw error;
    }
}

async function verifyAuctionOnchain(ctx: CommandContext, auction: ReturnType<typeof normalizeGbmAuction>): Promise<JsonValue> {
    const chain = resolveChain("base");
    const rpcUrl = resolveReadRpcUrl(ctx);
    const preflight = await runRpcPreflight(chain, rpcUrl);
    const auctionId = BigInt(auction.id);

    const [highestBid, contractAddress, tokenId, startsAt, endsAt] = await Promise.all([
        preflight.client.readContract({
            address: BASE_GBM_DIAMOND,
            abi: GBM_VERIFY_ABI,
            functionName: "getAuctionHighestBid",
            args: [auctionId],
        }),
        preflight.client.readContract({
            address: BASE_GBM_DIAMOND,
            abi: GBM_VERIFY_ABI,
            functionName: "getContractAddress",
            args: [auctionId],
        }),
        preflight.client.readContract({
            address: BASE_GBM_DIAMOND,
            abi: GBM_VERIFY_ABI,
            functionName: "getTokenId",
            args: [auctionId],
        }),
        preflight.client.readContract({
            address: BASE_GBM_DIAMOND,
            abi: GBM_VERIFY_ABI,
            functionName: "getAuctionStartTime",
            args: [auctionId],
        }),
        preflight.client.readContract({
            address: BASE_GBM_DIAMOND,
            abi: GBM_VERIFY_ABI,
            functionName: "getAuctionEndTime",
            args: [auctionId],
        }),
    ]);

    const onchainProjection: Record<string, unknown> = {
        highestBid: (highestBid as bigint).toString(),
        contractAddress: toLowercaseAddress(contractAddress as `0x${string}`),
        tokenId: (tokenId as bigint).toString(),
        startsAt: (startsAt as bigint).toString(),
        endsAt: (endsAt as bigint).toString(),
    };

    const subgraphProjection: Record<string, unknown> = {
        highestBid: auction.highestBid,
        contractAddress: auction.contractAddress,
        tokenId: auction.tokenId,
        startsAt: auction.startsAt,
        endsAt: auction.endsAt,
    };

    const diff = createMismatchDiff(
        ["highestBid", "contractAddress", "tokenId", "startsAt", "endsAt"],
        subgraphProjection,
        onchainProjection,
    );

    if (Object.keys(diff).length > 0) {
        throw new CliError("SUBGRAPH_VERIFY_MISMATCH", "Subgraph auction does not match onchain snapshot.", 2, {
            source: "gbm-base",
            endpoint: "onchain-verify",
            queryName: "auction.get",
            auctionId: auction.id,
            rpcUrl,
            contractAddress: BASE_GBM_DIAMOND,
            diff,
        });
    }

    return {
        verified: true,
        rpcUrl,
        chainId: preflight.chainId,
        contractAddress: BASE_GBM_DIAMOND,
    };
}

export async function runAuctionGetSubgraphCommand(ctx: CommandContext): Promise<JsonValue> {
    const id = parseAuctionId(getFlagString(ctx.args.flags, "id"), "--id");
    const raw = parseRawFlag(ctx);
    const verifyOnchain = parseVerifyOnchainFlag(ctx);
    const common = parseCommonSubgraphOptions(ctx);

    const response = await executeSubgraphQuery<{ auction: unknown | null }>({
        ...common,
        queryName: "auction.get",
        query: GBM_AUCTION_BY_ID_QUERY,
        variables: { id },
        raw,
    });

    const auction = response.data.auction
        ? withNormalizeContext(response, () => normalizeGbmAuction(response.data.auction))
        : null;
    const verification = verifyOnchain && auction ? await verifyAuctionOnchain(ctx, auction) : undefined;

    return {
        source: response.source,
        endpoint: response.endpoint,
        queryName: response.queryName,
        auction,
        ...(verification ? { verification } : {}),
        ...(raw ? { raw: response.raw } : {}),
    };
}

export async function runAuctionActiveSubgraphCommand(ctx: CommandContext): Promise<JsonValue> {
    const pagination = parsePagination(ctx);
    const now = parseActiveTime(ctx);
    const raw = parseRawFlag(ctx);
    const common = parseCommonSubgraphOptions(ctx);

    const response = await executeSubgraphQuery<{ auctions: unknown }>({
        ...common,
        queryName: "auction.active",
        query: GBM_ACTIVE_AUCTIONS_QUERY,
        variables: {
            now,
            ...pagination,
        },
        raw,
    });

    if (!Array.isArray(response.data.auctions)) {
        throw new CliError("SUBGRAPH_INVALID_RESPONSE", "Expected auctions to be an array.", 2, {
            source: response.source,
            endpoint: response.endpoint,
            queryName: response.queryName,
        });
    }
    const auctions = response.data.auctions;

    return {
        source: response.source,
        endpoint: response.endpoint,
        queryName: response.queryName,
        atTime: now,
        pagination,
        auctions: withNormalizeContext(response, () => normalizeGbmAuctions(auctions)),
        ...(raw ? { raw: response.raw } : {}),
    };
}

export async function runAuctionMineSubgraphCommand(ctx: CommandContext): Promise<JsonValue> {
    const seller = parseAddress(getFlagString(ctx.args.flags, "seller"), "--seller");
    const pagination = parsePagination(ctx);
    const raw = parseRawFlag(ctx);
    const common = parseCommonSubgraphOptions(ctx);

    const response = await executeSubgraphQuery<{ auctions: unknown }>({
        ...common,
        queryName: "auction.mine",
        query: GBM_MINE_AUCTIONS_QUERY,
        variables: {
            seller,
            ...pagination,
        },
        raw,
    });

    if (!Array.isArray(response.data.auctions)) {
        throw new CliError("SUBGRAPH_INVALID_RESPONSE", "Expected auctions to be an array.", 2, {
            source: response.source,
            endpoint: response.endpoint,
            queryName: response.queryName,
        });
    }
    const auctions = response.data.auctions;

    return {
        source: response.source,
        endpoint: response.endpoint,
        queryName: response.queryName,
        seller,
        pagination,
        auctions: withNormalizeContext(response, () => normalizeGbmAuctions(auctions)),
        ...(raw ? { raw: response.raw } : {}),
    };
}

export async function runAuctionBidsSubgraphCommand(ctx: CommandContext): Promise<JsonValue> {
    const auctionId = parseAuctionId(getFlagString(ctx.args.flags, "auction-id"), "--auction-id");
    const pagination = parsePagination(ctx);
    const raw = parseRawFlag(ctx);
    const common = parseCommonSubgraphOptions(ctx);

    const response = await executeSubgraphQuery<{ bids: unknown }>({
        ...common,
        queryName: "auction.bids",
        query: GBM_BIDS_BY_AUCTION_QUERY,
        variables: {
            auctionId,
            ...pagination,
        },
        raw,
    });

    if (!Array.isArray(response.data.bids)) {
        throw new CliError("SUBGRAPH_INVALID_RESPONSE", "Expected bids to be an array.", 2, {
            source: response.source,
            endpoint: response.endpoint,
            queryName: response.queryName,
        });
    }
    const bids = response.data.bids;

    return {
        source: response.source,
        endpoint: response.endpoint,
        queryName: response.queryName,
        auctionId,
        pagination,
        bids: withNormalizeContext(response, () => normalizeGbmBids(bids)),
        ...(raw ? { raw: response.raw } : {}),
    };
}

export async function runAuctionBidsMineSubgraphCommand(ctx: CommandContext): Promise<JsonValue> {
    const bidder = parseAddress(getFlagString(ctx.args.flags, "bidder"), "--bidder");
    const pagination = parsePagination(ctx);
    const raw = parseRawFlag(ctx);
    const common = parseCommonSubgraphOptions(ctx);

    const response = await executeSubgraphQuery<{ bids: unknown }>({
        ...common,
        queryName: "auction.bids-mine",
        query: GBM_BIDS_BY_BIDDER_QUERY,
        variables: {
            bidder,
            ...pagination,
        },
        raw,
    });

    if (!Array.isArray(response.data.bids)) {
        throw new CliError("SUBGRAPH_INVALID_RESPONSE", "Expected bids to be an array.", 2, {
            source: response.source,
            endpoint: response.endpoint,
            queryName: response.queryName,
        });
    }
    const bids = response.data.bids;

    return {
        source: response.source,
        endpoint: response.endpoint,
        queryName: response.queryName,
        bidder,
        pagination,
        bids: withNormalizeContext(response, () => normalizeGbmBids(bids)),
        ...(raw ? { raw: response.raw } : {}),
    };
}

export async function runAuctionSubgraphCommand(ctx: CommandContext): Promise<JsonValue> {
    const action = ctx.commandPath[1];

    if (action === "get") {
        return runAuctionGetSubgraphCommand(ctx);
    }

    if (action === "active") {
        return runAuctionActiveSubgraphCommand(ctx);
    }

    if (action === "mine") {
        return runAuctionMineSubgraphCommand(ctx);
    }

    if (action === "bids") {
        return runAuctionBidsSubgraphCommand(ctx);
    }

    if (action === "bids-mine") {
        return runAuctionBidsMineSubgraphCommand(ctx);
    }

    throw new CliError("UNKNOWN_COMMAND", `Unknown command '${ctx.commandPath.join(" ")}'.`, 2);
}
