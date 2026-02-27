import { encodeFunctionData, parseAbi, parseUnits } from "viem";

import { getFlagBoolean, getFlagString } from "../args";
import { resolveChain, resolveRpcUrl, toViemChain } from "../chains";
import { getPolicyOrThrow, getProfileOrThrow, loadConfig } from "../config";
import { CliError } from "../errors";
import { applyProfileEnvironment } from "../profile-env";
import { runRpcPreflight } from "../rpc";
import { resolveSignerRuntime } from "../signer";
import { normalizeGbmAuction, normalizeGbmAuctions } from "../subgraph/normalize";
import { executeSubgraphQuery } from "../subgraph/client";
import { GBM_ACTIVE_AUCTIONS_QUERY, GBM_AUCTION_BY_ID_QUERY } from "../subgraph/queries";
import { BASE_GBM_DIAMOND } from "../subgraph/sources";
import { executeTxIntent } from "../tx-engine";
import { CommandContext, FlagValue, JsonValue, TxIntent } from "../types";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const GHST_DECIMALS = 18;
const BATCH_DEFAULT_FIRST = 200;
const BATCH_MAX_FIRST = 200;

// Canonical addresses from aavegotchi-base deployments.
const GHST_BY_CHAIN_ID: Record<number, `0x${string}`> = {
    8453: "0xcd2f22236dd9dfe2356d7c543161d4d260fd9bcb",
    84532: "0xe97f36a00058aa7dfc4e85d23532c3f70453a7ae",
};

const GBM_DIAMOND_BY_CHAIN_ID: Record<number, `0x${string}`> = {
    8453: BASE_GBM_DIAMOND,
    84532: "0x8572ce8ad6c9788bb6da3509117646047dd8b543",
};

const GBM_BID_WRITE_ABI = parseAbi(["function commitBid(uint256,uint256,uint256,address,uint256,uint256,bytes)"]);
const GBM_AUCTION_READ_ABI = parseAbi([
    "function getAuctionHighestBid(uint256 _auctionId) view returns (uint256)",
    "function getAuctionHighestBidder(uint256 _auctionId) view returns (address)",
    "function getContractAddress(uint256 _auctionId) view returns (address)",
    "function getTokenId(uint256 _auctionId) view returns (uint256)",
    "function getAuctionStartTime(uint256 _auctionId) view returns (uint256)",
    "function getAuctionEndTime(uint256 _auctionId) view returns (uint256)",
    "function getAuctionIncMin(uint256 _auctionId) view returns (uint64)",
]);
const ERC20_ABI = parseAbi([
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address,address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)",
]);

interface BidContext {
    profileName: string;
    policy: TxIntent["policy"];
    chain: ReturnType<typeof resolveChain>;
    rpcUrl: string;
    signer: TxIntent["signer"];
    signerAddress: `0x${string}`;
    gbmDiamond: `0x${string}`;
    ghstToken: `0x${string}`;
    environment: JsonValue;
}

interface AuctionOnchainSnapshot {
    auctionId: string;
    highestBidWei: bigint;
    highestBidder: `0x${string}`;
    contractAddress: `0x${string}`;
    tokenId: bigint;
    startsAt: bigint;
    endsAt: bigint;
    incMin: bigint;
}

interface PreflightCheck {
    check: string;
    status: "pass" | "fail" | "auto-fixed" | "skip";
    reasonCode?: string;
    details?: JsonValue;
}

function parseAddress(value: unknown, hint: string): `0x${string}` {
    if (typeof value !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
        throw new CliError("INVALID_ARGUMENT", `${hint} must be a valid EVM address.`, 2, { value });
    }

    return value.toLowerCase() as `0x${string}`;
}

function parseAuctionId(value: string | undefined, flagName: string): string {
    if (!value) {
        throw new CliError("MISSING_ARGUMENT", `${flagName} is required.`, 2);
    }

    if (!/^\d+$/.test(value)) {
        throw new CliError("INVALID_ARGUMENT", `${flagName} must be an unsigned integer string.`, 2, { value });
    }

    return value;
}

function parseNonNegativeBigint(value: string, label: string): bigint {
    if (!/^\d+$/.test(value)) {
        throw new CliError("INVALID_ARGUMENT", `${label} must be a non-negative integer string.`, 2, { value });
    }

    return BigInt(value);
}

function parseGhstAmount(value: string, label: string, allowZero = false): bigint {
    if (!/^\d+(\.\d{1,18})?$/.test(value)) {
        throw new CliError("INVALID_ARGUMENT", `${label} must be a decimal GHST amount (up to 18 decimals).`, 2, {
            value,
        });
    }

    const parsed = parseUnits(value, GHST_DECIMALS);
    if (!allowZero && parsed <= 0n) {
        throw new CliError("INVALID_ARGUMENT", `${label} must be greater than 0.`, 2, { value });
    }

    return parsed;
}

function parseAmountWeiFromFlags(
    flags: Record<string, FlagValue>,
    options: {
        weiKey: string;
        ghstKey: string;
        label: string;
        allowZero?: boolean;
    },
): bigint {
    const weiRaw = getFlagString(flags, options.weiKey);
    const ghstRaw = getFlagString(flags, options.ghstKey);
    if (!weiRaw && !ghstRaw) {
        throw new CliError(
            "MISSING_ARGUMENT",
            `${options.label} is required. Use --${options.ghstKey} <amount> or --${options.weiKey} <wei>.`,
            2,
        );
    }

    if (weiRaw && ghstRaw) {
        throw new CliError("INVALID_ARGUMENT", `Use either --${options.ghstKey} or --${options.weiKey}, not both.`, 2);
    }

    const parsed = weiRaw ? parseNonNegativeBigint(weiRaw, `--${options.weiKey}`) : parseGhstAmount(ghstRaw as string, `--${options.ghstKey}`);
    if (!options.allowZero && parsed <= 0n) {
        throw new CliError("INVALID_ARGUMENT", `${options.label} must be greater than 0.`, 2);
    }

    return parsed;
}

function parseOptionalExpectedHighestBid(flags: Record<string, FlagValue>): bigint | undefined {
    const expectedWei = getFlagString(flags, "expected-highest-bid-wei");
    const expectedGhst = getFlagString(flags, "expected-highest-bid-ghst");

    if (!expectedWei && !expectedGhst) {
        return undefined;
    }

    if (expectedWei && expectedGhst) {
        throw new CliError("INVALID_ARGUMENT", "Use either --expected-highest-bid-ghst or --expected-highest-bid-wei, not both.", 2);
    }

    return expectedWei
        ? parseNonNegativeBigint(expectedWei, "--expected-highest-bid-wei")
        : parseGhstAmount(expectedGhst as string, "--expected-highest-bid-ghst", true);
}

function parseNoncePolicy(flags: Record<string, FlagValue>): TxIntent["noncePolicy"] {
    const noncePolicy = getFlagString(flags, "nonce-policy") || "safe";
    if (noncePolicy !== "safe" && noncePolicy !== "replace" && noncePolicy !== "manual") {
        throw new CliError("INVALID_NONCE_POLICY", `Unsupported nonce policy '${noncePolicy}'.`, 2);
    }

    return noncePolicy;
}

function parseNonce(flags: Record<string, FlagValue>): number | undefined {
    const raw = getFlagString(flags, "nonce");
    if (!raw) {
        return undefined;
    }

    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new CliError("INVALID_ARGUMENT", "--nonce must be a non-negative integer.", 2, {
            value: raw,
        });
    }

    return parsed;
}

function parseTimeoutMs(flags: Record<string, FlagValue>): number {
    const raw = getFlagString(flags, "timeout-ms");
    if (!raw) {
        return 120000;
    }

    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new CliError("INVALID_ARGUMENT", "--timeout-ms must be a positive integer.", 2, {
            value: raw,
        });
    }

    return parsed;
}

function parseBoundedIntFlag(
    value: string | undefined,
    flagName: string,
    fallback: number,
    min: number,
    max: number,
): number {
    if (!value) {
        return fallback;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        throw new CliError("INVALID_ARGUMENT", `${flagName} must be an integer between ${min} and ${max}.`, 2, {
            value,
        });
    }

    return parsed;
}

function classifyRevert(message: string): { reasonCode: string; reason: string } {
    const normalized = message.toLowerCase();
    if (normalized.includes("allowance")) {
        return {
            reasonCode: "INSUFFICIENT_ALLOWANCE",
            reason: "Allowance is below required amount for transferFrom.",
        };
    }

    if ((normalized.includes("bid") && normalized.includes("low")) || normalized.includes("start bid")) {
        return {
            reasonCode: "BID_BELOW_START",
            reason: "Bid amount is below minimum required value.",
        };
    }

    if (
        normalized.includes("auction") &&
        (normalized.includes("ended") ||
            normalized.includes("not active") ||
            normalized.includes("already") ||
            normalized.includes("state"))
    ) {
        return {
            reasonCode: "AUCTION_STATE_CHANGED",
            reason: "Auction state changed between preflight and submit.",
        };
    }

    return {
        reasonCode: "UNKNOWN_REVERT",
        reason: "Revert reason could not be classified.",
    };
}

function throwPreflightError(
    reasonCode: string,
    message: string,
    checks: PreflightCheck[],
    details?: Record<string, unknown>,
): never {
    throw new CliError(reasonCode, message, 2, {
        reasonCode,
        checks,
        ...(details || {}),
    });
}

function parseBatchIdempotencyKey(base: string | undefined, auctionId: string, amountWei: bigint): string {
    if (base) {
        return `${base}:${auctionId}:${amountWei.toString()}`;
    }

    return `auction.bid-unbid:${auctionId}:${amountWei.toString()}`;
}

async function resolveBidContext(ctx: CommandContext): Promise<BidContext> {
    const config = loadConfig();
    const profileName = getFlagString(ctx.args.flags, "profile") || ctx.globals.profile;
    const profile = getProfileOrThrow(config, profileName);
    const policy = getPolicyOrThrow(config, profile.policy);
    const environment = applyProfileEnvironment(profile);

    const chain = resolveChain(profile.chain);
    const rpcUrl = resolveRpcUrl(chain, getFlagString(ctx.args.flags, "rpc-url") || profile.rpcUrl);
    const preflight = await runRpcPreflight(chain, rpcUrl);

    const signerRuntime = await resolveSignerRuntime(profile.signer, preflight.client, rpcUrl, toViemChain(chain, rpcUrl));
    const signerAddress = signerRuntime.summary.address;
    if (!signerAddress) {
        throw new CliError("MISSING_SIGNER_ADDRESS", "Signer address is required for auction bidding.", 2, {
            signerType: signerRuntime.summary.signerType,
            backendStatus: signerRuntime.summary.backendStatus,
        });
    }

    const gbmDiamond = GBM_DIAMOND_BY_CHAIN_ID[chain.chainId];
    const ghstToken = GHST_BY_CHAIN_ID[chain.chainId];

    if (!gbmDiamond || !ghstToken) {
        throw new CliError(
            "UNSUPPORTED_CHAIN",
            `auction bid currently supports chains ${Object.keys(GBM_DIAMOND_BY_CHAIN_ID).join(", ")}.`,
            2,
            {
                chainId: chain.chainId,
            },
        );
    }

    return {
        profileName: profile.name,
        policy,
        chain,
        rpcUrl,
        signer: profile.signer,
        signerAddress,
        gbmDiamond,
        ghstToken,
        environment,
    };
}

async function fetchAuctionFromSubgraph(auctionId: string): Promise<ReturnType<typeof normalizeGbmAuction>> {
    const response = await executeSubgraphQuery<{ auction: unknown | null }>({
        source: "gbm-base",
        queryName: "auction.bid.preflight",
        query: GBM_AUCTION_BY_ID_QUERY,
        variables: { id: auctionId },
    });

    if (!response.data.auction) {
        throw new CliError("AUCTION_NOT_FOUND", `Auction '${auctionId}' was not found in the GBM subgraph.`, 2, {
            auctionId,
            source: response.source,
            endpoint: response.endpoint,
        });
    }

    return normalizeGbmAuction(response.data.auction);
}

async function readOnchainSnapshot(
    bidContext: BidContext,
    auctionId: string,
): Promise<AuctionOnchainSnapshot> {
    const preflight = await runRpcPreflight(bidContext.chain, bidContext.rpcUrl);
    const id = BigInt(auctionId);

    const [highestBidWeiRaw, highestBidderRaw, contractAddressRaw, tokenIdRaw, startsAtRaw, endsAtRaw, incMinRaw] = await Promise.all([
        preflight.client.readContract({
            address: bidContext.gbmDiamond,
            abi: GBM_AUCTION_READ_ABI,
            functionName: "getAuctionHighestBid",
            args: [id],
        }),
        preflight.client.readContract({
            address: bidContext.gbmDiamond,
            abi: GBM_AUCTION_READ_ABI,
            functionName: "getAuctionHighestBidder",
            args: [id],
        }),
        preflight.client.readContract({
            address: bidContext.gbmDiamond,
            abi: GBM_AUCTION_READ_ABI,
            functionName: "getContractAddress",
            args: [id],
        }),
        preflight.client.readContract({
            address: bidContext.gbmDiamond,
            abi: GBM_AUCTION_READ_ABI,
            functionName: "getTokenId",
            args: [id],
        }),
        preflight.client.readContract({
            address: bidContext.gbmDiamond,
            abi: GBM_AUCTION_READ_ABI,
            functionName: "getAuctionStartTime",
            args: [id],
        }),
        preflight.client.readContract({
            address: bidContext.gbmDiamond,
            abi: GBM_AUCTION_READ_ABI,
            functionName: "getAuctionEndTime",
            args: [id],
        }),
        preflight.client.readContract({
            address: bidContext.gbmDiamond,
            abi: GBM_AUCTION_READ_ABI,
            functionName: "getAuctionIncMin",
            args: [id],
        }),
    ]);

    return {
        auctionId,
        highestBidWei: highestBidWeiRaw as bigint,
        highestBidder: parseAddress(highestBidderRaw, "auction highest bidder"),
        contractAddress: parseAddress(contractAddressRaw, "auction token contract"),
        tokenId: tokenIdRaw as bigint,
        startsAt: startsAtRaw as bigint,
        endsAt: endsAtRaw as bigint,
        incMin: incMinRaw as bigint,
    };
}

function computeMinimumBidWei(snapshot: AuctionOnchainSnapshot, startBidPriceWei: bigint): bigint {
    if (snapshot.highestBidWei > 0n) {
        const denominator = 10000n;
        return (snapshot.highestBidWei * (denominator + snapshot.incMin)) / denominator;
    }

    return startBidPriceWei;
}

function mapSimulationError(error: CliError): CliError {
    if (error.code !== "SIMULATION_REVERT") {
        return error;
    }

    const message = String((error.details as { message?: unknown } | undefined)?.message || "");
    const classified = classifyRevert(message);
    return new CliError("AUCTION_BID_REVERT", "Auction bid simulation reverted.", 2, {
        reasonCode: classified.reasonCode,
        reason: classified.reason,
        rawMessage: message,
    });
}

async function runSingleBid(
    ctx: CommandContext,
    options?: {
        forceAuctionId?: string;
        forceAmountWei?: bigint;
        forceExpectedHighestBidWei?: bigint;
        forceRequireUnbid?: boolean;
        forceIdempotencyKey?: string;
    },
): Promise<JsonValue> {
    const dryRun = getFlagBoolean(ctx.args.flags, "dry-run");
    const waitForReceipt = getFlagBoolean(ctx.args.flags, "wait");
    const autoApprove = getFlagBoolean(ctx.args.flags, "auto-approve");
    const requireUnbid = options?.forceRequireUnbid ?? getFlagBoolean(ctx.args.flags, "require-unbid");
    const timeoutMs = parseTimeoutMs(ctx.args.flags);
    const noncePolicy = parseNoncePolicy(ctx.args.flags);
    const nonce = parseNonce(ctx.args.flags);

    if (dryRun && waitForReceipt) {
        throw new CliError("INVALID_ARGUMENT", "--dry-run cannot be combined with --wait.", 2);
    }

    if (noncePolicy === "manual" && nonce === undefined) {
        throw new CliError("MISSING_NONCE", "--nonce is required when --nonce-policy=manual.", 2);
    }

    const auctionId = options?.forceAuctionId || parseAuctionId(getFlagString(ctx.args.flags, "auction-id"), "--auction-id");
    const amountWei =
        options?.forceAmountWei ||
        parseAmountWeiFromFlags(ctx.args.flags, {
            weiKey: "amount-wei",
            ghstKey: "amount-ghst",
            label: "Bid amount",
        });
    const expectedHighestBidWei = options?.forceExpectedHighestBidWei ?? parseOptionalExpectedHighestBid(ctx.args.flags);
    const idempotencyKey = options?.forceIdempotencyKey || getFlagString(ctx.args.flags, "idempotency-key");
    const autoApproveMaxWei = getFlagString(ctx.args.flags, "auto-approve-max-wei")
        ? parseNonNegativeBigint(getFlagString(ctx.args.flags, "auto-approve-max-wei") as string, "--auto-approve-max-wei")
        : getFlagString(ctx.args.flags, "auto-approve-max-ghst")
          ? parseGhstAmount(getFlagString(ctx.args.flags, "auto-approve-max-ghst") as string, "--auto-approve-max-ghst")
          : undefined;

    const bidContext = await resolveBidContext(ctx);
    const subgraphAuction = await fetchAuctionFromSubgraph(auctionId);
    const startBidPriceWei = parseNonNegativeBigint(subgraphAuction.startBidPrice || "0", "startBidPrice");
    const quantity = parseNonNegativeBigint(subgraphAuction.quantity, "quantity");
    const nowSec = BigInt(Math.floor(Date.now() / 1000));
    const checks: PreflightCheck[] = [];

    const onchainBefore = await readOnchainSnapshot(bidContext, auctionId);
    const minimumBidWei = computeMinimumBidWei(onchainBefore, startBidPriceWei);

    if (onchainBefore.startsAt <= nowSec && nowSec < onchainBefore.endsAt) {
        checks.push({ check: "AUCTION_OPEN", status: "pass" });
    } else {
        checks.push({
            check: "AUCTION_OPEN",
            status: "fail",
            reasonCode: "AUCTION_NOT_OPEN",
            details: {
                nowSec: nowSec.toString(),
                startsAt: onchainBefore.startsAt.toString(),
                endsAt: onchainBefore.endsAt.toString(),
            },
        });
        throwPreflightError("AUCTION_NOT_OPEN", "Auction is not currently open for bidding.", checks, {
            auctionId,
        });
    }

    if (requireUnbid) {
        const unbid = onchainBefore.highestBidWei === 0n && onchainBefore.highestBidder === ZERO_ADDRESS;
        if (!unbid) {
            checks.push({
                check: "REQUIRE_UNBID",
                status: "fail",
                reasonCode: "AUCTION_ALREADY_BID",
                details: {
                    highestBidWei: onchainBefore.highestBidWei.toString(),
                    highestBidder: onchainBefore.highestBidder,
                },
            });
            throwPreflightError("AUCTION_ALREADY_BID", "Auction already has a highest bid.", checks, {
                auctionId,
            });
        }

        checks.push({ check: "REQUIRE_UNBID", status: "pass" });
    } else {
        checks.push({ check: "REQUIRE_UNBID", status: "skip" });
    }

    if (expectedHighestBidWei !== undefined) {
        if (onchainBefore.highestBidWei !== expectedHighestBidWei) {
            checks.push({
                check: "EXPECTED_HIGHEST_BID",
                status: "fail",
                reasonCode: "EXPECTED_HIGHEST_BID_MISMATCH",
                details: {
                    expectedHighestBidWei: expectedHighestBidWei.toString(),
                    currentHighestBidWei: onchainBefore.highestBidWei.toString(),
                },
            });
            throwPreflightError("EXPECTED_HIGHEST_BID_MISMATCH", "Current highest bid does not match expected value.", checks, {
                auctionId,
            });
        }

        checks.push({ check: "EXPECTED_HIGHEST_BID", status: "pass" });
    } else {
        checks.push({ check: "EXPECTED_HIGHEST_BID", status: "skip" });
    }

    if (amountWei >= minimumBidWei) {
        checks.push({ check: "BID_MINIMUM", status: "pass" });
    } else {
        checks.push({
            check: "BID_MINIMUM",
            status: "fail",
            reasonCode: "BID_BELOW_START",
            details: {
                amountWei: amountWei.toString(),
                minimumBidWei: minimumBidWei.toString(),
                highestBidWei: onchainBefore.highestBidWei.toString(),
                startBidPriceWei: startBidPriceWei.toString(),
            },
        });
        throwPreflightError("BID_BELOW_START", "Bid amount is below the current minimum bid requirement.", checks, {
            auctionId,
        });
    }

    const preflight = await runRpcPreflight(bidContext.chain, bidContext.rpcUrl);
    const [ghstBalanceWeiRaw, allowanceWeiRaw] = await Promise.all([
        preflight.client.readContract({
            address: bidContext.ghstToken,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [bidContext.signerAddress],
        }),
        preflight.client.readContract({
            address: bidContext.ghstToken,
            abi: ERC20_ABI,
            functionName: "allowance",
            args: [bidContext.signerAddress, bidContext.gbmDiamond],
        }),
    ]);

    const ghstBalanceWei = ghstBalanceWeiRaw as bigint;
    const allowanceWei = allowanceWeiRaw as bigint;

    if (ghstBalanceWei >= amountWei) {
        checks.push({ check: "GHST_BALANCE", status: "pass" });
    } else {
        checks.push({
            check: "GHST_BALANCE",
            status: "fail",
            reasonCode: "INSUFFICIENT_GHST_BALANCE",
            details: {
                balanceWei: ghstBalanceWei.toString(),
                requiredWei: amountWei.toString(),
            },
        });
        throwPreflightError("INSUFFICIENT_GHST_BALANCE", "GHST balance is below bid amount.", checks, {
            auctionId,
            signer: bidContext.signerAddress,
        });
    }

    let approval: JsonValue | undefined;
    let approvalNeeded = allowanceWei < amountWei;
    if (approvalNeeded) {
        if (!autoApprove) {
            checks.push({
                check: "GHST_ALLOWANCE",
                status: "fail",
                reasonCode: "INSUFFICIENT_ALLOWANCE",
                details: {
                    allowanceWei: allowanceWei.toString(),
                    requiredWei: amountWei.toString(),
                },
            });
            throwPreflightError(
                "INSUFFICIENT_ALLOWANCE",
                "GHST allowance is below bid amount. Re-run with --auto-approve to submit approve() automatically.",
                checks,
                {
                    auctionId,
                    ghstToken: bidContext.ghstToken,
                    spender: bidContext.gbmDiamond,
                },
            );
        }

        const approveAmountWei = autoApproveMaxWei ?? amountWei;
        if (approveAmountWei < amountWei) {
            throw new CliError("AUTO_APPROVE_LIMIT_TOO_LOW", "auto-approve cap is below required bid amount.", 2, {
                approveAmountWei: approveAmountWei.toString(),
                requiredWei: amountWei.toString(),
            });
        }

        checks.push({
            check: "GHST_ALLOWANCE",
            status: "auto-fixed",
            reasonCode: "INSUFFICIENT_ALLOWANCE",
            details: {
                allowanceWei: allowanceWei.toString(),
                requiredWei: amountWei.toString(),
                approveAmountWei: approveAmountWei.toString(),
            },
        });

        const approveData = encodeFunctionData({
            abi: ERC20_ABI,
            functionName: "approve",
            args: [bidContext.gbmDiamond, approveAmountWei],
        });

        const approveIntent: TxIntent = {
            idempotencyKey: idempotencyKey ? `${idempotencyKey}:approve` : undefined,
            profileName: bidContext.profileName,
            chainId: bidContext.chain.chainId,
            rpcUrl: bidContext.rpcUrl,
            signer: bidContext.signer,
            policy: bidContext.policy,
            to: bidContext.ghstToken,
            data: approveData,
            noncePolicy: "safe",
            waitForReceipt: dryRun ? false : true,
            dryRun,
            timeoutMs,
            command: "auction approve-ghst",
        };

        try {
            const approvalResult = await executeTxIntent(approveIntent, bidContext.chain);
            approval = {
                autoApprove: true,
                approveAmountWei: approveAmountWei.toString(),
                result: approvalResult,
            };
        } catch (error: unknown) {
            if (error instanceof CliError) {
                throw mapSimulationError(error);
            }

            throw error;
        }
    } else {
        checks.push({ check: "GHST_ALLOWANCE", status: "pass" });
    }

    if (!dryRun) {
        const onchainBeforeSend = await readOnchainSnapshot(bidContext, auctionId);
        if (
            onchainBeforeSend.highestBidWei !== onchainBefore.highestBidWei ||
            onchainBeforeSend.highestBidder !== onchainBefore.highestBidder
        ) {
            throw new CliError("AUCTION_STATE_CHANGED", "Auction state changed before submit; aborting.", 2, {
                reasonCode: "AUCTION_STATE_CHANGED",
                previousHighestBidWei: onchainBefore.highestBidWei.toString(),
                currentHighestBidWei: onchainBeforeSend.highestBidWei.toString(),
                previousHighestBidder: onchainBefore.highestBidder,
                currentHighestBidder: onchainBeforeSend.highestBidder,
                auctionId,
            });
        }
    }

    const commitArgs: readonly [bigint, bigint, bigint, `0x${string}`, bigint, bigint, `0x${string}`] = [
        BigInt(auctionId),
        amountWei,
        onchainBefore.highestBidWei,
        onchainBefore.contractAddress,
        onchainBefore.tokenId,
        quantity,
        "0x" as `0x${string}`,
    ];

    if (dryRun && approvalNeeded) {
        return {
            profile: bidContext.profileName,
            chainId: bidContext.chain.chainId,
            command: "auction bid",
            environment: bidContext.environment,
            auction: {
                id: auctionId,
                gbmDiamond: bidContext.gbmDiamond,
                tokenContract: onchainBefore.contractAddress,
                tokenId: onchainBefore.tokenId.toString(),
                quantity: quantity.toString(),
                startBidPriceWei: startBidPriceWei.toString(),
                highestBidWei: onchainBefore.highestBidWei.toString(),
                highestBidder: onchainBefore.highestBidder,
                minBidWei: minimumBidWei.toString(),
            },
            preflight: {
                checks,
                signer: bidContext.signerAddress,
                ghstToken: bidContext.ghstToken,
                balanceWei: ghstBalanceWei.toString(),
                allowanceWei: allowanceWei.toString(),
                amountWei: amountWei.toString(),
            },
            ...(approval ? { approval } : {}),
            result: {
                status: "simulated",
                dryRun: true,
                skippedBidSimulation: true,
                reasonCode: "INSUFFICIENT_ALLOWANCE",
                reason: "Approval was simulated, so bid simulation is skipped in dry-run mode.",
                commitBidArgs: commitArgs,
            },
        };
    }

    const bidData = encodeFunctionData({
        abi: GBM_BID_WRITE_ABI,
        functionName: "commitBid",
        args: commitArgs,
    });

    const bidIntent: TxIntent = {
        idempotencyKey,
        profileName: bidContext.profileName,
        chainId: bidContext.chain.chainId,
        rpcUrl: bidContext.rpcUrl,
        signer: bidContext.signer,
        policy: bidContext.policy,
        to: bidContext.gbmDiamond,
        data: bidData,
        noncePolicy,
        nonce,
        waitForReceipt,
        dryRun,
        timeoutMs,
        command: "auction bid",
    };

    let bidResult: JsonValue;
    try {
        bidResult = await executeTxIntent(bidIntent, bidContext.chain);
    } catch (error: unknown) {
        if (error instanceof CliError) {
            throw mapSimulationError(error);
        }

        throw error;
    }

    return {
        profile: bidContext.profileName,
        chainId: bidContext.chain.chainId,
        command: "auction bid",
        environment: bidContext.environment,
        auction: {
            id: auctionId,
            gbmDiamond: bidContext.gbmDiamond,
            tokenContract: onchainBefore.contractAddress,
            tokenId: onchainBefore.tokenId.toString(),
            quantity: quantity.toString(),
            startBidPriceWei: startBidPriceWei.toString(),
            highestBidWei: onchainBefore.highestBidWei.toString(),
            highestBidder: onchainBefore.highestBidder,
            minBidWei: minimumBidWei.toString(),
        },
        preflight: {
            checks,
            signer: bidContext.signerAddress,
            ghstToken: bidContext.ghstToken,
            balanceWei: ghstBalanceWei.toString(),
            allowanceWei: allowanceWei.toString(),
            amountWei: amountWei.toString(),
        },
        ...(approval ? { approval } : {}),
        result: bidResult,
    };
}

export async function runAuctionBidCommand(ctx: CommandContext): Promise<JsonValue> {
    return runSingleBid(ctx);
}

export async function runAuctionBidUnbidCommand(ctx: CommandContext): Promise<JsonValue> {
    const amountWei = parseAmountWeiFromFlags(ctx.args.flags, {
        weiKey: "amount-wei",
        ghstKey: "amount-ghst",
        label: "Bid amount",
    });
    const maxTotalWei = parseAmountWeiFromFlags(ctx.args.flags, {
        weiKey: "max-total-wei",
        ghstKey: "max-total-ghst",
        label: "Max total bid amount",
    });

    if (maxTotalWei < amountWei) {
        throw new CliError("INVALID_ARGUMENT", "max total amount must be greater than or equal to amount per auction.", 2, {
            amountWei: amountWei.toString(),
            maxTotalWei: maxTotalWei.toString(),
        });
    }

    const first = parseBoundedIntFlag(getFlagString(ctx.args.flags, "first"), "--first", BATCH_DEFAULT_FIRST, 1, BATCH_MAX_FIRST);
    const skip = parseBoundedIntFlag(getFlagString(ctx.args.flags, "skip"), "--skip", 0, 0, 100000);

    const now = Math.floor(Date.now() / 1000).toString();
    const response = await executeSubgraphQuery<{ auctions: unknown }>({
        source: "gbm-base",
        queryName: "auction.bid-unbid.active",
        query: GBM_ACTIVE_AUCTIONS_QUERY,
        variables: {
            now,
            first,
            skip,
        },
    });

    if (!Array.isArray(response.data.auctions)) {
        throw new CliError("SUBGRAPH_INVALID_RESPONSE", "Expected auctions to be an array.", 2, {
            source: response.source,
            endpoint: response.endpoint,
            queryName: response.queryName,
        });
    }

    const activeAuctions = normalizeGbmAuctions(response.data.auctions);
    const skipped: Array<Record<string, JsonValue>> = [];
    const selected: string[] = [];
    let plannedTotalWei = 0n;

    for (const auction of activeAuctions) {
        const auctionId = auction.id;
        const highestBidWei = parseNonNegativeBigint(auction.highestBid, "highestBid");
        const startBidWei = parseNonNegativeBigint(auction.startBidPrice || "0", "startBidPrice");
        const highestBidder = auction.highestBidder || ZERO_ADDRESS;
        const unbid = highestBidWei === 0n && highestBidder === ZERO_ADDRESS;

        if (!unbid) {
            skipped.push({
                auctionId,
                reasonCode: "NOT_UNBID",
                reason: "Auction already has a highest bid.",
                highestBidWei: highestBidWei.toString(),
                highestBidder,
            });
            continue;
        }

        if (startBidWei > amountWei) {
            skipped.push({
                auctionId,
                reasonCode: "START_BID_ABOVE_AMOUNT",
                reason: "Auction start bid is above the configured amount.",
                startBidWei: startBidWei.toString(),
                amountWei: amountWei.toString(),
            });
            continue;
        }

        if (plannedTotalWei + amountWei > maxTotalWei) {
            skipped.push({
                auctionId,
                reasonCode: "MAX_TOTAL_REACHED",
                reason: "Adding this auction would exceed max total amount.",
                plannedTotalWei: plannedTotalWei.toString(),
                maxTotalWei: maxTotalWei.toString(),
            });
            continue;
        }

        selected.push(auctionId);
        plannedTotalWei += amountWei;
    }

    const baseIdempotencyKey = getFlagString(ctx.args.flags, "idempotency-key");
    const results: Array<Record<string, JsonValue>> = [];

    for (const auctionId of selected) {
        const stepFlags: Record<string, FlagValue> = { ...ctx.args.flags };
        delete stepFlags["amount-ghst"];
        delete stepFlags["max-total-ghst"];
        delete stepFlags["max-total-wei"];
        delete stepFlags.first;
        delete stepFlags.skip;
        stepFlags["auction-id"] = auctionId;
        stepFlags["amount-wei"] = amountWei.toString();
        stepFlags["require-unbid"] = true;
        stepFlags["expected-highest-bid-wei"] = "0";
        stepFlags["idempotency-key"] = parseBatchIdempotencyKey(baseIdempotencyKey, auctionId, amountWei);

        const stepCtx: CommandContext = {
            commandPath: ["auction", "bid"],
            args: {
                positionals: ["auction", "bid"],
                flags: stepFlags,
            },
            globals: ctx.globals,
        };

        try {
            const result = await runSingleBid(stepCtx, {
                forceAuctionId: auctionId,
                forceAmountWei: amountWei,
                forceExpectedHighestBidWei: 0n,
                forceRequireUnbid: true,
                forceIdempotencyKey: parseBatchIdempotencyKey(baseIdempotencyKey, auctionId, amountWei),
            });
            results.push({
                auctionId,
                status: "ok",
                result,
            });
        } catch (error: unknown) {
            if (error instanceof CliError) {
                results.push({
                    auctionId,
                    status: "error",
                    code: error.code,
                    message: error.message,
                    details: error.details || null,
                });
                continue;
            }

            throw error;
        }
    }

    const okCount = results.filter((result) => result.status === "ok").length;
    const errorCount = results.length - okCount;

    return {
        command: "auction bid-unbid",
        amountWei: amountWei.toString(),
        maxTotalWei: maxTotalWei.toString(),
        atTime: now,
        scanned: activeAuctions.length,
        selected: selected.length,
        plannedTotalWei: plannedTotalWei.toString(),
        summary: {
            success: okCount,
            error: errorCount,
            skipped: skipped.length,
        },
        skipped,
        results,
    };
}
