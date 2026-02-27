import { CliError } from "./errors";

interface ChainPreset {
    key: string;
    chainId: number;
    defaultRpcUrl: string;
}

const CHAIN_PRESETS: Record<string, ChainPreset> = {
    base: {
        key: "base",
        chainId: 8453,
        defaultRpcUrl: "https://mainnet.base.org",
    },
    "base-sepolia": {
        key: "base-sepolia",
        chainId: 84532,
        defaultRpcUrl: "https://sepolia.base.org",
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
