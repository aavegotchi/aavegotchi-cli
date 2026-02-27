# Subgraph Query Matrix

## Generic commands

- `ag subgraph list`
  - No network call. Returns canonical alias definitions.

- `ag subgraph check --source core-base|gbm-base [--raw]`
  - Runs introspection query.
  - Output includes sorted query field names.

- `ag subgraph query --source <alias> (--query <graphql> | --query-file <path>) [--variables-json <json>] [--raw] [--timeout-ms <ms>] [--auth-env-var <ENV>] [--subgraph-url <url> --allow-untrusted-subgraph]`

## Baazaar wrappers (`core-base`)

- `ag baazaar listing get --kind erc721 --id <listingId> [--verify-onchain] [--raw]`
  - Query: `erc721Listing(id: $id)`
  - Verify path: compares to `getERC721Listing` on Base Aavegotchi diamond.

- `ag baazaar listing get --kind erc1155 --id <listingId> [--verify-onchain] [--raw]`
  - Query: `erc1155Listing(id: $id)`
  - Verify path: compares to `getERC1155Listing` on Base Aavegotchi diamond.

- `ag baazaar listing active --kind erc721 [--first <n>] [--skip <n>] [--raw]`
  - Filter: `{ cancelled: false, timePurchased: "0" }`

- `ag baazaar listing active --kind erc1155 [--first <n>] [--skip <n>] [--raw]`
  - Filter: `{ cancelled: false, sold: false }`

- `ag baazaar listing mine --kind erc721 --seller <0x...> [--first <n>] [--skip <n>] [--raw]`
  - Filter: `{ seller: $seller }` (`Bytes`, lowercase)

- `ag baazaar listing mine --kind erc1155 --seller <0x...> [--first <n>] [--skip <n>] [--raw]`
  - Filter: `{ seller: $seller }` (`Bytes`, lowercase)

## GBM wrappers (`gbm-base`)

- `ag auction get --id <auctionId> [--verify-onchain] [--raw]`
  - Query: `auction(id: $id)`
  - Verify path compares to `getAuctionHighestBid`, `getContractAddress`, `getTokenId`, `getAuctionStartTime`, `getAuctionEndTime`.

- `ag auction active [--first <n>] [--skip <n>] [--at-time <unix>] [--raw]`
  - Filter: `{ claimed: false, cancelled: false, startsAt_lte: $now, endsAt_gt: $now }`

- `ag auction mine --seller <0x...> [--first <n>] [--skip <n>] [--raw]`
  - Filter: `{ seller: $seller }` (`Bytes`, lowercase)

- `ag auction bids --auction-id <id> [--first <n>] [--skip <n>] [--raw]`
  - Filter: `{ auction: $auctionId }`

- `ag auction bids-mine --bidder <0x...> [--first <n>] [--skip <n>] [--raw]`
  - Filter: `{ bidder: $bidder }` (`Bytes`, lowercase)

## Pagination

- `--first` default `20`, min `1`, max `200`
- `--skip` default `0`, min `0`, max `100000`
- No auto-pagination in v0.2.0

## Output contract

All commands return envelope:

- `schemaVersion`
- `command`
- `status`
- `data`
- `meta`

Typed response payload includes:

- `source`
- `endpoint`
- `queryName`
- `pagination` where applicable
- normalized entity fields

`--raw` adds `raw` with complete GraphQL payload while preserving typed projection.
