import { parseAbi } from "viem";

import { getFlagBoolean, getFlagString } from "../args";
import { resolveChain, resolveRpcUrl } from "../chains";
import { getProfileOrThrow, loadConfig } from "../config";
import { CliError } from "../errors";
import { runRpcPreflight } from "../rpc";
import {
    normalizeBaazaarErc1155Listing,
    normalizeBaazaarErc1155Listings,
    normalizeBaazaarErc721Listing,
    normalizeBaazaarErc721Listings,
    toLowercaseAddress,
} from "../subgraph/normalize";
import {
    BAAZAAR_ACTIVE_ERC1155_QUERY,
    BAAZAAR_ACTIVE_ERC721_QUERY,
    BAAZAAR_ERC1155_LISTING_BY_ID_QUERY,
    BAAZAAR_ERC721_LISTING_BY_ID_QUERY,
    BAAZAAR_MINE_ERC1155_QUERY,
    BAAZAAR_MINE_ERC721_QUERY,
} from "../subgraph/queries";
import { BASE_AAVEGOTCHI_DIAMOND } from "../subgraph/sources";
import { executeSubgraphQuery } from "../subgraph/client";
import { CommandContext, JsonValue } from "../types";

const DEFAULT_FIRST = 20;
const MAX_FIRST = 200;
const DEFAULT_SKIP = 0;
const MAX_SKIP = 100000;

const BAAZAAR_VERIFY_ABI = parseAbi([
    "function getERC721Listing(uint256 _listingId) view returns ((uint256 listingId,address seller,address erc721TokenAddress,uint256 erc721TokenId,uint256 category,uint256 priceInWei,uint256 timeCreated,uint256 timePurchased,bool cancelled,uint16[2] principalSplit,address affiliate,uint32 whitelistId))",
    "function getERC1155Listing(uint256 _listingId) view returns ((uint256 listingId,address seller,address erc1155TokenAddress,uint256 erc1155TypeId,uint256 category,uint256 quantity,uint256 priceInWei,uint256 timeCreated,uint256 timeLastPurchased,uint256 sourceListingId,bool sold,bool cancelled,uint16[2] principalSplit,address affiliate,uint32 whitelistId))",
]);

type ListingKind = "erc721" | "erc1155";

function parseKind(value: string | undefined): ListingKind {
    if (!value) {
        throw new CliError("MISSING_ARGUMENT", "--kind is required (erc721|erc1155).", 2);
    }

    const normalized = value.trim().toLowerCase();
    if (normalized === "erc721" || normalized === "erc1155") {
        return normalized;
    }

    throw new CliError("INVALID_ARGUMENT", "--kind must be one of: erc721, erc1155.", 2, {
        value,
    });
}

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

function parseListingId(value: string | undefined, flagName: string): string {
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

function parseAddress(value: string | undefined, flagName: string): `0x${string}` {
    if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
        throw new CliError("INVALID_ARGUMENT", `${flagName} must be an EVM address.`, 2, {
            value,
        });
    }

    return toLowercaseAddress(value);
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

function parseCommonSubgraphOptions(ctx: CommandContext): {
    source: "core-base";
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
        source: "core-base",
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

async function verifyErc721ListingOnchain(ctx: CommandContext, listing: ReturnType<typeof normalizeBaazaarErc721Listing>): Promise<JsonValue> {
    const chain = resolveChain("base");
    const rpcUrl = resolveReadRpcUrl(ctx);
    const preflight = await runRpcPreflight(chain, rpcUrl);

    const onchainRaw = (await preflight.client.readContract({
        address: BASE_AAVEGOTCHI_DIAMOND,
        abi: BAAZAAR_VERIFY_ABI,
        functionName: "getERC721Listing",
        args: [BigInt(listing.id)],
    })) as {
        listingId: bigint;
        seller: `0x${string}`;
        erc721TokenAddress: `0x${string}`;
        erc721TokenId: bigint;
        category: bigint;
        priceInWei: bigint;
        timeCreated: bigint;
        timePurchased: bigint;
        cancelled: boolean;
    };

    const onchainProjection: Record<string, unknown> = {
        id: onchainRaw.listingId.toString(),
        seller: toLowercaseAddress(onchainRaw.seller),
        erc721TokenAddress: toLowercaseAddress(onchainRaw.erc721TokenAddress),
        tokenId: onchainRaw.erc721TokenId.toString(),
        category: onchainRaw.category.toString(),
        priceInWei: onchainRaw.priceInWei.toString(),
        timeCreated: onchainRaw.timeCreated.toString(),
        timePurchased: onchainRaw.timePurchased.toString(),
        cancelled: onchainRaw.cancelled,
    };

    const subgraphProjection: Record<string, unknown> = {
        id: listing.id,
        seller: listing.seller,
        erc721TokenAddress: listing.erc721TokenAddress,
        tokenId: listing.tokenId,
        category: listing.category,
        priceInWei: listing.priceInWei,
        timeCreated: listing.timeCreated,
        timePurchased: listing.timePurchased,
        cancelled: listing.cancelled,
    };

    const diff = createMismatchDiff(
        ["id", "seller", "erc721TokenAddress", "tokenId", "category", "priceInWei", "timeCreated", "timePurchased", "cancelled"],
        subgraphProjection,
        onchainProjection,
    );

    if (Object.keys(diff).length > 0) {
        throw new CliError("SUBGRAPH_VERIFY_MISMATCH", "Subgraph listing does not match onchain snapshot.", 2, {
            source: "core-base",
            endpoint: "onchain-verify",
            queryName: "baazaar.listing.get.erc721",
            listingId: listing.id,
            rpcUrl,
            contractAddress: BASE_AAVEGOTCHI_DIAMOND,
            diff,
        });
    }

    return {
        verified: true,
        rpcUrl,
        chainId: preflight.chainId,
        contractAddress: BASE_AAVEGOTCHI_DIAMOND,
    };
}

async function verifyErc1155ListingOnchain(
    ctx: CommandContext,
    listing: ReturnType<typeof normalizeBaazaarErc1155Listing>,
): Promise<JsonValue> {
    const chain = resolveChain("base");
    const rpcUrl = resolveReadRpcUrl(ctx);
    const preflight = await runRpcPreflight(chain, rpcUrl);

    const onchainRaw = (await preflight.client.readContract({
        address: BASE_AAVEGOTCHI_DIAMOND,
        abi: BAAZAAR_VERIFY_ABI,
        functionName: "getERC1155Listing",
        args: [BigInt(listing.id)],
    })) as {
        listingId: bigint;
        seller: `0x${string}`;
        erc1155TokenAddress: `0x${string}`;
        erc1155TypeId: bigint;
        category: bigint;
        quantity: bigint;
        priceInWei: bigint;
        timeCreated: bigint;
        sold: boolean;
        cancelled: boolean;
    };

    const onchainProjection: Record<string, unknown> = {
        id: onchainRaw.listingId.toString(),
        seller: toLowercaseAddress(onchainRaw.seller),
        erc1155TokenAddress: toLowercaseAddress(onchainRaw.erc1155TokenAddress),
        erc1155TypeId: onchainRaw.erc1155TypeId.toString(),
        category: onchainRaw.category.toString(),
        quantity: onchainRaw.quantity.toString(),
        priceInWei: onchainRaw.priceInWei.toString(),
        timeCreated: onchainRaw.timeCreated.toString(),
        sold: onchainRaw.sold,
        cancelled: onchainRaw.cancelled,
    };

    const subgraphProjection: Record<string, unknown> = {
        id: listing.id,
        seller: listing.seller,
        erc1155TokenAddress: listing.erc1155TokenAddress,
        erc1155TypeId: listing.erc1155TypeId,
        category: listing.category,
        quantity: listing.quantity,
        priceInWei: listing.priceInWei,
        timeCreated: listing.timeCreated,
        sold: listing.sold,
        cancelled: listing.cancelled,
    };

    const diff = createMismatchDiff(
        ["id", "seller", "erc1155TokenAddress", "erc1155TypeId", "category", "quantity", "priceInWei", "timeCreated", "sold", "cancelled"],
        subgraphProjection,
        onchainProjection,
    );

    if (Object.keys(diff).length > 0) {
        throw new CliError("SUBGRAPH_VERIFY_MISMATCH", "Subgraph listing does not match onchain snapshot.", 2, {
            source: "core-base",
            endpoint: "onchain-verify",
            queryName: "baazaar.listing.get.erc1155",
            listingId: listing.id,
            rpcUrl,
            contractAddress: BASE_AAVEGOTCHI_DIAMOND,
            diff,
        });
    }

    return {
        verified: true,
        rpcUrl,
        chainId: preflight.chainId,
        contractAddress: BASE_AAVEGOTCHI_DIAMOND,
    };
}

export async function runBaazaarListingGetSubgraphCommand(ctx: CommandContext): Promise<JsonValue> {
    const kind = parseKind(getFlagString(ctx.args.flags, "kind"));
    const id = parseListingId(getFlagString(ctx.args.flags, "id"), "--id");
    const raw = parseRawFlag(ctx);
    const verifyOnchain = parseVerifyOnchainFlag(ctx);
    const common = parseCommonSubgraphOptions(ctx);

    if (kind === "erc721") {
        const response = await executeSubgraphQuery<{ erc721Listing: unknown | null }>({
            ...common,
            queryName: "baazaar.listing.get.erc721",
            query: BAAZAAR_ERC721_LISTING_BY_ID_QUERY,
            variables: { id },
            raw,
        });

        const listing = response.data.erc721Listing
            ? withNormalizeContext(response, () => normalizeBaazaarErc721Listing(response.data.erc721Listing))
            : null;
        const verification = verifyOnchain && listing ? await verifyErc721ListingOnchain(ctx, listing) : undefined;

        return {
            source: response.source,
            endpoint: response.endpoint,
            queryName: response.queryName,
            listingKind: kind,
            listing,
            ...(verification ? { verification } : {}),
            ...(raw ? { raw: response.raw } : {}),
        };
    }

    const response = await executeSubgraphQuery<{ erc1155Listing: unknown | null }>({
        ...common,
        queryName: "baazaar.listing.get.erc1155",
        query: BAAZAAR_ERC1155_LISTING_BY_ID_QUERY,
        variables: { id },
        raw,
    });

    const listing = response.data.erc1155Listing
        ? withNormalizeContext(response, () => normalizeBaazaarErc1155Listing(response.data.erc1155Listing))
        : null;
    const verification = verifyOnchain && listing ? await verifyErc1155ListingOnchain(ctx, listing) : undefined;

    return {
        source: response.source,
        endpoint: response.endpoint,
        queryName: response.queryName,
        listingKind: kind,
        listing,
        ...(verification ? { verification } : {}),
        ...(raw ? { raw: response.raw } : {}),
    };
}

export async function runBaazaarListingActiveSubgraphCommand(ctx: CommandContext): Promise<JsonValue> {
    const kind = parseKind(getFlagString(ctx.args.flags, "kind"));
    const pagination = parsePagination(ctx);
    const raw = parseRawFlag(ctx);
    const common = parseCommonSubgraphOptions(ctx);

    if (kind === "erc721") {
        const response = await executeSubgraphQuery<{ erc721Listings: unknown }>({
            ...common,
            queryName: "baazaar.listing.active.erc721",
            query: BAAZAAR_ACTIVE_ERC721_QUERY,
            variables: pagination,
            raw,
        });

        if (!Array.isArray(response.data.erc721Listings)) {
            throw new CliError("SUBGRAPH_INVALID_RESPONSE", "Expected erc721Listings to be an array.", 2, {
                source: response.source,
                endpoint: response.endpoint,
                queryName: response.queryName,
            });
        }
        const erc721Listings = response.data.erc721Listings;

        return {
            source: response.source,
            endpoint: response.endpoint,
            queryName: response.queryName,
            listingKind: kind,
            pagination,
            listings: withNormalizeContext(response, () => normalizeBaazaarErc721Listings(erc721Listings)),
            ...(raw ? { raw: response.raw } : {}),
        };
    }

    const response = await executeSubgraphQuery<{ erc1155Listings: unknown }>({
        ...common,
        queryName: "baazaar.listing.active.erc1155",
        query: BAAZAAR_ACTIVE_ERC1155_QUERY,
        variables: pagination,
        raw,
    });

    if (!Array.isArray(response.data.erc1155Listings)) {
        throw new CliError("SUBGRAPH_INVALID_RESPONSE", "Expected erc1155Listings to be an array.", 2, {
            source: response.source,
            endpoint: response.endpoint,
            queryName: response.queryName,
        });
    }
    const erc1155Listings = response.data.erc1155Listings;

    return {
        source: response.source,
        endpoint: response.endpoint,
        queryName: response.queryName,
        listingKind: kind,
        pagination,
        listings: withNormalizeContext(response, () => normalizeBaazaarErc1155Listings(erc1155Listings)),
        ...(raw ? { raw: response.raw } : {}),
    };
}

export async function runBaazaarListingMineSubgraphCommand(ctx: CommandContext): Promise<JsonValue> {
    const kind = parseKind(getFlagString(ctx.args.flags, "kind"));
    const seller = parseAddress(getFlagString(ctx.args.flags, "seller"), "--seller");
    const pagination = parsePagination(ctx);
    const raw = parseRawFlag(ctx);
    const common = parseCommonSubgraphOptions(ctx);

    if (kind === "erc721") {
        const response = await executeSubgraphQuery<{ erc721Listings: unknown }>({
            ...common,
            queryName: "baazaar.listing.mine.erc721",
            query: BAAZAAR_MINE_ERC721_QUERY,
            variables: {
                seller,
                ...pagination,
            },
            raw,
        });

        if (!Array.isArray(response.data.erc721Listings)) {
            throw new CliError("SUBGRAPH_INVALID_RESPONSE", "Expected erc721Listings to be an array.", 2, {
                source: response.source,
                endpoint: response.endpoint,
                queryName: response.queryName,
            });
        }
        const erc721Listings = response.data.erc721Listings;

        return {
            source: response.source,
            endpoint: response.endpoint,
            queryName: response.queryName,
            listingKind: kind,
            seller,
            pagination,
            listings: withNormalizeContext(response, () => normalizeBaazaarErc721Listings(erc721Listings)),
            ...(raw ? { raw: response.raw } : {}),
        };
    }

    const response = await executeSubgraphQuery<{ erc1155Listings: unknown }>({
        ...common,
        queryName: "baazaar.listing.mine.erc1155",
        query: BAAZAAR_MINE_ERC1155_QUERY,
        variables: {
            seller,
            ...pagination,
        },
        raw,
    });

    if (!Array.isArray(response.data.erc1155Listings)) {
        throw new CliError("SUBGRAPH_INVALID_RESPONSE", "Expected erc1155Listings to be an array.", 2, {
            source: response.source,
            endpoint: response.endpoint,
            queryName: response.queryName,
        });
    }
    const erc1155Listings = response.data.erc1155Listings;

    return {
        source: response.source,
        endpoint: response.endpoint,
        queryName: response.queryName,
        listingKind: kind,
        seller,
        pagination,
        listings: withNormalizeContext(response, () => normalizeBaazaarErc1155Listings(erc1155Listings)),
        ...(raw ? { raw: response.raw } : {}),
    };
}

export async function runBaazaarListingSubgraphCommand(ctx: CommandContext): Promise<JsonValue> {
    const action = ctx.commandPath[2];

    if (action === "get") {
        return runBaazaarListingGetSubgraphCommand(ctx);
    }

    if (action === "active") {
        return runBaazaarListingActiveSubgraphCommand(ctx);
    }

    if (action === "mine") {
        return runBaazaarListingMineSubgraphCommand(ctx);
    }

    throw new CliError("UNKNOWN_COMMAND", `Unknown command '${ctx.commandPath.join(" ")}'.`, 2);
}
