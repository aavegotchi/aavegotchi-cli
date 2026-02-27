#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

AGCLI_HOME="${AGCLI_HOME:-/tmp/agcli-readonly-smoke}"
AG_BIN="${AG_BIN:-}"
TMP_DIR="${AGCLI_SMOKE_TMP:-/tmp/agcli-readonly-smoke-run}"
PROFILE_NAME="${AGCLI_PROFILE:-smoke}"

rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"

if [[ -n "$AG_BIN" ]]; then
    AG_CMD=("$AG_BIN")
else
    AG_CMD=(npx tsx src/index.ts)
fi

pass=0
fail=0
LAST_OUT="$TMP_DIR/last.json"
LAST_ERR="$TMP_DIR/last.err"

run_json() {
    local name="$1"
    shift

    echo "--- $name"
    if AGCLI_HOME="$AGCLI_HOME" "${AG_CMD[@]}" "$@" --json >"$LAST_OUT" 2>"$LAST_ERR"; then
        if node -e 'const fs=require("fs");const p=process.argv[1];const d=JSON.parse(fs.readFileSync(p,"utf8"));if(d.status!=="ok"){process.exit(1)}' "$LAST_OUT"; then
            echo "PASS"
            pass=$((pass + 1))
            return 0
        fi
    fi

    echo "FAIL"
    cat "$LAST_ERR" || true
    cat "$LAST_OUT" || true
    fail=$((fail + 1))
    return 1
}

extract_json() {
    local path="$1"
    local expr="$2"
    node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); const v=(${expr}); if(v===undefined||v===null){process.exit(0)} process.stdout.write(String(v));" "$path"
}

ZERO_ADDRESS="0x0000000000000000000000000000000000000000"
DEFAULT_ERC721_LISTING_ID="2705"
DEFAULT_ERC1155_LISTING_ID="5064"
DEFAULT_BAAZAAR_SELLER="0x59fc6b4e064b62cc7aed200a71aef3eac36c1287"
DEFAULT_AUCTION_ID="5693"
DEFAULT_AUCTION_SELLER="0x02aee0ce756fa0157294ff3ff48c1dd02adccf04"
DEFAULT_BIDDER="0xe6afe9d3fb43b9536a413b473eaf71620be64a4f"

ABI_FILE="$TMP_DIR/marketplace-getter.json"
cat >"$ABI_FILE" <<'JSON'
[
  {
    "type":"function",
    "name":"getERC721Listing",
    "stateMutability":"view",
    "inputs":[{"name":"_listingId","type":"uint256"}],
    "outputs":[
      {
        "name":"listing_",
        "type":"tuple",
        "components":[
          {"name":"listingId","type":"uint256"},
          {"name":"seller","type":"address"},
          {"name":"erc721TokenAddress","type":"address"},
          {"name":"erc721TokenId","type":"uint256"},
          {"name":"category","type":"uint256"},
          {"name":"priceInWei","type":"uint256"},
          {"name":"timeCreated","type":"uint256"},
          {"name":"timePurchased","type":"uint256"},
          {"name":"cancelled","type":"bool"},
          {"name":"principalSplit","type":"uint16[2]"},
          {"name":"affiliate","type":"address"},
          {"name":"whitelistId","type":"uint32"}
        ]
      }
    ]
  }
]
JSON

run_json "bootstrap readonly profile" bootstrap --mode agent --profile "$PROFILE_NAME" --chain base --signer readonly

run_json "profile list" profile list
run_json "profile show" profile show --profile "$PROFILE_NAME"
run_json "profile export" profile export --profile "$PROFILE_NAME"
run_json "policy list" policy list
run_json "policy show" policy show --policy default
run_json "rpc check" rpc check --profile "$PROFILE_NAME"
run_json "signer check" signer check --profile "$PROFILE_NAME"
run_json "signer keychain list" signer keychain list
run_json "tx status" tx status --profile "$PROFILE_NAME"

run_json "subgraph list" subgraph list
run_json "subgraph check core-base" subgraph check --source core-base
run_json "subgraph check gbm-base" subgraph check --source gbm-base
run_json "subgraph query core-base" subgraph query --source core-base --query 'query($first:Int!){ erc721Listings(first:$first, orderBy: timeCreated, orderDirection: desc){ id seller tokenId } }' --variables-json '{"first":1}'

run_json "baazaar listing active erc721" baazaar listing active --kind erc721 --first 1
cp "$LAST_OUT" "$TMP_DIR/erc721-active.json"
ERC721_LISTING_ID="$(extract_json "$TMP_DIR/erc721-active.json" 'd.data?.listings?.[0]?.id')"
ERC721_SELLER="$(extract_json "$TMP_DIR/erc721-active.json" 'd.data?.listings?.[0]?.seller')"

run_json "baazaar listing active erc1155" baazaar listing active --kind erc1155 --first 1
cp "$LAST_OUT" "$TMP_DIR/erc1155-active.json"
ERC1155_LISTING_ID="$(extract_json "$TMP_DIR/erc1155-active.json" 'd.data?.listings?.[0]?.id')"
ERC1155_SELLER="$(extract_json "$TMP_DIR/erc1155-active.json" 'd.data?.listings?.[0]?.seller')"

ERC721_LISTING_ID="${ERC721_LISTING_ID:-$DEFAULT_ERC721_LISTING_ID}"
ERC1155_LISTING_ID="${ERC1155_LISTING_ID:-$DEFAULT_ERC1155_LISTING_ID}"
ERC721_SELLER="${ERC721_SELLER:-$DEFAULT_BAAZAAR_SELLER}"
ERC1155_SELLER="${ERC1155_SELLER:-$DEFAULT_BAAZAAR_SELLER}"

run_json "baazaar listing mine erc721" baazaar listing mine --kind erc721 --seller "$ERC721_SELLER" --first 3
run_json "baazaar listing mine erc1155" baazaar listing mine --kind erc1155 --seller "$ERC1155_SELLER" --first 3
run_json "baazaar listing get erc721 verify" baazaar listing get --kind erc721 --id "$ERC721_LISTING_ID" --verify-onchain
run_json "baazaar listing get erc1155 verify" baazaar listing get --kind erc1155 --id "$ERC1155_LISTING_ID" --verify-onchain

run_json "auction active" auction active --first 1
cp "$LAST_OUT" "$TMP_DIR/auction-active.json"
AUCTION_ID="$(extract_json "$TMP_DIR/auction-active.json" 'd.data?.auctions?.[0]?.id')"
AUCTION_SELLER="$(extract_json "$TMP_DIR/auction-active.json" 'd.data?.auctions?.[0]?.seller')"
ACTIVE_BIDDER="$(extract_json "$TMP_DIR/auction-active.json" 'd.data?.auctions?.[0]?.highestBidder')"

AUCTION_ID="${AUCTION_ID:-$DEFAULT_AUCTION_ID}"
AUCTION_SELLER="${AUCTION_SELLER:-$DEFAULT_AUCTION_SELLER}"

run_json "auction get verify" auction get --id "$AUCTION_ID" --verify-onchain
run_json "auction mine" auction mine --seller "$AUCTION_SELLER" --first 3
run_json "auction bids" auction bids --auction-id "$AUCTION_ID" --first 1
cp "$LAST_OUT" "$TMP_DIR/auction-bids.json"
BIDS_BIDDER="$(extract_json "$TMP_DIR/auction-bids.json" 'd.data?.bids?.[0]?.bidder')"

if [[ -n "$BIDS_BIDDER" && "$BIDS_BIDDER" != "$ZERO_ADDRESS" ]]; then
    BIDDER="$BIDS_BIDDER"
elif [[ -n "$ACTIVE_BIDDER" && "$ACTIVE_BIDDER" != "$ZERO_ADDRESS" ]]; then
    BIDDER="$ACTIVE_BIDDER"
else
    BIDDER="$DEFAULT_BIDDER"
fi

run_json "auction bids-mine" auction bids-mine --bidder "$BIDDER" --first 3

run_json "onchain call" onchain call --profile "$PROFILE_NAME" --abi-file "$ABI_FILE" --address 0xa99c4b08201f2913db8d28e71d020c4298f29dbf --function getERC721Listing --args-json "[$ERC721_LISTING_ID]"
run_json "baazaar read (onchain path)" baazaar read --profile "$PROFILE_NAME" --abi-file "$ABI_FILE" --address 0xa99c4b08201f2913db8d28e71d020c4298f29dbf --function getERC721Listing --args-json "[$ERC721_LISTING_ID]"

echo "RESULT pass=$pass fail=$fail"
if [[ "$fail" -ne 0 ]]; then
    exit 1
fi
