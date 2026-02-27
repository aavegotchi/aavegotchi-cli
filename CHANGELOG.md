# Changelog

## 0.2.1 - 2026-02-27

### Added

- `--dry-run` mode for write surfaces:
  - `ag tx send --dry-run`
  - `ag onchain send --dry-run`
  - mapped writes (for example `ag token approve --dry-run`)
- `scripts/smoke-write-dryrun.sh` and npm script `smoke:write-dryrun` for automated write-path smoke checks without broadcasting.

### Changed

- Dry-run execution now returns `status: "simulated"` with simulation details and skips journal mutation and transaction submission.
- `--dry-run` is explicitly blocked with `--wait` / `--confirm`.

## 0.2.0 - 2026-02-27

### Added

- Generic subgraph command family:
  - `ag subgraph list`
  - `ag subgraph check --source core-base|gbm-base [--raw]`
  - `ag subgraph query --source <alias> ...`
- Baazaar subgraph wrappers:
  - `ag baazaar listing get --kind erc721|erc1155 --id <listingId> [--verify-onchain]`
  - `ag baazaar listing active --kind erc721|erc1155 [--first] [--skip]`
  - `ag baazaar listing mine --kind erc721|erc1155 --seller <0x...> [--first] [--skip]`
- GBM subgraph wrappers:
  - `ag auction get --id <auctionId> [--verify-onchain]`
  - `ag auction active [--first] [--skip] [--at-time <unix>]`
  - `ag auction mine --seller <0x...> [--first] [--skip]`
  - `ag auction bids --auction-id <id> [--first] [--skip]`
  - `ag auction bids-mine --bidder <0x...> [--first] [--skip]`
- Optional `--raw` GraphQL payload passthrough while preserving typed projections.
- New docs under `docs/subgraph/` for endpoint policy and query matrix.

### Security and policy

- Strict endpoint allowlist by default for canonical sources only.
- Custom endpoint override requires both `--subgraph-url` and `--allow-untrusted-subgraph`.
- Non-HTTPS custom subgraph endpoints are rejected.

### Notes

- Existing `onchain`, `tx`, mapped write aliases, and `baazaar read` onchain call behavior are preserved.
