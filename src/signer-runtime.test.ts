import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { base } from "viem/chains";

import { parseSigner, resolveSignerRuntime } from "./signer";

function fakePublicClient() {
    return {
        getTransactionCount: vi.fn(async () => 7),
        getBalance: vi.fn(async () => 123456789n),
        sendRawTransaction: vi.fn(async () => "0x" + "b".repeat(64)),
    } as any;
}

const tempFiles: string[] = [];

afterEach(() => {
    delete process.env.AGCLI_REMOTE_TOKEN;
    delete process.env.AGCLI_LEDGER_BRIDGE_CMD;
    delete process.env.BANKR_API_KEY;
    delete process.env.BANKR_TEST_KEY;

    for (const file of tempFiles.splice(0)) {
        fs.rmSync(file, { force: true });
    }

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("signer runtime", () => {
    it("supports remote signer returning txHash", async () => {
        process.env.AGCLI_REMOTE_TOKEN = "token-123";

        const fetchMock = vi.fn(async (_url: string) => ({
            ok: true,
            json: async () => ({ txHash: "0x" + "a".repeat(64) }),
        }));
        vi.stubGlobal("fetch", fetchMock);

        const signer = parseSigner(
            "remote:https://signer.example.com|0x0000000000000000000000000000000000000001|AGCLI_REMOTE_TOKEN",
        );

        const runtime = await resolveSignerRuntime(signer, fakePublicClient(), "https://mainnet.base.org", base);

        expect(runtime.summary.signerType).toBe("remote");
        expect(runtime.summary.canSign).toBe(true);
        expect(runtime.sendTransaction).toBeDefined();

        const hash = await runtime.sendTransaction!({
            chain: base,
            to: "0x0000000000000000000000000000000000000001",
            data: "0x",
            value: 0n,
            gas: 21000n,
            nonce: 1,
        });

        expect(hash).toBe("0x" + "a".repeat(64));
        expect(fetchMock).toHaveBeenCalled();
    });

    it("passes auth headers when resolving remote signer address", async () => {
        process.env.AGCLI_REMOTE_TOKEN = "token-123";

        const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
            if (url.endsWith("/address")) {
                expect((init?.headers as Record<string, string>).authorization).toBe("Bearer token-123");
                return {
                    ok: true,
                    json: async () => ({ address: "0x0000000000000000000000000000000000000001" }),
                };
            }

            expect((init?.headers as Record<string, string>).authorization).toBe("Bearer token-123");
            return {
                ok: true,
                json: async () => ({ txHash: "0x" + "d".repeat(64) }),
            };
        });
        vi.stubGlobal("fetch", fetchMock);

        const signer = parseSigner("remote:https://signer.example.com||AGCLI_REMOTE_TOKEN");
        const runtime = await resolveSignerRuntime(signer, fakePublicClient(), "https://mainnet.base.org", base);

        const hash = await runtime.sendTransaction!({
            chain: base,
            to: "0x0000000000000000000000000000000000000001",
            data: "0x",
            value: 0n,
            gas: 21000n,
            nonce: 1,
        });

        expect(hash).toBe("0x" + "d".repeat(64));
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("supports ledger bridge signer", async () => {
        const scriptPath = path.join(os.tmpdir(), `agcli-ledger-bridge-${Date.now()}-${Math.random()}.mjs`);
        tempFiles.push(scriptPath);

        fs.writeFileSync(
            scriptPath,
            [
                "#!/usr/bin/env node",
                "process.stdin.on('data', () => {});",
                `console.log(JSON.stringify({ txHash: '0x${"c".repeat(64)}' }));`,
            ].join("\n"),
            { encoding: "utf8", mode: 0o755 },
        );

        process.env.AGCLI_LEDGER_BRIDGE_CMD = `node ${scriptPath}`;

        const signer = parseSigner(
            "ledger:m/44'/60'/0'/0/0|0x0000000000000000000000000000000000000001|AGCLI_LEDGER_BRIDGE_CMD",
        );

        const runtime = await resolveSignerRuntime(signer, fakePublicClient(), "https://mainnet.base.org", base);

        expect(runtime.summary.signerType).toBe("ledger");
        expect(runtime.summary.canSign).toBe(true);

        const hash = await runtime.sendTransaction!({
            chain: base,
            to: "0x0000000000000000000000000000000000000001",
            data: "0x",
            value: 0n,
            gas: 21000n,
            nonce: 1,
        });

        expect(hash).toBe("0x" + "c".repeat(64));
    });

    it("supports bankr signer with wallet auto-discovery", async () => {
        process.env.BANKR_API_KEY = "bankr-token";

        const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
            if (url.endsWith("/agent/me")) {
                expect((init?.headers as Record<string, string>)["x-api-key"]).toBe("bankr-token");
                return {
                    ok: true,
                    text: async () => JSON.stringify({ walletAddress: "0x0000000000000000000000000000000000000001" }),
                };
            }

            expect(url.endsWith("/agent/submit")).toBe(true);
            expect((init?.headers as Record<string, string>)["x-api-key"]).toBe("bankr-token");
            const body = JSON.parse(String(init?.body));
            expect(body.waitForConfirmation).toBe(false);
            expect(body.transaction.to).toBe("0x0000000000000000000000000000000000000001");
            return {
                ok: true,
                text: async () => JSON.stringify({ transactionHash: "0x" + "e".repeat(64) }),
            };
        });
        vi.stubGlobal("fetch", fetchMock);

        const signer = parseSigner("bankr");
        const runtime = await resolveSignerRuntime(signer, fakePublicClient(), "https://mainnet.base.org", base);

        expect(runtime.summary.signerType).toBe("bankr");
        expect(runtime.summary.address).toBe("0x0000000000000000000000000000000000000001");
        expect(runtime.summary.canSign).toBe(true);

        const hash = await runtime.sendTransaction!({
            chain: base,
            to: "0x0000000000000000000000000000000000000001",
            data: "0x",
            value: 0n,
            gas: 21000n,
            nonce: 1,
        });

        expect(hash).toBe("0x" + "e".repeat(64));
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("supports bankr signer with explicit address and custom api key env var", async () => {
        process.env.BANKR_TEST_KEY = "bankr-token";

        const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
            expect(url).toBe("https://api.bankr.bot/agent/submit");
            expect((init?.headers as Record<string, string>)["x-api-key"]).toBe("bankr-token");
            return {
                ok: true,
                text: async () => JSON.stringify({ txHash: "0x" + "f".repeat(64) }),
            };
        });
        vi.stubGlobal("fetch", fetchMock);

        const signer = parseSigner(
            "bankr:0x0000000000000000000000000000000000000001|BANKR_TEST_KEY|https://api.bankr.bot",
        );
        const runtime = await resolveSignerRuntime(signer, fakePublicClient(), "https://mainnet.base.org", base);

        const hash = await runtime.sendTransaction!({
            chain: base,
            to: "0x0000000000000000000000000000000000000001",
            data: "0x",
            value: 0n,
            gas: 21000n,
            nonce: 1,
        });

        expect(hash).toBe("0x" + "f".repeat(64));
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
