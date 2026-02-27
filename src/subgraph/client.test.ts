import { afterEach, describe, expect, it, vi } from "vitest";

import { executeSubgraphQuery } from "./client";
import { CORE_BASE_ENDPOINT } from "./sources";
import { CliError } from "../errors";

describe("subgraph client", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        delete process.env.GOLDSKY_API_KEY;
        delete process.env.CUSTOM_GOLDSKY_KEY;
    });

    it("injects bearer auth from default env var", async () => {
        process.env.GOLDSKY_API_KEY = "token-123";

        const fetchMock = vi.fn(async () =>
            new Response(
                JSON.stringify({
                    data: { ping: true },
                }),
                { status: 200 },
            ),
        );

        vi.stubGlobal("fetch", fetchMock);

        const result = await executeSubgraphQuery<{ ping: boolean }>({
            source: "core-base",
            queryName: "ping",
            query: "query { ping }",
        });

        expect(result.data.ping).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0]?.[0]).toBe(CORE_BASE_ENDPOINT);
        expect((fetchMock.mock.calls[0]?.[1] as { headers: Record<string, string> }).headers.authorization).toBe(
            "Bearer token-123",
        );
    });

    it("supports overriding auth env var", async () => {
        process.env.CUSTOM_GOLDSKY_KEY = "token-abc";

        const fetchMock = vi.fn(async () =>
            new Response(
                JSON.stringify({
                    data: { ok: true },
                }),
                { status: 200 },
            ),
        );

        vi.stubGlobal("fetch", fetchMock);

        await executeSubgraphQuery({
            source: "core-base",
            queryName: "ping",
            query: "query { ping }",
            authEnvVar: "CUSTOM_GOLDSKY_KEY",
        });

        expect((fetchMock.mock.calls[0]?.[1] as { headers: Record<string, string> }).headers.authorization).toBe(
            "Bearer token-abc",
        );
    });

    it("retries once on transport errors", async () => {
        const fetchMock = vi
            .fn()
            .mockRejectedValueOnce(new Error("network down"))
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        data: { ok: true },
                    }),
                    { status: 200 },
                ),
            );

        vi.stubGlobal("fetch", fetchMock);

        const result = await executeSubgraphQuery<{ ok: boolean }>({
            source: "core-base",
            queryName: "retry-check",
            query: "query { ok }",
        });

        expect(result.data.ok).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("maps timeout failures", async () => {
        const fetchMock = vi.fn((_: unknown, init?: RequestInit) => {
            return new Promise((_, reject) => {
                init?.signal?.addEventListener("abort", () => {
                    reject(new DOMException("The operation was aborted.", "AbortError"));
                });
            });
        });

        vi.stubGlobal("fetch", fetchMock);

        await expect(
            executeSubgraphQuery({
                source: "core-base",
                queryName: "timeout-check",
                query: "query { slow }",
                timeoutMs: 1,
            }),
        ).rejects.toMatchObject({
            code: "SUBGRAPH_TIMEOUT",
        });
    });

    it("maps graphql errors", async () => {
        const fetchMock = vi.fn(async () =>
            new Response(
                JSON.stringify({
                    errors: [{ message: "bad query" }],
                }),
                { status: 200 },
            ),
        );

        vi.stubGlobal("fetch", fetchMock);

        await expect(
            executeSubgraphQuery({
                source: "gbm-base",
                queryName: "broken",
                query: "query { broken }",
            }),
        ).rejects.toMatchObject({
            code: "SUBGRAPH_GRAPHQL_ERROR",
        });
    });

    it("maps invalid json payloads", async () => {
        const fetchMock = vi.fn(async () => new Response("not-json", { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            executeSubgraphQuery({
                source: "gbm-base",
                queryName: "invalid-json",
                query: "query { x }",
            }),
        ).rejects.toMatchObject({
            code: "SUBGRAPH_INVALID_RESPONSE",
        });
    });

    it("maps http errors", async () => {
        const fetchMock = vi.fn(async () => new Response("oops", { status: 500 }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            executeSubgraphQuery({
                source: "core-base",
                queryName: "http-error",
                query: "query { x }",
            }),
        ).rejects.toMatchObject({
            code: "SUBGRAPH_HTTP_ERROR",
        });

        try {
            await executeSubgraphQuery({
                source: "core-base",
                queryName: "http-error",
                query: "query { x }",
            });
        } catch (error) {
            const cliError = error as CliError;
            expect(cliError.details).toMatchObject({
                source: "core-base",
                endpoint: CORE_BASE_ENDPOINT,
                queryName: "http-error",
            });
        }
    });
});
