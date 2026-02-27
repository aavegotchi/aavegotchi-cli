import { spawnSync } from "child_process";

import { createWalletClient, http, type Chain, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { CliError } from "./errors";
import { keychainResolvePrivateKey } from "./keychain";
import { SignerConfig } from "./types";

const REMOTE_SIGN_ADDRESS_PATH = "/address";
const REMOTE_SIGN_TX_PATH = "/sign-transaction";

export interface SignerSendRequest {
    chain: Chain;
    to: `0x${string}`;
    data: `0x${string}`;
    value?: bigint;
    gas: bigint;
    nonce: number;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
}

export interface ResolvedSignerAccount {
    signerType: SignerConfig["type"];
    address?: `0x${string}`;
    nonce?: number;
    balanceWei?: string;
    canSign: boolean;
    backendStatus: "ready" | "unavailable";
}

export interface SignerRuntime {
    summary: ResolvedSignerAccount;
    sendTransaction?: (request: SignerSendRequest) => Promise<`0x${string}`>;
}

function parsePrivateKey(value: string, hint: string): `0x${string}` {
    if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
        throw new CliError("INVALID_PRIVATE_KEY", `${hint} is not a valid private key.`, 2);
    }

    return value as `0x${string}`;
}

function ensureAddress(value: string | undefined, hint: string): `0x${string}` {
    if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
        throw new CliError("INVALID_ARGUMENT", `${hint} must be a valid EVM address.`, 2, {
            value,
        });
    }

    return value.toLowerCase() as `0x${string}`;
}

function parseTxHash(value: unknown): `0x${string}` | undefined {
    if (typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value)) {
        return value as `0x${string}`;
    }

    return undefined;
}

function parseRawTx(value: unknown): `0x${string}` | undefined {
    if (typeof value === "string" && /^0x[a-fA-F0-9]+$/.test(value)) {
        return value as `0x${string}`;
    }

    return undefined;
}

function addDefaultPaths(url: string, pathSuffix: string): string {
    return `${url.replace(/\/+$/, "")}${pathSuffix}`;
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
    let response: Response;

    try {
        response = await fetch(url, init);
    } catch (error) {
        throw new CliError("REMOTE_SIGNER_UNREACHABLE", "Failed to connect to remote signer service.", 2, {
            url,
            message: error instanceof Error ? error.message : String(error),
        });
    }

    if (!response.ok) {
        throw new CliError("REMOTE_SIGNER_HTTP_ERROR", `Remote signer responded with HTTP ${response.status}.`, 2, {
            url,
            status: response.status,
        });
    }

    try {
        return (await response.json()) as unknown;
    } catch {
        throw new CliError("REMOTE_SIGNER_PROTOCOL_ERROR", "Remote signer did not return valid JSON.", 2, {
            url,
        });
    }
}

function buildRemoteHeaders(signer: Extract<SignerConfig, { type: "remote" }>): Record<string, string> {
    const headers: Record<string, string> = {
        "content-type": "application/json",
    };

    if (signer.authEnvVar) {
        const token = process.env[signer.authEnvVar];
        if (!token) {
            throw new CliError("MISSING_SIGNER_SECRET", `Missing environment variable '${signer.authEnvVar}'.`, 2);
        }

        headers.authorization = `Bearer ${token}`;
    }

    return headers;
}

async function resolveRemoteAddress(
    signer: Extract<SignerConfig, { type: "remote" }>,
    headers: Record<string, string>,
): Promise<`0x${string}`> {
    if (signer.address) {
        return ensureAddress(signer.address, "remote signer address");
    }

    const response = (await fetchJson(addDefaultPaths(signer.url, REMOTE_SIGN_ADDRESS_PATH), {
        method: "GET",
        headers,
    })) as { address?: string };

    return ensureAddress(response.address, "remote signer address response");
}

function runLedgerBridge(bridgeCommand: string, payload: object): unknown {
    const result = spawnSync(bridgeCommand, {
        shell: true,
        encoding: "utf8",
        input: JSON.stringify(payload),
    });

    if (result.error) {
        throw new CliError("LEDGER_BRIDGE_FAILED", "Ledger bridge execution failed.", 2, {
            message: result.error.message,
        });
    }

    if (result.status !== 0) {
        throw new CliError("LEDGER_BRIDGE_FAILED", "Ledger bridge returned non-zero exit code.", 2, {
            status: result.status,
            stderr: result.stderr,
        });
    }

    const stdout = result.stdout.trim();
    if (!stdout) {
        throw new CliError("LEDGER_BRIDGE_FAILED", "Ledger bridge returned empty output.", 2);
    }

    try {
        return JSON.parse(stdout);
    } catch {
        throw new CliError("LEDGER_BRIDGE_FAILED", "Ledger bridge output was not valid JSON.", 2, {
            stdout,
        });
    }
}

async function resolveBalanceSummary(
    signerType: SignerConfig["type"],
    publicClient: PublicClient,
    address: `0x${string}`,
): Promise<ResolvedSignerAccount> {
    const [nonce, balance] = await Promise.all([
        publicClient.getTransactionCount({ address, blockTag: "pending" }),
        publicClient.getBalance({ address }),
    ]);

    return {
        signerType,
        address,
        nonce,
        balanceWei: balance.toString(),
        canSign: true,
        backendStatus: "ready",
    };
}

function parseSignerRemoteSpec(value: string): Extract<SignerConfig, { type: "remote" }> {
    const body = value.slice("remote:".length).trim();
    const [urlPart, addressPart, authPart] = body.split("|").map((entry) => entry.trim());

    if (!/^https?:\/\//i.test(urlPart || "")) {
        throw new CliError("INVALID_SIGNER_SPEC", `Invalid remote signer format '${value}'.`, 2);
    }

    const signer: Extract<SignerConfig, { type: "remote" }> = {
        type: "remote",
        url: urlPart,
    };

    if (addressPart) {
        signer.address = ensureAddress(addressPart, "remote signer address");
    }

    if (authPart) {
        if (!/^[A-Z_][A-Z0-9_]*$/.test(authPart)) {
            throw new CliError("INVALID_SIGNER_SPEC", `Invalid remote signer auth env var in '${value}'.`, 2);
        }

        signer.authEnvVar = authPart;
    }

    return signer;
}

function parseSignerLedgerSpec(value: string): Extract<SignerConfig, { type: "ledger" }> {
    if (value === "ledger") {
        return { type: "ledger" };
    }

    const body = value.slice("ledger:".length);
    const [derivationPath, addressPart, bridgeEnvPart] = body.split("|").map((entry) => entry.trim());

    const signer: Extract<SignerConfig, { type: "ledger" }> = {
        type: "ledger",
    };

    if (derivationPath) {
        signer.derivationPath = derivationPath;
    }

    if (addressPart) {
        signer.address = ensureAddress(addressPart, "ledger signer address");
    }

    if (bridgeEnvPart) {
        if (!/^[A-Z_][A-Z0-9_]*$/.test(bridgeEnvPart)) {
            throw new CliError("INVALID_SIGNER_SPEC", `Invalid ledger bridge env var in '${value}'.`, 2);
        }

        signer.bridgeCommandEnvVar = bridgeEnvPart;
    }

    return signer;
}

export function parseSigner(value?: string): SignerConfig {
    if (!value || value === "readonly") {
        return { type: "readonly" };
    }

    if (value.startsWith("env:")) {
        const envVar = value.slice(4);
        if (!/^[A-Z_][A-Z0-9_]*$/.test(envVar)) {
            throw new CliError("INVALID_SIGNER_SPEC", `Invalid env signer format '${value}'.`, 2);
        }

        return {
            type: "env",
            envVar,
        };
    }

    if (value.startsWith("keychain:")) {
        const accountId = value.slice("keychain:".length).trim();
        if (!accountId) {
            throw new CliError("INVALID_SIGNER_SPEC", `Invalid keychain signer format '${value}'.`, 2);
        }

        return {
            type: "keychain",
            accountId,
        };
    }

    if (value === "ledger" || value.startsWith("ledger:")) {
        return parseSignerLedgerSpec(value);
    }

    if (value.startsWith("remote:")) {
        return parseSignerRemoteSpec(value);
    }

    throw new CliError(
        "INVALID_SIGNER_SPEC",
        `Unsupported signer '${value}'. Use readonly, env:<ENV_VAR>, keychain:<id>, ledger[:path|address|bridgeEnv], or remote:<url|address|authEnv>.`,
        2,
    );
}

export async function resolveSignerRuntime(
    signer: SignerConfig,
    publicClient: PublicClient,
    rpcUrl: string,
    chain: Chain,
    customHome?: string,
): Promise<SignerRuntime> {
    if (signer.type === "readonly") {
        return {
            summary: {
                signerType: "readonly",
                canSign: false,
                backendStatus: "ready",
            },
        };
    }

    if (signer.type === "env") {
        const privateKeyRaw = process.env[signer.envVar];
        if (!privateKeyRaw) {
            throw new CliError("MISSING_SIGNER_SECRET", `Missing environment variable '${signer.envVar}'.`, 2);
        }

        const privateKey = parsePrivateKey(privateKeyRaw, `Environment variable '${signer.envVar}'`);
        const account = privateKeyToAccount(privateKey);

        const walletClient = createWalletClient({
            account,
            chain,
            transport: http(rpcUrl),
        });

        const summary = await resolveBalanceSummary("env", publicClient, account.address);

        return {
            summary,
            sendTransaction: async (request) =>
                walletClient.sendTransaction({
                    account,
                    chain: request.chain,
                    to: request.to,
                    data: request.data,
                    value: request.value,
                    gas: request.gas,
                    nonce: request.nonce,
                    ...(request.maxFeePerGas ? { maxFeePerGas: request.maxFeePerGas } : {}),
                    ...(request.maxPriorityFeePerGas ? { maxPriorityFeePerGas: request.maxPriorityFeePerGas } : {}),
                }),
        };
    }

    if (signer.type === "keychain") {
        const resolved = keychainResolvePrivateKey(signer.accountId, customHome);
        const account = privateKeyToAccount(resolved.privateKey);

        const walletClient = createWalletClient({
            account,
            chain,
            transport: http(rpcUrl),
        });

        const summary = await resolveBalanceSummary("keychain", publicClient, account.address);

        return {
            summary,
            sendTransaction: async (request) =>
                walletClient.sendTransaction({
                    account,
                    chain: request.chain,
                    to: request.to,
                    data: request.data,
                    value: request.value,
                    gas: request.gas,
                    nonce: request.nonce,
                    ...(request.maxFeePerGas ? { maxFeePerGas: request.maxFeePerGas } : {}),
                    ...(request.maxPriorityFeePerGas ? { maxPriorityFeePerGas: request.maxPriorityFeePerGas } : {}),
                }),
        };
    }

    if (signer.type === "remote") {
        const headers = buildRemoteHeaders(signer);
        const address = await resolveRemoteAddress(signer, headers);
        const summary = await resolveBalanceSummary("remote", publicClient, address);

        return {
            summary,
            sendTransaction: async (request) => {
                const payload = {
                    chainId: request.chain.id,
                    tx: {
                        to: request.to,
                        data: request.data,
                        valueWei: request.value?.toString() || "0",
                        gas: request.gas.toString(),
                        nonce: request.nonce,
                        maxFeePerGasWei: request.maxFeePerGas?.toString(),
                        maxPriorityFeePerGasWei: request.maxPriorityFeePerGas?.toString(),
                    },
                };

                const response = (await fetchJson(addDefaultPaths(signer.url, REMOTE_SIGN_TX_PATH), {
                    method: "POST",
                    headers,
                    body: JSON.stringify(payload),
                })) as { rawTransaction?: string; signedTransaction?: string; txHash?: string };

                const txHash = parseTxHash(response.txHash);
                if (txHash) {
                    return txHash;
                }

                const rawTransaction = parseRawTx(response.rawTransaction) || parseRawTx(response.signedTransaction);
                if (rawTransaction) {
                    return publicClient.sendRawTransaction({
                        serializedTransaction: rawTransaction,
                    });
                }

                throw new CliError("REMOTE_SIGNER_PROTOCOL_ERROR", "Remote signer response missing txHash/rawTransaction.", 2);
            },
        };
    }

    const bridgeEnvVar = signer.bridgeCommandEnvVar || "AGCLI_LEDGER_BRIDGE_CMD";
    const bridgeCommand = process.env[bridgeEnvVar];
    if (!bridgeCommand) {
        throw new CliError("SIGNER_BACKEND_UNAVAILABLE", `Set ${bridgeEnvVar} for ledger signer bridge command.`, 2);
    }

    const ledgerAddress = ensureAddress(signer.address || process.env.AGCLI_LEDGER_ADDRESS, "ledger signer address");
    const summary = await resolveBalanceSummary("ledger", publicClient, ledgerAddress);

    return {
        summary,
        sendTransaction: async (request) => {
            const payload = {
                chainId: request.chain.id,
                derivationPath: signer.derivationPath,
                from: ledgerAddress,
                tx: {
                    to: request.to,
                    data: request.data,
                    valueWei: request.value?.toString() || "0",
                    gas: request.gas.toString(),
                    nonce: request.nonce,
                    maxFeePerGasWei: request.maxFeePerGas?.toString(),
                    maxPriorityFeePerGasWei: request.maxPriorityFeePerGas?.toString(),
                },
            };

            const response = runLedgerBridge(bridgeCommand, payload) as {
                txHash?: unknown;
                rawTransaction?: unknown;
                signedTransaction?: unknown;
            };

            const txHash = parseTxHash(response.txHash);
            if (txHash) {
                return txHash;
            }

            const rawTransaction = parseRawTx(response.rawTransaction) || parseRawTx(response.signedTransaction);
            if (rawTransaction) {
                return publicClient.sendRawTransaction({
                    serializedTransaction: rawTransaction,
                });
            }

            throw new CliError("LEDGER_BRIDGE_FAILED", "Ledger bridge output missing txHash/rawTransaction.", 2);
        },
    };
}
