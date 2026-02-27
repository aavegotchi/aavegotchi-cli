import { ethers } from "ethers";

import { CliError } from "./errors";
import { SignerConfig } from "./types";

export interface ResolvedSignerAccount {
    signerType: "readonly" | "env";
    address?: string;
    nonce?: number;
    balanceWei?: string;
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

    throw new CliError(
        "INVALID_SIGNER_SPEC",
        `Unsupported signer '${value}'. Use 'readonly' or 'env:<ENV_VAR>'.`,
        2,
    );
}

export async function resolveSignerAccount(
    signer: SignerConfig,
    provider: ethers.providers.JsonRpcProvider,
): Promise<ResolvedSignerAccount> {
    if (signer.type === "readonly") {
        return {
            signerType: "readonly",
        };
    }

    const privateKey = process.env[signer.envVar];
    if (!privateKey) {
        throw new CliError("MISSING_SIGNER_SECRET", `Missing environment variable '${signer.envVar}'.`, 2);
    }

    if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
        throw new CliError("INVALID_PRIVATE_KEY", `Environment variable '${signer.envVar}' is not a valid private key.`, 2);
    }

    const wallet = new ethers.Wallet(privateKey, provider);
    const [nonce, balance] = await Promise.all([
        provider.getTransactionCount(wallet.address, "latest"),
        provider.getBalance(wallet.address, "latest"),
    ]);

    return {
        signerType: "env",
        address: wallet.address,
        nonce,
        balanceWei: balance.toString(),
    };
}
