import { describe, expect, it } from "vitest";

import { resolveChain, resolveRpcUrl } from "./chains";

describe("agcli chains", () => {
    it("defaults to base", () => {
        const chain = resolveChain();

        expect(chain.key).toBe("base");
        expect(chain.chainId).toBe(8453);
    });

    it("supports numeric chain id", () => {
        const chain = resolveChain("1");

        expect(chain.key).toBe("chain-1");
        expect(chain.chainId).toBe(1);
        expect(chain.defaultRpcUrl).toBeUndefined();
    });

    it("resolves preset rpc when available", () => {
        const chain = resolveChain("base");
        const rpc = resolveRpcUrl(chain);

        expect(rpc.length).toBeGreaterThan(0);
    });
});
