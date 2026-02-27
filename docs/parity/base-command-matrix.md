# Base Command Matrix (v1)

Generated on: 2026-02-27

Status legend:
- `implemented`: command works end-to-end in current CLI
- `implemented (mapped)`: domain alias command routes through generic `onchain send`
- `planned`: command namespace exists but method-specific flow is pending

| Domain | Method | CLI Command | Status |
| --- | --- | --- | --- |
| lending | `addGotchiLending` | `lending create` | implemented (mapped) |
| lending | `agreeGotchiLending` | `lending agree` | implemented (mapped) |
| token | `approve` | `token approve` / `onchain send` | implemented (mapped) |
| gotchi/xp | `batchDropClaimXPDrop` | `gotchi xp claim-batch` | implemented (mapped) |
| baazaar | `batchExecuteERC1155Listing` | `baazaar listing batch-execute` | implemented (mapped) |
| realm | `batchHarvest` | `realm harvest batch` | implemented (mapped) |
| bridge | `bridge` | `token bridge` | implemented (mapped) |
| baazaar/auction | `buyNow` | `baazaar buy-now` / `auction buy-now` | implemented (mapped) |
| auction | `cancelAuction` | `auction cancel` | implemented (mapped) |
| baazaar | `cancelERC1155Listing` | `baazaar cancel-erc1155` | implemented (mapped) |
| baazaar | `cancelERC721Listing` | `baazaar cancel-erc721` | implemented (mapped) |
| lending | `cancelGotchiLending` | `lending cancel` | implemented (mapped) |
| forge | `claim` | `forge claim` | implemented (mapped) |
| portal | `claimAavegotchi` | `portal claim` | implemented (mapped) |
| lending | `claimAndEndGotchiLending` | `lending claim-end` | implemented (mapped) |
| forge | `claimForgeQueueItems` | `forge queue claim` | implemented (mapped) |
| auction | `commitBid` | `auction bid` | implemented (mapped) |
| gotchi-points | `convertAlchemica` | `gotchi-points convert-alchemica` | implemented (mapped) |
| auction | `createAuction` | `auction create` | implemented (mapped) |
| lending | `createWhitelist` | `lending whitelist create` | implemented (mapped) |
| staking | `decreaseAndDestroy` | `staking unstake-destroy` | implemented (mapped) |
| staking | `enterWithUnderlying` | `staking enter-underlying` | implemented (mapped) |
| gotchi | `equipDelegatedWearables` | `gotchi equip-delegated` | implemented (mapped) |
| forge | `forgeWearables` | `forge craft` | implemented (mapped) |
| staking | `leaveToUnderlying` | `staking leave-underlying` | implemented (mapped) |
| portal | `openPortals` | `portal open` | implemented (mapped) |
| forge | `reduceQueueTime` | `forge speedup` | implemented (mapped) |
| inventory | `safeTransferFrom` | `inventory transfer` | implemented (mapped) |
| approvals | `setApprovalForAll` | `token set-approval-for-all` | implemented (mapped) |
| forge | `smeltWearables` | `forge smelt` | implemented (mapped) |
| gotchi | `spendSkillPoints` | `gotchi spend-skill-points` | implemented (mapped) |
| baazaar | `swapAndBuyNow` | `baazaar swap-buy-now` | implemented (mapped) |
| auction | `swapAndCommitBid` | `auction swap-bid` | implemented (mapped) |
| lending | `transferEscrow` | `lending transfer-escrow` | implemented (mapped) |
| baazaar | `updateERC1155ListingPriceAndQuantity` | `baazaar update-erc1155` | implemented (mapped) |
| lending | `updateWhitelist` | `lending whitelist update` | implemented (mapped) |
| gotchi | `useConsumables` | `gotchi feed` | implemented (mapped) |
| staking | `withdrawFromPool` | `staking withdraw-pool` | implemented (mapped) |

## Implemented command families today

- `bootstrap`
- `profile list/show/use/export`
- `policy list/show/upsert`
- `rpc check`
- `tx send/status/resume/watch`
- `batch run`
- `onchain call/send`

All other domain-specific commands above are currently mapped as mapped write aliases (implemented) or namespace stubs (pending).
