import { CliError } from "../errors";
import { SubgraphSourceAlias, SubgraphSourceDefinition } from "../types";

export const CORE_BASE_ENDPOINT =
    "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn";
export const GBM_BASE_ENDPOINT =
    "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-gbm-baazaar-base/prod/gn";

export const BASE_AAVEGOTCHI_DIAMOND = "0xa99c4b08201f2913db8d28e71d020c4298f29dbf" as const;
export const BASE_GBM_DIAMOND = "0x80320a0000c7a6a34086e2acad6915ff57ffda31" as const;

const SOURCE_MAP: Record<SubgraphSourceAlias, SubgraphSourceDefinition> = {
    "core-base": {
        alias: "core-base",
        endpoint: CORE_BASE_ENDPOINT,
        description: "Aavegotchi core base subgraph (Baazaar listings and core entities).",
    },
    "gbm-base": {
        alias: "gbm-base",
        endpoint: GBM_BASE_ENDPOINT,
        description: "Aavegotchi GBM baazaar base subgraph (auctions and bids).",
    },
};

export interface ResolvedSubgraphEndpoint {
    source: SubgraphSourceAlias;
    endpoint: string;
    isCustomEndpoint: boolean;
}

export function listSubgraphSources(): SubgraphSourceDefinition[] {
    return Object.values(SOURCE_MAP);
}

export function parseSubgraphSourceAlias(value: string | undefined): SubgraphSourceAlias {
    if (!value) {
        throw new CliError("MISSING_ARGUMENT", "subgraph source is required (--source).", 2);
    }

    const normalized = value.trim().toLowerCase();
    if (normalized === "core-base" || normalized === "gbm-base") {
        return normalized;
    }

    throw new CliError("SUBGRAPH_SOURCE_UNKNOWN", `Unknown subgraph source '${value}'.`, 2, {
        source: value,
        supportedSources: Object.keys(SOURCE_MAP),
    });
}

function parseHttpsUrl(value: string): string {
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        throw new CliError("INVALID_ARGUMENT", "subgraph url must be a valid URL.", 2, {
            subgraphUrl: value,
        });
    }

    if (parsed.protocol !== "https:") {
        throw new CliError("SUBGRAPH_ENDPOINT_BLOCKED", "Custom subgraph url must use HTTPS.", 2, {
            subgraphUrl: value,
        });
    }

    return parsed.toString();
}

export function resolveSubgraphEndpoint(input: {
    source: SubgraphSourceAlias;
    subgraphUrl?: string;
    allowUntrustedSubgraph?: boolean;
}): ResolvedSubgraphEndpoint {
    const source = SOURCE_MAP[input.source];
    if (!source) {
        throw new CliError("SUBGRAPH_SOURCE_UNKNOWN", `Unknown subgraph source '${input.source}'.`, 2, {
            source: input.source,
            supportedSources: Object.keys(SOURCE_MAP),
        });
    }

    if (!input.subgraphUrl) {
        return {
            source: source.alias,
            endpoint: source.endpoint,
            isCustomEndpoint: false,
        };
    }

    const endpoint = parseHttpsUrl(input.subgraphUrl);
    if (endpoint === source.endpoint) {
        return {
            source: source.alias,
            endpoint,
            isCustomEndpoint: false,
        };
    }

    if (!input.allowUntrustedSubgraph) {
        throw new CliError(
            "SUBGRAPH_ENDPOINT_BLOCKED",
            "Custom subgraph endpoint blocked by default. Pass --allow-untrusted-subgraph to override.",
            2,
            {
                source: source.alias,
                canonicalEndpoint: source.endpoint,
                requestedEndpoint: endpoint,
            },
        );
    }

    return {
        source: source.alias,
        endpoint,
        isCustomEndpoint: true,
    };
}
