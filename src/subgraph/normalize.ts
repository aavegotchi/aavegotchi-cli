import {
    baazaarErc1155ListingSchema,
    baazaarErc721ListingSchema,
    gbmAuctionSchema,
    gbmBidSchema,
} from "../schemas";
import { CliError } from "../errors";
import {
    BaazaarErc1155ListingResult,
    BaazaarErc721ListingResult,
    GbmAuctionResult,
    GbmBidResult,
    JsonValue,
} from "../types";

function toNormalizeError(message: string, details: JsonValue): CliError {
    return new CliError("SUBGRAPH_INVALID_RESPONSE", message, 2, details);
}

export function toLowercaseAddress(value: string): `0x${string}` {
    if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
        throw toNormalizeError("Subgraph response includes invalid address.", {
            value,
        });
    }

    return value.toLowerCase() as `0x${string}`;
}

function parseWithSchema<T>(name: string, value: unknown, parser: { parse: (input: unknown) => T }): T {
    try {
        return parser.parse(value);
    } catch (error) {
        throw toNormalizeError(`Failed to parse subgraph payload for ${name}.`, {
            name,
            message: error instanceof Error ? error.message : String(error),
        });
    }
}

export function normalizeBaazaarErc721Listing(value: unknown): BaazaarErc721ListingResult {
    const parsed = parseWithSchema("erc721Listing", value, baazaarErc721ListingSchema);

    return {
        ...parsed,
        erc721TokenAddress: toLowercaseAddress(parsed.erc721TokenAddress),
        seller: toLowercaseAddress(parsed.seller),
    };
}

export function normalizeBaazaarErc1155Listing(value: unknown): BaazaarErc1155ListingResult {
    const parsed = parseWithSchema("erc1155Listing", value, baazaarErc1155ListingSchema);

    return {
        ...parsed,
        erc1155TokenAddress: toLowercaseAddress(parsed.erc1155TokenAddress),
        seller: toLowercaseAddress(parsed.seller),
    };
}

export function normalizeGbmAuction(value: unknown): GbmAuctionResult {
    const parsed = parseWithSchema("auction", value, gbmAuctionSchema);

    return {
        ...parsed,
        contractAddress: toLowercaseAddress(parsed.contractAddress),
        seller: toLowercaseAddress(parsed.seller),
        ...(parsed.highestBidder ? { highestBidder: toLowercaseAddress(parsed.highestBidder) } : {}),
    };
}

export function normalizeGbmBid(value: unknown): GbmBidResult {
    const parsed = parseWithSchema("bid", value, gbmBidSchema);

    return {
        id: parsed.id,
        bidder: toLowercaseAddress(parsed.bidder),
        amount: parsed.amount,
        bidTime: parsed.bidTime,
        outbid: parsed.outbid,
        ...(parsed.previousBid ? { previousBid: parsed.previousBid } : {}),
        ...(parsed.previousBidder ? { previousBidder: toLowercaseAddress(parsed.previousBidder) } : {}),
        ...(parsed.auction?.id ? { auctionId: parsed.auction.id } : {}),
    };
}

export function normalizeBaazaarErc721Listings(values: unknown[]): BaazaarErc721ListingResult[] {
    return values.map((value) => normalizeBaazaarErc721Listing(value));
}

export function normalizeBaazaarErc1155Listings(values: unknown[]): BaazaarErc1155ListingResult[] {
    return values.map((value) => normalizeBaazaarErc1155Listing(value));
}

export function normalizeGbmAuctions(values: unknown[]): GbmAuctionResult[] {
    return values.map((value) => normalizeGbmAuction(value));
}

export function normalizeGbmBids(values: unknown[]): GbmBidResult[] {
    return values.map((value) => normalizeGbmBid(value));
}
