import { spawnSync } from "child_process";

import { createWalletClient, http, type Chain, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { CliError } from "./errors";
import { keychainResolvePrivateKey } from "./keychain";
import { SignerConfig } from "./types";

const REMOTE_SIGN_ADDRESS_PATH = "/address";
const REMOTE_SIGN_TX_PATH = "/sign-transaction";
const BANKR_DEFAULT_API_URL = "https://api.bankr.bot";
const BANKR_AGENT_ME_PATH = "/agent/me";
const BANKR_AGENT_SUBMIT_PATH = "/agent/submit";

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

function requireEnvVarName(value: string, context: string): string {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(value)) {
        throw new CliError("INVALID_SIGNER_SPEC", `Invalid ${context} env var '${value}'.`, 2);
    }

    return value;
}

function resolveBankrApiUrl(signer: Extract<SignerConfig, { type: "bankr" }>): string {
    return (signer.apiUrl || BANKR_DEFAULT_API_URL).replace(/\/+$/, "");
}

function buildBankrHeaders(signer: Extract<SignerConfig, { type: "bankr" }>): Record<string, string> {
    const envVar = signer.apiKeyEnvVar || "BANKR_API_KEY";
    const token = process.env[envVar];
    if (!token) {
        throw new CliError("MISSING_SIGNER_SECRET", `Missing environment variable '${envVar}'.`, 2);
    }

    return {
        "content-type": "application/json",
        "x-api-key": token,
    };
}

async function fetchBankrJson(url: string, init?: RequestInit): Promise<unknown> {
    let response: Response;
    try {
        response = await fetch(url, init);
    } catch (error) {
        throw new CliError("BANKR_API_UNREACHABLE", "Failed to connect to Bankr API.", 2, {
            url,
            message: error instanceof Error ? error.message : String(error),
        });
    }

    const text = await response.text();
    let parsed: unknown = {};
    if (text) {
        try {
            parsed = JSON.parse(text);
        } catch {
            parsed = text;
        }
    }

    if (!response.ok) {
        throw new CliError("BANKR_API_HTTP_ERROR", `Bankr API responded with HTTP ${response.status}.`, 2, {
            url,
            status: response.status,
            body: parsed,
        });
    }

    return parsed;
}

function parseBankrAddressCandidate(candidate: unknown): `0x${string}` | undefined {
    if (typeof candidate !== "string") {
        return undefined;
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(candidate)) {
        return undefined;
    }

    return candidate.toLowerCase() as `0x${string}`;
}

async function resolveBankrAddress(
    signer: Extract<SignerConfig, { type: "bankr" }>,
    headers: Record<string, string>,
): Promise<`0x${string}`> {
    if (signer.address) {
        return ensureAddress(signer.address, "bankr signer address");
    }

    const apiUrl = resolveBankrApiUrl(signer);
    const response = (await fetchBankrJson(addDefaultPaths(apiUrl, BANKR_AGENT_ME_PATH), {
        method: "GET",
        headers,
    })) as {
        walletAddress?: unknown;
        address?: unknown;
        agent?: { walletAddress?: unknown; address?: unknown };
        wallets?: Array<{ address?: unknown; walletAddress?: unknown; chain?: unknown }>;
    };

    const direct =
        parseBankrAddressCandidate(response.walletAddress) ||
        parseBankrAddressCandidate(response.address) ||
        parseBankrAddressCandidate(response.agent?.walletAddress) ||
        parseBankrAddressCandidate(response.agent?.address);

    if (direct) {
        return direct;
    }

    if (Array.isArray(response.wallets)) {
        const evmWallet = response.wallets.find((wallet) => wallet.chain === "evm");
        const evmAddress = parseBankrAddressCandidate(evmWallet?.address) || parseBankrAddressCandidate(evmWallet?.walletAddress);
        if (evmAddress) {
            return evmAddress;
        }

        for (const wallet of response.wallets) {
            const anyAddress =
                parseBankrAddressCandidate(wallet.address) || parseBankrAddressCandidate(wallet.walletAddress);
            if (anyAddress) {
                return anyAddress;
            }
        }
    }

    throw new CliError("BANKR_API_PROTOCOL_ERROR", "Bankr /agent/me response missing wallet address.", 2, {
        keys: Object.keys(response),
    });
}

function parseBankrSubmitHash(response: unknown): `0x${string}` | undefined {
    if (typeof response !== "object" || response === null) {
        return undefined;
    }

    const root = response as Record<string, unknown>;
    const nested = typeof root.result === "object" && root.result !== null ? (root.result as Record<string, unknown>) : undefined;

    return (
        parseTxHash(root.transactionHash) ||
        parseTxHash(root.txHash) ||
        parseTxHash(root.hash) ||
        parseTxHash(nested?.transactionHash) ||
        parseTxHash(nested?.txHash) ||
        parseTxHash(nested?.hash)
    );
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

function parseSignerBankrSpec(value: string): Extract<SignerConfig, { type: "bankr" }> {
    if (value === "bankr") {
        return { type: "bankr" };
    }

    const body = value.slice("bankr:".length).trim();
    const signer: Extract<SignerConfig, { type: "bankr" }> = {
        type: "bankr",
    };

    if (!body) {
        return signer;
    }

    if (!body.includes("|")) {
        if (/^0x[a-fA-F0-9]{40}$/.test(body)) {
            signer.address = ensureAddress(body, "bankr signer address");
            return signer;
        }

        if (/^[A-Z_][A-Z0-9_]*$/.test(body)) {
            signer.apiKeyEnvVar = requireEnvVarName(body, "bankr api key");
            return signer;
        }

        if (/^https?:\/\//i.test(body)) {
            signer.apiUrl = body;
            return signer;
        }

        throw new CliError("INVALID_SIGNER_SPEC", `Invalid bankr signer format '${value}'.`, 2);
    }

    const [addressPart, apiKeyEnvVarPart, apiUrlPart] = body.split("|").map((entry) => entry.trim());

    if (addressPart) {
        signer.address = ensureAddress(addressPart, "bankr signer address");
    }

    if (apiKeyEnvVarPart) {
        signer.apiKeyEnvVar = requireEnvVarName(apiKeyEnvVarPart, "bankr api key");
    }

    if (apiUrlPart) {
        if (!/^https?:\/\//i.test(apiUrlPart)) {
            throw new CliError("INVALID_SIGNER_SPEC", `Invalid bankr API URL in '${value}'.`, 2);
        }
        signer.apiUrl = apiUrlPart;
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

    if (value === "bankr" || value.startsWith("bankr:")) {
        return parseSignerBankrSpec(value);
    }

    throw new CliError(
        "INVALID_SIGNER_SPEC",
        `Unsupported signer '${value}'. Use readonly, env:<ENV_VAR>, keychain:<id>, ledger[:path|address|bridgeEnv], remote:<url|address|authEnv>, or bankr[:address|apiKeyEnv|apiUrl].`,
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

    if (signer.type === "bankr") {
        const apiUrl = resolveBankrApiUrl(signer);
        const headers = buildBankrHeaders(signer);
        const address = await resolveBankrAddress(signer, headers);
        const summary = await resolveBalanceSummary("bankr", publicClient, address);

        return {
            summary,
            sendTransaction: async (request) => {
                const payload = {
                    transaction: {
                        chainId: request.chain.id,
                        from: address,
                        to: request.to,
                        data: request.data,
                        value: request.value?.toString() || "0",
                        gas: request.gas.toString(),
                        nonce: request.nonce,
                        maxFeePerGas: request.maxFeePerGas?.toString(),
                        maxPriorityFeePerGas: request.maxPriorityFeePerGas?.toString(),
                    },
                    waitForConfirmation: false,
                    description: "Submitted via aavegotchi-cli",
                };

                const response = await fetchBankrJson(addDefaultPaths(apiUrl, BANKR_AGENT_SUBMIT_PATH), {
                    method: "POST",
                    headers,
                    body: JSON.stringify(payload),
                });

                const txHash = parseBankrSubmitHash(response);
                if (txHash) {
                    return txHash;
                }

                throw new CliError("BANKR_API_PROTOCOL_ERROR", "Bankr submit response missing transaction hash.", 2, {
                    response,
                });
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
