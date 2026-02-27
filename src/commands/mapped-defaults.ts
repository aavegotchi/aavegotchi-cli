import { parseAbi, type Abi } from "viem";

import { BASE_GBM_DIAMOND } from "../subgraph/sources";

export interface MappedWriteDefaults {
    address?: `0x${string}`;
    abi?: Abi;
    source: string;
}

const GBM_MAPPED_WRITE_ABI = parseAbi([
    "function buyNow(uint256 _auctionID)",
    "function cancelAuction(uint256 _auctionID)",
    "function commitBid(uint256 _auctionID,uint256 _bidAmount,uint256 _highestBid,address _tokenContract,uint256 _tokenID,uint256 _amount,bytes _unused)",
    "function swapAndCommitBid((address tokenIn,uint256 swapAmount,uint256 minGhstOut,uint256 swapDeadline,address recipient,uint256 auctionID,uint256 bidAmount,uint256 highestBid,address tokenContract,uint256 _tokenID,uint256 _amount,bytes _signature) ctx)",
    "function createAuction((uint80 startTime,uint80 endTime,uint56 tokenAmount,uint8 category,bytes4 tokenKind,uint256 tokenID,uint96 buyItNowPrice,uint96 startingBid) _info,address _tokenContract,uint256 _auctionPresetID) returns (uint256)",
]);

const MAPPED_WRITE_DEFAULTS: Record<string, MappedWriteDefaults> = {
    "auction bid": {
        address: BASE_GBM_DIAMOND,
        abi: GBM_MAPPED_WRITE_ABI,
        source: "base.gbm-diamond",
    },
    "auction buy-now": {
        address: BASE_GBM_DIAMOND,
        abi: GBM_MAPPED_WRITE_ABI,
        source: "base.gbm-diamond",
    },
    "auction cancel": {
        address: BASE_GBM_DIAMOND,
        abi: GBM_MAPPED_WRITE_ABI,
        source: "base.gbm-diamond",
    },
    "auction create": {
        address: BASE_GBM_DIAMOND,
        abi: GBM_MAPPED_WRITE_ABI,
        source: "base.gbm-diamond",
    },
    "auction swap-bid": {
        address: BASE_GBM_DIAMOND,
        abi: GBM_MAPPED_WRITE_ABI,
        source: "base.gbm-diamond",
    },
};

export function getMappedWriteDefaults(commandPath: string[]): MappedWriteDefaults | undefined {
    return MAPPED_WRITE_DEFAULTS[commandPath.join(" ")];
}
