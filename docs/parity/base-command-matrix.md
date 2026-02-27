# Base Command Matrix (v1)

Generated on: 2026-02-27

Status legend:
- `implemented`: command works end-to-end in current CLI
- `planned`: command namespace exists but method-specific flow is pending

| Domain | Method | CLI Command | Status |
| --- | --- | --- | --- |
| lending | `addGotchiLending` | `lending create` | planned |
| lending | `agreeGotchiLending` | `lending agree` | planned |
| token | `approve` | `token approve` / `onchain send` | planned |
| gotchi/xp | `batchDropClaimXPDrop` | `gotchi xp claim-batch` | planned |
| baazaar | `batchExecuteERC1155Listing` | `baazaar listing batch-execute` | planned |
| realm | `batchHarvest` | `realm harvest batch` | planned |
| bridge | `bridge` | `token bridge` | planned |
| baazaar/auction | `buyNow` | `baazaar buy-now` / `auction buy-now` | planned |
| auction | `cancelAuction` | `auction cancel` | planned |
| baazaar | `cancelERC1155Listing` | `baazaar cancel-erc1155` | planned |
| baazaar | `cancelERC721Listing` | `baazaar cancel-erc721` | planned |
| lending | `cancelGotchiLending` | `lending cancel` | planned |
| forge | `claim` | `forge claim` | planned |
| portal | `claimAavegotchi` | `portal claim` | planned |
| lending | `claimAndEndGotchiLending` | `lending claim-end` | planned |
| forge | `claimForgeQueueItems` | `forge queue claim` | planned |
| auction | `commitBid` | `auction bid` | planned |
| gotchi-points | `convertAlchemica` | `gotchi-points convert-alchemica` | planned |
| auction | `createAuction` | `auction create` | planned |
| lending | `createWhitelist` | `lending whitelist create` | planned |
| staking | `decreaseAndDestroy` | `staking unstake-destroy` | planned |
| staking | `enterWithUnderlying` | `staking enter-underlying` | planned |
| gotchi | `equipDelegatedWearables` | `gotchi equip-delegated` | planned |
| forge | `forgeWearables` | `forge craft` | planned |
| staking | `leaveToUnderlying` | `staking leave-underlying` | planned |
| portal | `openPortals` | `portal open` | planned |
| forge | `reduceQueueTime` | `forge speedup` | planned |
| inventory | `safeTransferFrom` | `inventory transfer` | planned |
| approvals | `setApprovalForAll` | `token set-approval-for-all` | planned |
| forge | `smeltWearables` | `forge smelt` | planned |
| gotchi | `spendSkillPoints` | `gotchi spend-skill-points` | planned |
| baazaar | `swapAndBuyNow` | `baazaar swap-buy-now` | planned |
| auction | `swapAndCommitBid` | `auction swap-bid` | planned |
| lending | `transferEscrow` | `lending transfer-escrow` | planned |
| baazaar | `updateERC1155ListingPriceAndQuantity` | `baazaar update-erc1155` | planned |
| lending | `updateWhitelist` | `lending whitelist update` | planned |
| gotchi | `useConsumables` | `gotchi feed` | planned |
| staking | `withdrawFromPool` | `staking withdraw-pool` | planned |

## Implemented command families today

- `bootstrap`
- `profile list/show/use/export`
- `policy list/show/upsert`
- `rpc check`
- `tx send/status/resume/watch`
- `batch run`
- `onchain call/send`

All other domain-specific commands above are currently mapped as planned namespace parity targets.
