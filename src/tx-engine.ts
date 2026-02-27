import { randomUUID } from "crypto";

import { type PublicClient } from "viem";

import { toViemChain, type ResolvedChain } from "./chains";
import { resolveJournalPath } from "./config";
import { CliError } from "./errors";
import { resolveIdempotencyKey } from "./idempotency";
import { JournalStore } from "./journal";
import { enforcePolicy } from "./policy";
import { runRpcPreflight } from "./rpc";
import { resolveSignerRuntime } from "./signer";
import { JournalEntry, TxExecutionResult, TxIntent } from "./types";

interface ExecutionContext {
    client: PublicClient;
    journal: JournalStore;
    idempotencyKey: string;
    existing?: JournalEntry;
}

function toHexData(data?: `0x${string}`): `0x${string}` {
    return (data || "0x") as `0x${string}`;
}

function formatReceipt(receipt: {
    blockNumber: bigint;
    gasUsed: bigint;
    status: "success" | "reverted";
}): TxExecutionResult["receipt"] {
    return {
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
        status: receipt.status,
    };
}

function mapJournalToResult(entry: JournalEntry): TxExecutionResult {
    const receipt = entry.receiptJson ? (JSON.parse(entry.receiptJson) as TxExecutionResult["receipt"]) : undefined;

    return {
        idempotencyKey: entry.idempotencyKey,
        txHash: entry.txHash as `0x${string}`,
        from: entry.fromAddress as `0x${string}`,
        to: entry.toAddress as `0x${string}`,
        nonce: entry.nonce,
        gasLimit: entry.gasLimit,
        maxFeePerGasWei: entry.maxFeePerGasWei || undefined,
        maxPriorityFeePerGasWei: entry.maxPriorityFeePerGasWei || undefined,
        status: entry.status === "confirmed" ? "confirmed" : "submitted",
        receipt,
    };
}

async function resolveNonce(intent: TxIntent, ctx: ExecutionContext, address: `0x${string}`): Promise<number> {
    if (intent.noncePolicy === "manual") {
        if (intent.nonce === undefined) {
            throw new CliError("MISSING_NONCE", "nonce-policy manual requires --nonce.", 2);
        }

        return intent.nonce;
    }

    if (intent.noncePolicy === "replace" && ctx.existing && ctx.existing.nonce >= 0) {
        return ctx.existing.nonce;
    }

    const pendingNonce = await ctx.client.getTransactionCount({
        address,
        blockTag: "pending",
    });

    return pendingNonce;
}

async function waitForConfirmation(
    intent: TxIntent,
    ctx: ExecutionContext,
    txHash: `0x${string}`,
): Promise<TxExecutionResult["receipt"]> {
    const receipt = await ctx.client.waitForTransactionReceipt({
        hash: txHash,
        timeout: intent.timeoutMs,
    });

    const summary = {
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        status: receipt.status,
    };

    const formatted = formatReceipt(summary);
    ctx.journal.markConfirmed(ctx.idempotencyKey, JSON.stringify(formatted));

    return formatted;
}

export async function executeTxIntent(intent: TxIntent, chain: ResolvedChain, customHome?: string): Promise<TxExecutionResult> {
    const idempotencyKey = resolveIdempotencyKey(intent);
    const journal = new JournalStore(resolveJournalPath(customHome));

    try {
        const preflight = await runRpcPreflight(chain, intent.rpcUrl);
        const existing = journal.getByIdempotencyKey(idempotencyKey);

        if (existing && existing.status === "confirmed") {
            return mapJournalToResult(existing);
        }

        if (existing && existing.status === "submitted" && existing.txHash) {
            if (!intent.waitForReceipt) {
                return mapJournalToResult(existing);
            }

            const receipt = await waitForConfirmation(intent, { client: preflight.client, journal, idempotencyKey, existing }, existing.txHash as `0x${string}`);
            return {
                ...mapJournalToResult(existing),
                status: "confirmed",
                receipt,
            };
        }

        const viemChain = toViemChain(chain, intent.rpcUrl);
        const signerRuntime = await resolveSignerRuntime(intent.signer, preflight.client, intent.rpcUrl, viemChain, customHome);

        if (!signerRuntime.summary.canSign || !signerRuntime.sendTransaction || !signerRuntime.summary.address) {
            throw new CliError("READONLY_SIGNER", "Selected signer cannot submit transactions.", 2, {
                signerType: signerRuntime.summary.signerType,
                backendStatus: signerRuntime.summary.backendStatus,
            });
        }

        const fromAddress = signerRuntime.summary.address;
        const toAddress = intent.to;
        const dataHex = toHexData(intent.data);

        // Preflight simulation catches most runtime reverts before submit.
        try {
            await preflight.client.call({
                account: fromAddress,
                to: toAddress,
                data: dataHex,
                value: intent.valueWei,
            });
        } catch (error) {
            throw new CliError("SIMULATION_REVERT", "Transaction simulation reverted.", 2, {
                message: error instanceof Error ? error.message : String(error),
            });
        }

        const gasLimit = await preflight.client.estimateGas({
            account: fromAddress,
            to: toAddress,
            data: dataHex,
            value: intent.valueWei,
        });

        const feeEstimate = await preflight.client.estimateFeesPerGas();
        const maxFeePerGas = feeEstimate.maxFeePerGas;
        const maxPriorityFeePerGas = feeEstimate.maxPriorityFeePerGas;

        const balanceWei = await preflight.client.getBalance({ address: fromAddress });
        const requiredWei = (intent.valueWei || 0n) + gasLimit * (maxFeePerGas || 0n);
        if (balanceWei < requiredWei) {
            throw new CliError("INSUFFICIENT_FUNDS_PRECHECK", "Account balance is below estimated transaction requirement.", 2, {
                from: fromAddress,
                balanceWei: balanceWei.toString(),
                requiredWei: requiredWei.toString(),
            });
        }

        enforcePolicy({
            policy: intent.policy,
            to: toAddress,
            valueWei: intent.valueWei,
            gasLimit,
            maxFeePerGasWei: maxFeePerGas,
            maxPriorityFeePerGasWei: maxPriorityFeePerGas,
        });

        const ctx: ExecutionContext = {
            client: preflight.client,
            journal,
            idempotencyKey,
            existing,
        };

        const nonce = await resolveNonce(intent, ctx, fromAddress);

        journal.upsertPrepared({
            idempotencyKey,
            profileName: intent.profileName,
            chainId: intent.chainId,
            command: intent.command,
            toAddress,
            fromAddress,
            valueWei: intent.valueWei?.toString() || "0",
            dataHex,
            nonce,
            gasLimit: gasLimit.toString(),
            maxFeePerGasWei: maxFeePerGas?.toString() || "",
            maxPriorityFeePerGasWei: maxPriorityFeePerGas?.toString() || "",
            status: "prepared",
        });

        const txHash = await signerRuntime.sendTransaction({
            chain: viemChain,
            to: toAddress,
            data: dataHex,
            value: intent.valueWei,
            gas: gasLimit,
            nonce,
            ...(maxFeePerGas ? { maxFeePerGas } : {}),
            ...(maxPriorityFeePerGas ? { maxPriorityFeePerGas } : {}),
        });

        journal.markSubmitted({
            idempotencyKey,
            txHash,
            status: "submitted",
            errorCode: "",
            errorMessage: "",
        });

        if (!intent.waitForReceipt) {
            return {
                idempotencyKey,
                txHash,
                from: fromAddress,
                to: toAddress,
                nonce,
                gasLimit: gasLimit.toString(),
                maxFeePerGasWei: maxFeePerGas?.toString(),
                maxPriorityFeePerGasWei: maxPriorityFeePerGas?.toString(),
                status: "submitted",
            };
        }

        const receipt = await waitForConfirmation(intent, ctx, txHash);

        return {
            idempotencyKey,
            txHash,
            from: fromAddress,
            to: toAddress,
            nonce,
            gasLimit: gasLimit.toString(),
            maxFeePerGasWei: maxFeePerGas?.toString(),
            maxPriorityFeePerGasWei: maxPriorityFeePerGas?.toString(),
            status: "confirmed",
            receipt,
        };
    } catch (error) {
        if (error instanceof CliError) {
            journal.markFailed(idempotencyKey, error.code, error.message);
            throw error;
        }

        const unknown = new CliError("TX_EXECUTION_FAILED", "Transaction execution failed.", 1, {
            correlationId: randomUUID(),
            message: error instanceof Error ? error.message : String(error),
        });
        journal.markFailed(idempotencyKey, unknown.code, unknown.message);
        throw unknown;
    } finally {
        journal.close();
    }
}

export function getJournalEntryByIdempotency(idempotencyKey: string, customHome?: string): JournalEntry | undefined {
    const journal = new JournalStore(resolveJournalPath(customHome));
    try {
        return journal.getByIdempotencyKey(idempotencyKey);
    } finally {
        journal.close();
    }
}

export function getJournalEntryByHash(txHash: string, customHome?: string): JournalEntry | undefined {
    const journal = new JournalStore(resolveJournalPath(customHome));
    try {
        return journal.getByTxHash(txHash);
    } finally {
        journal.close();
    }
}

export function getRecentJournalEntries(limit = 20, customHome?: string): JournalEntry[] {
    const journal = new JournalStore(resolveJournalPath(customHome));
    try {
        return journal.listRecent(limit);
    } finally {
        journal.close();
    }
}

export async function resumeTransaction(
    idempotencyKey: string,
    chain: ResolvedChain,
    rpcUrl: string,
    timeoutMs = 120000,
    customHome?: string,
): Promise<TxExecutionResult> {
    const journal = new JournalStore(resolveJournalPath(customHome));

    try {
        const entry = journal.getByIdempotencyKey(idempotencyKey);
        if (!entry) {
            throw new CliError("TX_NOT_FOUND", `No transaction found for idempotency key '${idempotencyKey}'.`, 2);
        }

        if (!entry.txHash) {
            throw new CliError("TX_NOT_FOUND", `Transaction '${idempotencyKey}' has no submitted hash yet.`, 2);
        }

        if (entry.status === "confirmed") {
            return mapJournalToResult(entry);
        }

        const preflight = await runRpcPreflight(chain, rpcUrl);
        const receipt = await preflight.client.waitForTransactionReceipt({
            hash: entry.txHash as `0x${string}`,
            timeout: timeoutMs,
        });

        const receiptSummary = formatReceipt({
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed,
            status: receipt.status,
        });

        journal.markConfirmed(idempotencyKey, JSON.stringify(receiptSummary));

        return {
            ...mapJournalToResult(entry),
            status: "confirmed",
            receipt: receiptSummary,
        };
    } finally {
        journal.close();
    }
}
