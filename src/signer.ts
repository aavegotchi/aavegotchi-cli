import { createWalletClient, http, type Account, type Chain, type PublicClient, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { CliError } from "./errors";
import { SignerConfig } from "./types";

export interface ResolvedSignerAccount {
    signerType: SignerConfig["type"];
    address?: `0x${string}`;
    nonce?: number;
    balanceWei?: string;
    canSign: boolean;
    backendStatus: "ready" | "unavailable";
}

export interface SignerRuntime {
    account?: Account;
    walletClient?: WalletClient;
    summary: ResolvedSignerAccount;
}

function parsePrivateKey(value: string, envVar: string): `0x${string}` {
    if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
        throw new CliError("INVALID_PRIVATE_KEY", `Environment variable '${envVar}' is not a valid private key.`, 2);
    }

    return value as `0x${string}`;
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
        const derivationPath = value.includes(":") ? value.slice("ledger:".length) : undefined;

        return {
            type: "ledger",
            derivationPath,
        };
    }

    if (value.startsWith("remote:")) {
        const url = value.slice("remote:".length).trim();
        if (!/^https?:\/\//i.test(url)) {
            throw new CliError("INVALID_SIGNER_SPEC", `Invalid remote signer format '${value}'.`, 2);
        }

        return {
            type: "remote",
            url,
        };
    }

    throw new CliError(
        "INVALID_SIGNER_SPEC",
        `Unsupported signer '${value}'. Use readonly, env:<ENV_VAR>, keychain:<id>, ledger[:path], or remote:<url>.`,
        2,
    );
}

export async function resolveSignerRuntime(
    signer: SignerConfig,
    publicClient: PublicClient,
    rpcUrl: string,
    chain: Chain,
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

    if (signer.type === "keychain") {
        throw new CliError("SIGNER_BACKEND_UNAVAILABLE", "keychain signer backend is not implemented yet.", 2, {
            signer,
        });
    }

    if (signer.type === "ledger") {
        throw new CliError("SIGNER_BACKEND_UNAVAILABLE", "ledger signer backend is not implemented yet.", 2, {
            signer,
        });
    }

    if (signer.type === "remote") {
        throw new CliError("SIGNER_BACKEND_UNAVAILABLE", "remote signer backend is not implemented yet.", 2, {
            signer,
        });
    }

    const privateKeyRaw = process.env[signer.envVar];
    if (!privateKeyRaw) {
        throw new CliError("MISSING_SIGNER_SECRET", `Missing environment variable '${signer.envVar}'.`, 2);
    }

    const privateKey = parsePrivateKey(privateKeyRaw, signer.envVar);
    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
        account,
        chain,
        transport: http(rpcUrl),
    });

    const [nonce, balance] = await Promise.all([
        publicClient.getTransactionCount({ address: account.address, blockTag: "pending" }),
        publicClient.getBalance({ address: account.address }),
    ]);

    return {
        account,
        walletClient,
        summary: {
            signerType: "env",
            address: account.address,
            nonce,
            balanceWei: balance.toString(),
            canSign: true,
            backendStatus: "ready",
        },
    };
}
