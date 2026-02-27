import { defineChain, type Chain } from "viem";
import { base, baseSepolia } from "viem/chains";

import { CliError } from "./errors";

interface ChainPreset {
    key: string;
    chainId: number;
    defaultRpcUrl: string;
    viemChain: Chain;
}

const CHAIN_PRESETS: Record<string, ChainPreset> = {
    base: {
        key: "base",
        chainId: 8453,
        defaultRpcUrl: "https://mainnet.base.org",
        viemChain: base,
    },
    "base-sepolia": {
        key: "base-sepolia",
        chainId: 84532,
        defaultRpcUrl: "https://sepolia.base.org",
        viemChain: baseSepolia,
    },
};

export interface ResolvedChain {
    key: string;
    chainId: number;
    defaultRpcUrl?: string;
}

export function resolveChain(value?: string): ResolvedChain {
    if (!value) {
        return CHAIN_PRESETS.base;
    }

    const normalized = value.trim().toLowerCase();

    if (CHAIN_PRESETS[normalized]) {
        return CHAIN_PRESETS[normalized];
    }

    if (/^\d+$/.test(normalized)) {
        return {
            key: `chain-${normalized}`,
            chainId: Number(normalized),
            defaultRpcUrl: undefined,
        };
    }

    throw new CliError(
        "INVALID_CHAIN",
        `Unsupported chain '${value}'. Use 'base', 'base-sepolia', or a numeric chain id.`,
        2,
    );
}

export function resolveRpcUrl(chain: ResolvedChain, rpcFlag?: string): string {
    if (rpcFlag) {
        return rpcFlag;
    }

    if (chain.key === "base" && process.env.BASE_RPC_URL) {
        return process.env.BASE_RPC_URL;
    }

    if (process.env.AGCLI_RPC_URL) {
        return process.env.AGCLI_RPC_URL;
    }

    if (chain.defaultRpcUrl) {
        return chain.defaultRpcUrl;
    }

    throw new CliError("MISSING_RPC_URL", "RPC URL is required for custom chain IDs.", 2);
}

export function toViemChain(chain: ResolvedChain, rpcUrl: string): Chain {
    const preset = CHAIN_PRESETS[chain.key];
    if (preset) {
        return preset.viemChain;
    }

    return defineChain({
        id: chain.chainId,
        name: chain.key,
        nativeCurrency: {
            name: "Ether",
            symbol: "ETH",
            decimals: 18,
        },
        rpcUrls: {
            default: {
                http: [rpcUrl],
            },
        },
    });
}
