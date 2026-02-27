import { createPublicClient, http, type PublicClient } from "viem";

import { toViemChain, type ResolvedChain } from "./chains";
import { CliError } from "./errors";

export interface RpcPreflightResult {
    client: PublicClient;
    chainId: number;
    blockNumber: string;
    chainName: string;
}

export function createRpcClient(chain: ResolvedChain, rpcUrl: string): PublicClient {
    const viemChain = toViemChain(chain, rpcUrl);

    return createPublicClient({
        chain: viemChain,
        transport: http(rpcUrl),
    });
}

export async function runRpcPreflight(chain: ResolvedChain, rpcUrl: string): Promise<RpcPreflightResult> {
    const client = createRpcClient(chain, rpcUrl);

    try {
        const [chainId, blockNumber] = await Promise.all([client.getChainId(), client.getBlockNumber()]);

        if (chain.chainId !== chainId) {
            throw new CliError("CHAIN_MISMATCH", "Connected chain does not match requested chain.", 2, {
                expectedChainId: chain.chainId,
                actualChainId: chainId,
            });
        }

        return {
            client,
            chainId,
            blockNumber: blockNumber.toString(),
            chainName: client.chain?.name || chain.key,
        };
    } catch (error) {
        if (error instanceof CliError) {
            throw error;
        }

        throw new CliError("RPC_UNREACHABLE", "Failed to connect to RPC endpoint.", 2, {
            rpcUrl,
        });
    }
}
