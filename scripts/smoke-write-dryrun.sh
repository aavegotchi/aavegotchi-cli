#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

AGCLI_HOME="${AGCLI_HOME:-/tmp/agcli-write-dryrun-smoke}"
AG_BIN="${AG_BIN:-}"
TMP_DIR="${AGCLI_SMOKE_TMP:-/tmp/agcli-write-dryrun-run}"
PROFILE_NAME="${AGCLI_PROFILE:-smoke-write}"
PRIVATE_KEY_ENV="${AGCLI_PRIVATE_KEY_ENV:-AGCLI_PRIVATE_KEY}"
GHST_TOKEN="${AGCLI_GHST_TOKEN:-0xcd2f22236dd9dfe2356d7c543161d4d260fd9bcb}"

rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"

if [[ -n "$AG_BIN" ]]; then
    AG_CMD=("$AG_BIN")
else
    AG_CMD=(npx tsx src/index.ts)
fi

if [[ -z "${!PRIVATE_KEY_ENV:-}" ]]; then
    printf -v "$PRIVATE_KEY_ENV" "%s" "0x1111111111111111111111111111111111111111111111111111111111111111"
    export "$PRIVATE_KEY_ENV"
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

run_expect_error() {
    local name="$1"
    local expected_code="$2"
    shift 2

    echo "--- $name"
    if AGCLI_HOME="$AGCLI_HOME" "${AG_CMD[@]}" "$@" --json >"$LAST_OUT" 2>"$LAST_ERR"; then
        echo "FAIL (expected error $expected_code but command succeeded)"
        cat "$LAST_OUT" || true
        fail=$((fail + 1))
        return 1
    fi

    if node -e 'const fs=require("fs");const p=process.argv[1];const expected=process.argv[2];const d=JSON.parse(fs.readFileSync(p,"utf8"));if(d.status!=="error"||d.error?.code!==expected){process.exit(1)}' "$LAST_ERR" "$expected_code"; then
        echo "PASS"
        pass=$((pass + 1))
        return 0
    fi

    echo "FAIL (unexpected error payload)"
    cat "$LAST_ERR" || true
    fail=$((fail + 1))
    return 1
}

extract_json() {
    local path="$1"
    local expr="$2"
    node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); const v=(${expr}); if(v===undefined||v===null){process.exit(1)} process.stdout.write(String(v));" "$path"
}

APPROVE_ABI="$TMP_DIR/approve.json"
cat >"$APPROVE_ABI" <<'JSON'
[
  {
    "type": "function",
    "name": "approve",
    "stateMutability": "nonpayable",
    "inputs": [
      { "name": "spender", "type": "address" },
      { "name": "amount", "type": "uint256" }
    ],
    "outputs": [
      { "name": "", "type": "bool" }
    ]
  }
]
JSON

run_json "bootstrap env signer profile" bootstrap --mode agent --profile "$PROFILE_NAME" --chain base --signer "env:$PRIVATE_KEY_ENV"
run_json "signer check" signer check --profile "$PROFILE_NAME"
cp "$LAST_OUT" "$TMP_DIR/signer-check.json"
SIGNER_ADDRESS="$(extract_json "$TMP_DIR/signer-check.json" 'd.data?.signer?.address')"

run_json "tx send dry-run" tx send --profile "$PROFILE_NAME" --to "$SIGNER_ADDRESS" --value-wei 0 --dry-run
run_expect_error "tx send dry-run + wait" "INVALID_ARGUMENT" tx send --profile "$PROFILE_NAME" --to "$SIGNER_ADDRESS" --value-wei 0 --dry-run --wait

run_json "onchain send dry-run (approve)" onchain send --profile "$PROFILE_NAME" --abi-file "$APPROVE_ABI" --address "$GHST_TOKEN" --function approve --args-json "[\"$SIGNER_ADDRESS\",\"1\"]" --dry-run
run_expect_error "onchain send dry-run + wait" "INVALID_ARGUMENT" onchain send --profile "$PROFILE_NAME" --abi-file "$APPROVE_ABI" --address "$GHST_TOKEN" --function approve --args-json "[\"$SIGNER_ADDRESS\",\"1\"]" --dry-run --wait

run_json "mapped token approve dry-run" token approve --profile "$PROFILE_NAME" --abi-file "$APPROVE_ABI" --address "$GHST_TOKEN" --args-json "[\"$SIGNER_ADDRESS\",\"1\"]" --dry-run

echo "RESULT pass=$pass fail=$fail"
if [[ "$fail" -ne 0 ]]; then
    exit 1
fi
