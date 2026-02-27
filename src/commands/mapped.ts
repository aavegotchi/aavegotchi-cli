import { CliError } from "../errors";
import { CommandContext, JsonValue } from "../types";

import { getMappedWriteDefaults } from "./mapped-defaults";
import { runOnchainSendWithFunction } from "./onchain";

const MAPPED_WRITE_COMMANDS: Record<string, string> = {
    "lending create": "addGotchiLending",
    "lending agree": "agreeGotchiLending",
    "token approve": "approve",
    "gotchi xp claim-batch": "batchDropClaimXPDrop",
    "baazaar listing batch-execute": "batchExecuteERC1155Listing",
    "realm harvest batch": "batchHarvest",
    "token bridge": "bridge",
    "baazaar buy-now": "buyNow",
    "auction buy-now": "buyNow",
    "auction cancel": "cancelAuction",
    "baazaar cancel-erc1155": "cancelERC1155Listing",
    "baazaar cancel-erc721": "cancelERC721Listing",
    "lending cancel": "cancelGotchiLending",
    "forge claim": "claim",
    "portal claim": "claimAavegotchi",
    "lending claim-end": "claimAndEndGotchiLending",
    "forge queue claim": "claimForgeQueueItems",
    "auction bid": "commitBid",
    "auction create": "createAuction",
    "lending whitelist create": "createWhitelist",
    "staking unstake-destroy": "decreaseAndDestroy",
    "staking enter-underlying": "enterWithUnderlying",
    "gotchi equip-delegated": "equipDelegatedWearables",
    "forge craft": "forgeWearables",
    "staking leave-underlying": "leaveToUnderlying",
    "portal open": "openPortals",
    "forge speedup": "reduceQueueTime",
    "inventory transfer": "safeTransferFrom",
    "token set-approval-for-all": "setApprovalForAll",
    "forge smelt": "smeltWearables",
    "gotchi spend-skill-points": "spendSkillPoints",
    "baazaar swap-buy-now": "swapAndBuyNow",
    "auction swap-bid": "swapAndCommitBid",
    "lending transfer-escrow": "transferEscrow",
    "baazaar update-erc1155": "updateERC1155ListingPriceAndQuantity",
    "lending whitelist update": "updateWhitelist",
    "gotchi feed": "useConsumables",
    "staking withdraw-pool": "withdrawFromPool",
};

export function findMappedFunction(commandPath: string[]): string | undefined {
    const key = commandPath.join(" ");
    return MAPPED_WRITE_COMMANDS[key];
}

export function listMappedCommands(): string[] {
    return Object.keys(MAPPED_WRITE_COMMANDS).sort((a, b) => a.localeCompare(b));
}

export function listMappedCommandsForRoot(root: string): string[] {
    return listMappedCommands().filter((entry) => entry.startsWith(`${root} `));
}

export function getMappedCommandEntries(): Record<string, string> {
    return { ...MAPPED_WRITE_COMMANDS };
}

export async function runMappedDomainCommand(ctx: CommandContext): Promise<JsonValue> {
    const key = ctx.commandPath.join(" ");
    const method = MAPPED_WRITE_COMMANDS[key];

    if (!method) {
        const candidates = listMappedCommandsForRoot(ctx.commandPath[0]);
        throw new CliError("COMMAND_NOT_IMPLEMENTED", `Mapped command '${key}' is not defined.`, 2, {
            command: key,
            availableForRoot: candidates,
        });
    }

    const defaults = getMappedWriteDefaults(ctx.commandPath);
    const result = await runOnchainSendWithFunction(ctx, method, key, {
        abi: defaults?.abi,
        address: defaults?.address,
        source: defaults?.source,
    });

    return {
        mappedMethod: method,
        defaults: defaults
            ? {
                  source: defaults.source,
                  address: defaults.address || null,
                  abi: defaults.abi ? "available" : "none",
              }
            : null,
        result,
    };
}
