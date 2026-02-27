import { afterEach, describe, expect, it, vi } from "vitest";

import { CommandContext } from "../types";
import { BASE_GBM_DIAMOND } from "../subgraph/sources";

const { runOnchainSendWithFunctionMock } = vi.hoisted(() => ({
    runOnchainSendWithFunctionMock: vi.fn(),
}));

vi.mock("./onchain", () => ({
    runOnchainSendWithFunction: runOnchainSendWithFunctionMock,
}));

import { runMappedDomainCommand } from "./mapped";

function createCtx(path: string[]): CommandContext {
    return {
        commandPath: path,
        args: {
            positionals: path,
            flags: {
                "args-json": "[]",
            },
        },
        globals: {
            mode: "agent",
            json: true,
            yes: true,
            profile: "prod",
        },
    };
}

describe("mapped command execution defaults", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("injects built-in GBM defaults for auction bid", async () => {
        runOnchainSendWithFunctionMock.mockResolvedValue({ ok: true });

        const result = await runMappedDomainCommand(createCtx(["auction", "bid"]));

        expect(runOnchainSendWithFunctionMock).toHaveBeenCalledTimes(1);
        expect(runOnchainSendWithFunctionMock).toHaveBeenCalledWith(
            expect.objectContaining({ commandPath: ["auction", "bid"] }),
            "commitBid",
            "auction bid",
            expect.objectContaining({
                address: BASE_GBM_DIAMOND,
                source: "base.gbm-diamond",
            }),
        );
        expect(result).toMatchObject({
            mappedMethod: "commitBid",
            defaults: {
                source: "base.gbm-diamond",
                address: BASE_GBM_DIAMOND,
                abi: "available",
            },
            result: { ok: true },
        });
    });

    it("keeps non-defaulted mapped commands requiring explicit metadata", async () => {
        runOnchainSendWithFunctionMock.mockResolvedValue({ ok: true });

        const result = await runMappedDomainCommand(createCtx(["baazaar", "buy-now"]));
        const call = runOnchainSendWithFunctionMock.mock.calls[0];
        const defaultsArg = call?.[3] as { abi?: unknown; address?: unknown; source?: unknown };

        expect(runOnchainSendWithFunctionMock).toHaveBeenCalledTimes(1);
        expect(defaultsArg.abi).toBeUndefined();
        expect(defaultsArg.address).toBeUndefined();
        expect(defaultsArg.source).toBeUndefined();
        expect(result).toMatchObject({
            mappedMethod: "buyNow",
            defaults: null,
            result: { ok: true },
        });
    });
});
