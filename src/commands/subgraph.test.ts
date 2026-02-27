import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { CommandContext } from "../types";

const { executeSubgraphQueryMock } = vi.hoisted(() => ({
    executeSubgraphQueryMock: vi.fn(),
}));

vi.mock("../subgraph/client", () => ({
    executeSubgraphQuery: executeSubgraphQueryMock,
}));

import { runSubgraphCheckCommand, runSubgraphListCommand, runSubgraphQueryCommand } from "./subgraph";

const files: string[] = [];

function writeTmpQuery(contents: string): string {
    const filePath = path.join(os.tmpdir(), `agcli-subgraph-query-${Date.now()}-${Math.random()}.graphql`);
    fs.writeFileSync(filePath, contents, "utf8");
    files.push(filePath);
    return filePath;
}

function createContext(positionals: string[], flags: Record<string, string | boolean>): CommandContext {
    return {
        commandPath: positionals,
        args: {
            positionals,
            flags,
        },
        globals: {
            mode: "agent",
            json: true,
            yes: true,
        },
    };
}

afterEach(() => {
    vi.clearAllMocks();

    for (const filePath of files.splice(0)) {
        fs.rmSync(filePath, { force: true });
    }
});

describe("subgraph commands", () => {
    it("lists canonical sources", async () => {
        const result = await runSubgraphListCommand();
        const sources = (result as { sources: { alias: string }[] }).sources;

        expect(sources.map((source) => source.alias).sort()).toEqual(["core-base", "gbm-base"]);
    });

    it("runs introspection check and returns sorted fields", async () => {
        executeSubgraphQueryMock.mockResolvedValueOnce({
            source: "core-base",
            endpoint: "https://example.com/core",
            queryName: "introspection",
            data: {
                __schema: {
                    queryType: {
                        fields: [{ name: "zeta" }, { name: "alpha" }],
                    },
                },
            },
            raw: { data: { ok: true } },
        });

        const result = await runSubgraphCheckCommand(
            createContext(["subgraph", "check"], {
                source: "core-base",
                raw: true,
            }),
        );

        expect(executeSubgraphQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
                source: "core-base",
                queryName: "introspection",
                raw: true,
            }),
        );

        expect(result).toMatchObject({
            source: "core-base",
            endpoint: "https://example.com/core",
            fieldCount: 2,
            fields: ["alpha", "zeta"],
            raw: { data: { ok: true } },
        });
    });

    it("runs custom query with variables from inline json", async () => {
        executeSubgraphQueryMock.mockResolvedValueOnce({
            source: "gbm-base",
            endpoint: "https://example.com/gbm",
            queryName: "custom",
            data: { auctions: [] },
        });

        const result = await runSubgraphQueryCommand(
            createContext(["subgraph", "query"], {
                source: "gbm-base",
                query: "query($first:Int!){ auctions(first:$first){ id } }",
                "variables-json": '{"first":5}',
            }),
        );

        expect(executeSubgraphQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
                source: "gbm-base",
                queryName: "custom",
                variables: { first: 5 },
            }),
        );

        expect(result).toMatchObject({
            source: "gbm-base",
            endpoint: "https://example.com/gbm",
            queryName: "custom",
            data: { auctions: [] },
        });
    });

    it("supports reading query from file", async () => {
        executeSubgraphQueryMock.mockResolvedValueOnce({
            source: "core-base",
            endpoint: "https://example.com/core",
            queryName: "custom",
            data: { ok: true },
        });

        const queryFile = writeTmpQuery("query { __typename }");

        await runSubgraphQueryCommand(
            createContext(["subgraph", "query"], {
                source: "core-base",
                "query-file": queryFile,
            }),
        );

        expect(executeSubgraphQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
                source: "core-base",
                query: "query { __typename }",
            }),
        );
    });

    it("rejects invalid variables json", async () => {
        await expect(
            runSubgraphQueryCommand(
                createContext(["subgraph", "query"], {
                    source: "core-base",
                    query: "query { __typename }",
                    "variables-json": "[]",
                }),
            ),
        ).rejects.toMatchObject({
            code: "INVALID_VARIABLES_JSON",
        });
    });

    it("requires subgraph-url when allow-untrusted-subgraph is set", async () => {
        await expect(
            runSubgraphQueryCommand(
                createContext(["subgraph", "query"], {
                    source: "core-base",
                    query: "query { __typename }",
                    "allow-untrusted-subgraph": true,
                }),
            ),
        ).rejects.toMatchObject({
            code: "INVALID_ARGUMENT",
        });
    });
});
