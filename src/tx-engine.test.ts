import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveChain } from "./chains";
import { TxIntent } from "./types";

const { runRpcPreflightMock, resolveSignerRuntimeMock, enforcePolicyMock, sendTransactionMock } = vi.hoisted(() => ({
    runRpcPreflightMock: vi.fn(),
    resolveSignerRuntimeMock: vi.fn(),
    enforcePolicyMock: vi.fn(),
    sendTransactionMock: vi.fn(),
}));

vi.mock("./rpc", () => ({
    runRpcPreflight: runRpcPreflightMock,
}));

vi.mock("./signer", () => ({
    resolveSignerRuntime: resolveSignerRuntimeMock,
}));

vi.mock("./policy", () => ({
    enforcePolicy: enforcePolicyMock,
}));

import { executeTxIntent, getRecentJournalEntries } from "./tx-engine";

const homes: string[] = [];

function createHome(): string {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "agcli-tx-engine-test-"));
    homes.push(home);
    return home;
}

function buildIntent(overrides: Partial<TxIntent> = {}): TxIntent {
    return {
        profileName: "smoke",
        chainId: 8453,
        rpcUrl: "https://mainnet.base.org",
        signer: { type: "readonly" },
        policy: {
            name: "default",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
        },
        to: "0x1111111111111111111111111111111111111111",
        data: "0x",
        valueWei: 1n,
        noncePolicy: "safe",
        waitForReceipt: false,
        timeoutMs: 120000,
        command: "tx send",
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();

    runRpcPreflightMock.mockResolvedValue({
        chainId: 8453,
        blockNumber: "1",
        chainName: "Base",
        client: {
            call: vi.fn(async () => ({ data: "0x" })),
            estimateGas: vi.fn(async () => 21000n),
            estimateFeesPerGas: vi.fn(async () => ({
                maxFeePerGas: 1n,
                maxPriorityFeePerGas: 1n,
            })),
            getBalance: vi.fn(async () => 0n),
            getTransactionCount: vi.fn(async () => 7),
        },
    });

    sendTransactionMock.mockResolvedValue("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");

    resolveSignerRuntimeMock.mockResolvedValue({
        summary: {
            signerType: "readonly",
            address: "0x2222222222222222222222222222222222222222",
            canSign: false,
            backendStatus: "ready",
        },
        sendTransaction: sendTransactionMock,
    });
});

afterEach(() => {
    for (const home of homes.splice(0)) {
        fs.rmSync(home, { recursive: true, force: true });
    }
});

describe("tx engine dry-run", () => {
    it("simulates and skips submit/journal writes", async () => {
        const home = createHome();
        const result = await executeTxIntent(buildIntent({ dryRun: true }), resolveChain("base"), home);

        expect(result.status).toBe("simulated");
        expect(result.dryRun).toBe(true);
        expect(result.txHash).toBeUndefined();
        expect(result.nonce).toBe(7);
        expect(result.simulation).toMatchObject({
            requiredWei: "21001",
            balanceWei: "0",
            signerCanSign: false,
            noncePolicy: "safe",
        });

        expect(sendTransactionMock).not.toHaveBeenCalled();
        expect(enforcePolicyMock).toHaveBeenCalledTimes(1);
        expect(getRecentJournalEntries(20, home)).toEqual([]);
    });

    it("still requires signer address for dry-run", async () => {
        const home = createHome();
        resolveSignerRuntimeMock.mockResolvedValueOnce({
            summary: {
                signerType: "readonly",
                canSign: false,
                backendStatus: "ready",
            },
        });

        await expect(executeTxIntent(buildIntent({ dryRun: true }), resolveChain("base"), home)).rejects.toMatchObject({
            code: "MISSING_SIGNER_ADDRESS",
        });
    });

    it("requires sign-capable backend when dry-run is disabled", async () => {
        const home = createHome();

        await expect(executeTxIntent(buildIntent({ dryRun: false }), resolveChain("base"), home)).rejects.toMatchObject({
            code: "READONLY_SIGNER",
        });

        expect(sendTransactionMock).not.toHaveBeenCalled();
    });
});
