import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseAbi } from "viem";

import { CommandContext } from "../types";

const {
    loadConfigMock,
    getProfileOrThrowMock,
    getPolicyOrThrowMock,
    resolveChainMock,
    resolveRpcUrlMock,
    executeTxIntentMock,
} = vi.hoisted(() => ({
    loadConfigMock: vi.fn(),
    getProfileOrThrowMock: vi.fn(),
    getPolicyOrThrowMock: vi.fn(),
    resolveChainMock: vi.fn(),
    resolveRpcUrlMock: vi.fn(),
    executeTxIntentMock: vi.fn(),
}));

vi.mock("../config", () => ({
    loadConfig: loadConfigMock,
    getProfileOrThrow: getProfileOrThrowMock,
    getPolicyOrThrow: getPolicyOrThrowMock,
}));

vi.mock("../chains", () => ({
    resolveChain: resolveChainMock,
    resolveRpcUrl: resolveRpcUrlMock,
}));

vi.mock("../tx-engine", () => ({
    executeTxIntent: executeTxIntentMock,
}));

import { runOnchainSendCommand, runOnchainSendWithFunction } from "./onchain";
import { runTxSendCommand } from "./tx";

const files: string[] = [];

function writeAbiFile(contents: string): string {
    const filePath = path.join(os.tmpdir(), `agcli-write-dryrun-${Date.now()}-${Math.random()}.json`);
    fs.writeFileSync(filePath, contents, "utf8");
    files.push(filePath);
    return filePath;
}

function createContext(positionals: string[], flags: Record<string, string | boolean>): CommandContext {
    return {
        commandPath: positionals,
        args: {
            positionals,
            flags,
        },
        globals: {
            mode: "agent",
            json: true,
            yes: true,
            profile: "prod",
        },
    };
}

beforeEach(() => {
    vi.clearAllMocks();

    loadConfigMock.mockReturnValue({});
    getProfileOrThrowMock.mockReturnValue({
        name: "prod",
        chain: "base",
        chainId: 8453,
        rpcUrl: "https://mainnet.base.org",
        signer: { type: "env", envVar: "AGCLI_PRIVATE_KEY" },
        policy: "default",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    });
    getPolicyOrThrowMock.mockReturnValue({
        name: "default",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    });
    resolveChainMock.mockReturnValue({
        key: "base",
        chainId: 8453,
        defaultRpcUrl: "https://mainnet.base.org",
    });
    resolveRpcUrlMock.mockReturnValue("https://mainnet.base.org");
    executeTxIntentMock.mockResolvedValue({
        status: "simulated",
        from: "0x2222222222222222222222222222222222222222",
        to: "0x1111111111111111111111111111111111111111",
        nonce: 1,
        gasLimit: "21000",
        dryRun: true,
    });
});

afterEach(() => {
    for (const filePath of files.splice(0)) {
        fs.rmSync(filePath, { force: true });
    }
});

describe("write command dry-run flags", () => {
    it("passes --dry-run through tx send", async () => {
        await runTxSendCommand(
            createContext(["tx", "send"], {
                to: "0x1111111111111111111111111111111111111111",
                "value-wei": "0",
                "dry-run": true,
            }),
        );

        expect(executeTxIntentMock).toHaveBeenCalledWith(
            expect.objectContaining({
                command: "tx send",
                dryRun: true,
                waitForReceipt: false,
            }),
            expect.objectContaining({ chainId: 8453 }),
        );
    });

    it("rejects --dry-run with --wait/--confirm on tx send", async () => {
        await expect(
            runTxSendCommand(
                createContext(["tx", "send"], {
                    to: "0x1111111111111111111111111111111111111111",
                    "dry-run": true,
                    wait: true,
                }),
            ),
        ).rejects.toMatchObject({
            code: "INVALID_ARGUMENT",
        });

        await expect(
            runTxSendCommand(
                createContext(["tx", "send"], {
                    to: "0x1111111111111111111111111111111111111111",
                    "dry-run": true,
                    confirm: true,
                }),
            ),
        ).rejects.toMatchObject({
            code: "INVALID_ARGUMENT",
        });
    });

    it("passes --dry-run through onchain send", async () => {
        const abiFile = writeAbiFile(
            JSON.stringify([
                {
                    type: "function",
                    name: "approve",
                    stateMutability: "nonpayable",
                    inputs: [
                        { name: "spender", type: "address" },
                        { name: "amount", type: "uint256" },
                    ],
                    outputs: [{ name: "", type: "bool" }],
                },
            ]),
        );

        await runOnchainSendCommand(
            createContext(["onchain", "send"], {
                "abi-file": abiFile,
                address: "0xcd2f22236dd9dfe2356d7c543161d4d260fd9bcb",
                function: "approve",
                "args-json": '["0x1111111111111111111111111111111111111111", "1"]',
                "dry-run": true,
            }),
        );

        expect(executeTxIntentMock).toHaveBeenCalledWith(
            expect.objectContaining({
                command: "onchain send approve",
                dryRun: true,
                waitForReceipt: false,
            }),
            expect.objectContaining({ chainId: 8453 }),
        );
    });

    it("accepts mapped defaults when --abi-file and --address are omitted", async () => {
        const result = await runOnchainSendWithFunction(
            createContext(["auction", "bid"], {
                "args-json": '["1","1","1","0x1111111111111111111111111111111111111111","1","1","0x"]',
                "dry-run": true,
            }),
            "commitBid",
            "auction bid",
            {
                abi: parseAbi(["function commitBid(uint256,uint256,uint256,address,uint256,uint256,bytes)"]),
                address: "0x80320a0000c7a6a34086e2acad6915ff57ffda31",
                source: "base.gbm-diamond",
            },
        );

        expect(executeTxIntentMock).toHaveBeenCalledWith(
            expect.objectContaining({
                command: "auction bid",
                to: "0x80320a0000c7a6a34086e2acad6915ff57ffda31",
                dryRun: true,
            }),
            expect.objectContaining({ chainId: 8453 }),
        );
        expect(
            result as {
                defaults: { abi: string; address: string; source: string };
            },
        ).toMatchObject({
            defaults: {
                abi: "mapped-default",
                address: "mapped-default",
                source: "base.gbm-diamond",
            },
        });
    });

    it("rejects --dry-run with --wait on onchain send", async () => {
        const abiFile = writeAbiFile(
            JSON.stringify([
                {
                    type: "function",
                    name: "approve",
                    stateMutability: "nonpayable",
                    inputs: [
                        { name: "spender", type: "address" },
                        { name: "amount", type: "uint256" },
                    ],
                    outputs: [{ name: "", type: "bool" }],
                },
            ]),
        );

        await expect(
            runOnchainSendCommand(
                createContext(["onchain", "send"], {
                    "abi-file": abiFile,
                    address: "0xcd2f22236dd9dfe2356d7c543161d4d260fd9bcb",
                    function: "approve",
                    "args-json": '["0x1111111111111111111111111111111111111111", "1"]',
                    "dry-run": true,
                    wait: true,
                }),
            ),
        ).rejects.toMatchObject({
            code: "INVALID_ARGUMENT",
        });
    });
});
