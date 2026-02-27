import { describe, expect, it } from "vitest";

import {
    CORE_BASE_ENDPOINT,
    GBM_BASE_ENDPOINT,
    listSubgraphSources,
    parseSubgraphSourceAlias,
    resolveSubgraphEndpoint,
} from "./sources";
import { CliError } from "../errors";

describe("subgraph source resolver", () => {
    it("lists canonical sources", () => {
        const sources = listSubgraphSources();

        expect(sources.map((source) => source.alias).sort()).toEqual(["core-base", "gbm-base"]);
        expect(sources.find((source) => source.alias === "core-base")?.endpoint).toBe(CORE_BASE_ENDPOINT);
        expect(sources.find((source) => source.alias === "gbm-base")?.endpoint).toBe(GBM_BASE_ENDPOINT);
    });

    it("parses known source aliases", () => {
        expect(parseSubgraphSourceAlias("core-base")).toBe("core-base");
        expect(parseSubgraphSourceAlias("GBM-BASE")).toBe("gbm-base");
    });

    it("rejects unknown alias", () => {
        expect(() => parseSubgraphSourceAlias("bad-source")).toThrowError(CliError);

        try {
            parseSubgraphSourceAlias("bad-source");
        } catch (error) {
            const cliError = error as CliError;
            expect(cliError.code).toBe("SUBGRAPH_SOURCE_UNKNOWN");
        }
    });

    it("resolves canonical source endpoint", () => {
        const resolved = resolveSubgraphEndpoint({
            source: "core-base",
        });

        expect(resolved.endpoint).toBe(CORE_BASE_ENDPOINT);
        expect(resolved.isCustomEndpoint).toBe(false);
    });

    it("blocks non-canonical endpoint without explicit override", () => {
        expect(() =>
            resolveSubgraphEndpoint({
                source: "core-base",
                subgraphUrl: "https://example.com/subgraph",
            }),
        ).toThrowError(CliError);

        try {
            resolveSubgraphEndpoint({
                source: "core-base",
                subgraphUrl: "https://example.com/subgraph",
            });
        } catch (error) {
            const cliError = error as CliError;
            expect(cliError.code).toBe("SUBGRAPH_ENDPOINT_BLOCKED");
        }
    });

    it("allows custom endpoint only with explicit override flag", () => {
        const resolved = resolveSubgraphEndpoint({
            source: "core-base",
            subgraphUrl: "https://example.com/subgraph",
            allowUntrustedSubgraph: true,
        });

        expect(resolved.endpoint).toBe("https://example.com/subgraph");
        expect(resolved.isCustomEndpoint).toBe(true);
    });

    it("rejects non-https custom endpoints", () => {
        expect(() =>
            resolveSubgraphEndpoint({
                source: "gbm-base",
                subgraphUrl: "http://example.com/subgraph",
                allowUntrustedSubgraph: true,
            }),
        ).toThrowError(CliError);

        try {
            resolveSubgraphEndpoint({
                source: "gbm-base",
                subgraphUrl: "http://example.com/subgraph",
                allowUntrustedSubgraph: true,
            });
        } catch (error) {
            const cliError = error as CliError;
            expect(cliError.code).toBe("SUBGRAPH_ENDPOINT_BLOCKED");
        }
    });
});
