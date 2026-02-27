import { parseAbi, type Abi } from "viem";

import {
    BASE_AAVEGOTCHI_DIAMOND,
    BASE_FORGE_DIAMOND,
    BASE_GBM_DIAMOND,
    BASE_GLTR_STAKING,
    BASE_MERKLE_DISTRIBUTOR,
} from "../subgraph/sources";

export interface MappedWriteDefaults {
    address?: `0x${string}`;
    abi?: Abi;
    source: string;
}

const AAVEGOTCHI_DIAMOND_MAPPED_WRITE_ABI = parseAbi([
    "function addGotchiLending(uint32,uint96,uint32,uint8[3],address,address,uint32,address[],uint256)",
    "function agreeGotchiLending(uint32,uint32,uint96,uint32,uint8[3])",
    "function batchDropClaimXPDrop(bytes32[],address[],uint256[][],bytes32[][],uint256[][],uint256[][])",
    "function batchExecuteERC1155Listing((uint256,address,uint256,uint256,uint256,address)[])",
    "function cancelERC1155Listing(uint256)",
    "function cancelERC721Listing(uint256)",
    "function cancelGotchiLending(uint32)",
    "function claimAavegotchi(uint256,uint256)",
    "function claimAndEndGotchiLending(uint32)",
    "function createWhitelist(string,address[])",
    "function decreaseAndDestroy(uint256,uint256)",
    "function equipDelegatedWearables(uint256,uint16[16],uint256[16])",
    "function openPortals(uint256[])",
    "function spendSkillPoints(uint256,int16[4])",
    "function transferEscrow(uint256,address,address,uint256)",
    "function updateERC1155ListingPriceAndQuantity(uint256,uint256,uint256)",
    "function updateWhitelist(uint32,address[])",
    "function useConsumables(uint256,uint256[],uint256[])",
]);

const GBM_MAPPED_WRITE_ABI = parseAbi([
    "function buyNow(uint256)",
    "function cancelAuction(uint256)",
    "function commitBid(uint256,uint256,uint256,address,uint256,uint256,bytes)",
    "function createAuction((uint80,uint80,uint56,uint8,bytes4,uint256,uint96,uint96),address,uint256)",
    "function swapAndBuyNow((address,uint256,uint256,uint256,address,uint256))",
    "function swapAndCommitBid((address,uint256,uint256,uint256,address,uint256,uint256,uint256,address,uint256,uint256,bytes))",
]);

const FORGE_MAPPED_WRITE_ABI = parseAbi([
    "function claimForgeQueueItems(uint256[])",
    "function forgeWearables(uint256[],uint256[],uint40[])",
    "function reduceQueueTime(uint256[],uint40[])",
    "function smeltWearables(uint256[],uint256[])",
]);

const GLTR_STAKING_MAPPED_WRITE_ABI = parseAbi(["function batchHarvest(uint256[])"]);
const WRAP_MAPPED_WRITE_ABI = parseAbi(["function enterWithUnderlying(uint256)", "function leaveToUnderlying(uint256)"]);
const GHST_STAKING_MAPPED_WRITE_ABI = parseAbi(["function withdrawFromPool(address,uint256)"]);
const SOCKET_VAULT_MAPPED_WRITE_ABI = parseAbi(["function bridge(address,uint256,uint256,address,bytes,bytes)"]);
const MERKLE_DISTRIBUTOR_MAPPED_WRITE_ABI = parseAbi(["function claim(uint256,bytes32[])"]);
const GOTCHI_POINTS_MAPPED_WRITE_ABI = parseAbi(["function convertAlchemica(address,uint256,uint256,uint256,uint256)"]);
const ERC20_MAPPED_WRITE_ABI = parseAbi(["function approve(address,uint256)"]);
const ERC1155_MAPPED_WRITE_ABI = parseAbi([
    "function safeTransferFrom(address,address,uint256,uint256,bytes)",
    "function setApprovalForAll(address,bool)",
]);

const MAPPED_WRITE_DEFAULTS: Record<string, MappedWriteDefaults> = {
    "lending create": {
        address: BASE_AAVEGOTCHI_DIAMOND,
        abi: AAVEGOTCHI_DIAMOND_MAPPED_WRITE_ABI,
        source: "base.aavegotchi-diamond",
    },
    "lending agree": {
        address: BASE_AAVEGOTCHI_DIAMOND,
        abi: AAVEGOTCHI_DIAMOND_MAPPED_WRITE_ABI,
        source: "base.aavegotchi-diamond",
    },
    "token approve": {
        abi: ERC20_MAPPED_WRITE_ABI,
        source: "canonical.erc20",
    },
    "gotchi xp claim-batch": {
        address: BASE_AAVEGOTCHI_DIAMOND,
        abi: AAVEGOTCHI_DIAMOND_MAPPED_WRITE_ABI,
        source: "base.aavegotchi-diamond",
    },
    "baazaar listing batch-execute": {
        address: BASE_AAVEGOTCHI_DIAMOND,
        abi: AAVEGOTCHI_DIAMOND_MAPPED_WRITE_ABI,
        source: "base.aavegotchi-diamond",
    },
    "realm harvest batch": {
        address: BASE_GLTR_STAKING,
        abi: GLTR_STAKING_MAPPED_WRITE_ABI,
        source: "base.gltr-staking",
    },
    "token bridge": {
        abi: SOCKET_VAULT_MAPPED_WRITE_ABI,
        source: "canonical.socket-vault",
    },
    "baazaar buy-now": {
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
    "baazaar cancel-erc1155": {
        address: BASE_AAVEGOTCHI_DIAMOND,
        abi: AAVEGOTCHI_DIAMOND_MAPPED_WRITE_ABI,
        source: "base.aavegotchi-diamond",
    },
    "baazaar cancel-erc721": {
        address: BASE_AAVEGOTCHI_DIAMOND,
        abi: AAVEGOTCHI_DIAMOND_MAPPED_WRITE_ABI,
        source: "base.aavegotchi-diamond",
    },
    "lending cancel": {
        address: BASE_AAVEGOTCHI_DIAMOND,
        abi: AAVEGOTCHI_DIAMOND_MAPPED_WRITE_ABI,
        source: "base.aavegotchi-diamond",
    },
    "forge claim": {
        address: BASE_MERKLE_DISTRIBUTOR,
        abi: MERKLE_DISTRIBUTOR_MAPPED_WRITE_ABI,
        source: "base.merkle-distributor",
    },
    "portal claim": {
        address: BASE_AAVEGOTCHI_DIAMOND,
        abi: AAVEGOTCHI_DIAMOND_MAPPED_WRITE_ABI,
        source: "base.aavegotchi-diamond",
    },
    "lending claim-end": {
        address: BASE_AAVEGOTCHI_DIAMOND,
        abi: AAVEGOTCHI_DIAMOND_MAPPED_WRITE_ABI,
        source: "base.aavegotchi-diamond",
    },
    "forge queue claim": {
        address: BASE_FORGE_DIAMOND,
        abi: FORGE_MAPPED_WRITE_ABI,
        source: "base.forge-diamond",
    },
    "auction bid": {
        address: BASE_GBM_DIAMOND,
        abi: GBM_MAPPED_WRITE_ABI,
        source: "base.gbm-diamond",
    },
    "gotchi-points convert-alchemica": {
        abi: GOTCHI_POINTS_MAPPED_WRITE_ABI,
        source: "canonical.gotchi-points",
    },
    "auction create": {
        address: BASE_GBM_DIAMOND,
        abi: GBM_MAPPED_WRITE_ABI,
        source: "base.gbm-diamond",
    },
    "lending whitelist create": {
        address: BASE_AAVEGOTCHI_DIAMOND,
        abi: AAVEGOTCHI_DIAMOND_MAPPED_WRITE_ABI,
        source: "base.aavegotchi-diamond",
    },
    "staking unstake-destroy": {
        address: BASE_AAVEGOTCHI_DIAMOND,
        abi: AAVEGOTCHI_DIAMOND_MAPPED_WRITE_ABI,
        source: "base.aavegotchi-diamond",
    },
    "staking enter-underlying": {
        abi: WRAP_MAPPED_WRITE_ABI,
        source: "canonical.wrap",
    },
    "gotchi equip-delegated": {
        address: BASE_AAVEGOTCHI_DIAMOND,
        abi: AAVEGOTCHI_DIAMOND_MAPPED_WRITE_ABI,
        source: "base.aavegotchi-diamond",
    },
    "forge craft": {
        address: BASE_FORGE_DIAMOND,
        abi: FORGE_MAPPED_WRITE_ABI,
        source: "base.forge-diamond",
    },
    "staking leave-underlying": {
        abi: WRAP_MAPPED_WRITE_ABI,
        source: "canonical.wrap",
    },
    "portal open": {
        address: BASE_AAVEGOTCHI_DIAMOND,
        abi: AAVEGOTCHI_DIAMOND_MAPPED_WRITE_ABI,
        source: "base.aavegotchi-diamond",
    },
    "forge speedup": {
        address: BASE_FORGE_DIAMOND,
        abi: FORGE_MAPPED_WRITE_ABI,
        source: "base.forge-diamond",
    },
    "inventory transfer": {
        abi: ERC1155_MAPPED_WRITE_ABI,
        source: "canonical.erc1155",
    },
    "token set-approval-for-all": {
        abi: ERC1155_MAPPED_WRITE_ABI,
        source: "canonical.erc1155",
    },
    "forge smelt": {
        address: BASE_FORGE_DIAMOND,
        abi: FORGE_MAPPED_WRITE_ABI,
        source: "base.forge-diamond",
    },
    "gotchi spend-skill-points": {
        address: BASE_AAVEGOTCHI_DIAMOND,
        abi: AAVEGOTCHI_DIAMOND_MAPPED_WRITE_ABI,
        source: "base.aavegotchi-diamond",
    },
    "baazaar swap-buy-now": {
        address: BASE_GBM_DIAMOND,
        abi: GBM_MAPPED_WRITE_ABI,
        source: "base.gbm-diamond",
    },
    "auction swap-bid": {
        address: BASE_GBM_DIAMOND,
        abi: GBM_MAPPED_WRITE_ABI,
        source: "base.gbm-diamond",
    },
    "lending transfer-escrow": {
        address: BASE_AAVEGOTCHI_DIAMOND,
        abi: AAVEGOTCHI_DIAMOND_MAPPED_WRITE_ABI,
        source: "base.aavegotchi-diamond",
    },
    "baazaar update-erc1155": {
        address: BASE_AAVEGOTCHI_DIAMOND,
        abi: AAVEGOTCHI_DIAMOND_MAPPED_WRITE_ABI,
        source: "base.aavegotchi-diamond",
    },
    "lending whitelist update": {
        address: BASE_AAVEGOTCHI_DIAMOND,
        abi: AAVEGOTCHI_DIAMOND_MAPPED_WRITE_ABI,
        source: "base.aavegotchi-diamond",
    },
    "gotchi feed": {
        address: BASE_AAVEGOTCHI_DIAMOND,
        abi: AAVEGOTCHI_DIAMOND_MAPPED_WRITE_ABI,
        source: "base.aavegotchi-diamond",
    },
    "staking withdraw-pool": {
        abi: GHST_STAKING_MAPPED_WRITE_ABI,
        source: "canonical.ghst-staking",
    },
};

export function getMappedWriteDefaults(commandPath: string[]): MappedWriteDefaults | undefined {
    return MAPPED_WRITE_DEFAULTS[commandPath.join(" ")];
}
