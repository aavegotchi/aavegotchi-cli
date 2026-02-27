import { ethers } from "ethers";

import { CliError } from "./errors";

export interface RpcPreflightResult {
    provider: ethers.providers.JsonRpcProvider;
    chainId: number;
    networkName: string;
}

export async function runRpcPreflight(rpcUrl: string, expectedChainId?: number): Promise<RpcPreflightResult> {
    let provider: ethers.providers.JsonRpcProvider;

    try {
        provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    } catch {
        throw new CliError("INVALID_RPC_URL", "Could not construct RPC provider from the given URL.", 2, { rpcUrl });
    }

    let network: ethers.providers.Network;
    try {
        network = await provider.getNetwork();
    } catch {
        throw new CliError("RPC_UNREACHABLE", "Failed to connect to RPC endpoint.", 2, { rpcUrl });
    }

    if (expectedChainId !== undefined && network.chainId !== expectedChainId) {
        throw new CliError("CHAIN_MISMATCH", "Connected chain does not match requested chain.", 2, {
            expectedChainId,
            actualChainId: network.chainId,
        });
    }

    return {
        provider,
        chainId: network.chainId,
        networkName: network.name,
    };
}
