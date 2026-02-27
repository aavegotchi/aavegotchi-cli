import { describe, expect, it } from "vitest";

import {
    normalizeBaazaarErc1155Listing,
    normalizeBaazaarErc721Listing,
    normalizeGbmAuction,
    normalizeGbmBid,
    toLowercaseAddress,
} from "./normalize";

describe("subgraph normalizers", () => {
    it("normalizes erc721 listing fields", () => {
        const result = normalizeBaazaarErc721Listing({
            id: 1,
            category: 3,
            erc721TokenAddress: "0xA99c4B08201F2913Db8D28e71d020c4298F29dBF",
            tokenId: 44,
            seller: "0xAb59CA4A16925b0a4BaC5026C94bEB20A29Df479",
            priceInWei: 1000,
            cancelled: false,
            timeCreated: 1700000000,
            timePurchased: 0,
        });

        expect(result).toMatchObject({
            id: "1",
            category: "3",
            erc721TokenAddress: "0xa99c4b08201f2913db8d28e71d020c4298f29dbf",
            seller: "0xab59ca4a16925b0a4bac5026c94beb20a29df479",
            tokenId: "44",
            priceInWei: "1000",
            timeCreated: "1700000000",
            timePurchased: "0",
        });
    });

    it("normalizes erc1155 listing fields", () => {
        const result = normalizeBaazaarErc1155Listing({
            id: "2",
            category: "4",
            erc1155TokenAddress: "0xA99c4B08201F2913Db8D28e71d020c4298F29dBF",
            erc1155TypeId: 99,
            quantity: 5,
            seller: "0xAb59CA4A16925b0a4BaC5026C94bEB20A29Df479",
            priceInWei: 123,
            cancelled: false,
            sold: false,
            timeCreated: 1700000001,
        });

        expect(result.erc1155TokenAddress).toBe("0xa99c4b08201f2913db8d28e71d020c4298f29dbf");
        expect(result.seller).toBe("0xab59ca4a16925b0a4bac5026c94beb20a29df479");
        expect(result.erc1155TypeId).toBe("99");
    });

    it("normalizes gbm auction fields", () => {
        const result = normalizeGbmAuction({
            id: 11,
            contractAddress: "0xA99c4B08201F2913Db8D28e71d020c4298F29dBF",
            tokenId: 23,
            quantity: 1,
            seller: "0xAb59CA4A16925b0a4BaC5026C94bEB20A29Df479",
            highestBid: 500,
            highestBidder: "0x80320A0000C7A6a34086E2ACAD6915Ff57FfDA31",
            totalBids: 9,
            startsAt: 1700000100,
            endsAt: 1700000200,
            claimed: false,
            cancelled: false,
        });

        expect(result.contractAddress).toBe("0xa99c4b08201f2913db8d28e71d020c4298f29dbf");
        expect(result.highestBidder).toBe("0x80320a0000c7a6a34086e2acad6915ff57ffda31");
        expect(result.highestBid).toBe("500");
    });

    it("normalizes gbm bid fields", () => {
        const result = normalizeGbmBid({
            id: 77,
            bidder: "0xAb59CA4A16925b0a4BaC5026C94bEB20A29Df479",
            amount: 123,
            bidTime: 1700000400,
            outbid: true,
            previousBid: 122,
            previousBidder: "0x80320A0000C7A6a34086E2ACAD6915Ff57FfDA31",
            auction: { id: 11 },
        });

        expect(result).toMatchObject({
            id: "77",
            bidder: "0xab59ca4a16925b0a4bac5026c94beb20a29df479",
            amount: "123",
            auctionId: "11",
            previousBidder: "0x80320a0000c7a6a34086e2acad6915ff57ffda31",
        });
    });

    it("rejects invalid addresses", () => {
        expect(() => toLowercaseAddress("invalid")).toThrowError(/invalid address/i);
    });
});
