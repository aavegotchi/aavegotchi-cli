import * as fs from "fs";

import { getFlagBoolean, getFlagString } from "../args";
import { CliError } from "../errors";
import { subgraphVariablesSchema } from "../schemas";
import { CommandContext, JsonValue } from "../types";
import { executeSubgraphQuery } from "../subgraph/client";
import { SUBGRAPH_INTROSPECTION_QUERY } from "../subgraph/queries";
import { listSubgraphSources, parseSubgraphSourceAlias } from "../subgraph/sources";

function parseTimeoutMs(value: string | undefined): number | undefined {
    if (!value) {
        return undefined;
    }

    const timeout = Number(value);
    if (!Number.isInteger(timeout) || timeout <= 0) {
        throw new CliError("INVALID_ARGUMENT", "--timeout-ms must be a positive integer.", 2, {
            value,
        });
    }

    return timeout;
}

function parseVariablesJson(value: string | undefined): Record<string, unknown> {
    if (!value) {
        return {};
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        throw new CliError("INVALID_VARIABLES_JSON", "--variables-json must be valid JSON.", 2);
    }

    const result = subgraphVariablesSchema.safeParse(parsed);
    if (!result.success) {
        throw new CliError("INVALID_VARIABLES_JSON", "--variables-json must be a JSON object.", 2, {
            issues: result.error.issues,
        });
    }

    return result.data;
}

function readQueryFromInput(flags: Record<string, string | boolean>): string {
    const inline = getFlagString(flags, "query");
    const queryFile = getFlagString(flags, "query-file");

    if (!inline && !queryFile) {
        throw new CliError("MISSING_ARGUMENT", "subgraph query requires --query or --query-file.", 2);
    }

    if (inline && queryFile) {
        throw new CliError("INVALID_ARGUMENT", "Provide only one of --query or --query-file.", 2);
    }

    if (inline) {
        return inline;
    }

    const filePath = queryFile as string;
    if (!fs.existsSync(filePath)) {
        throw new CliError("MISSING_ARGUMENT", `Query file not found: ${filePath}`, 2);
    }

    const query = fs.readFileSync(filePath, "utf8").trim();
    if (!query) {
        throw new CliError("INVALID_ARGUMENT", "Query file is empty.", 2, {
            queryFile: filePath,
        });
    }

    return query;
}

function parseRawFlag(ctx: CommandContext): boolean {
    return getFlagBoolean(ctx.args.flags, "raw");
}

function parseCommonRequestOptions(ctx: CommandContext): {
    source: ReturnType<typeof parseSubgraphSourceAlias>;
    timeoutMs?: number;
    authEnvVar?: string;
    subgraphUrl?: string;
    allowUntrustedSubgraph?: boolean;
} {
    const subgraphUrl = getFlagString(ctx.args.flags, "subgraph-url");
    const allowUntrustedSubgraph = getFlagBoolean(ctx.args.flags, "allow-untrusted-subgraph");

    if (allowUntrustedSubgraph && !subgraphUrl) {
        throw new CliError(
            "INVALID_ARGUMENT",
            "--allow-untrusted-subgraph requires --subgraph-url.",
            2,
        );
    }

    return {
        source: parseSubgraphSourceAlias(getFlagString(ctx.args.flags, "source")),
        timeoutMs: parseTimeoutMs(getFlagString(ctx.args.flags, "timeout-ms")),
        authEnvVar: getFlagString(ctx.args.flags, "auth-env-var"),
        subgraphUrl,
        allowUntrustedSubgraph,
    };
}

export async function runSubgraphListCommand(): Promise<JsonValue> {
    return {
        sources: listSubgraphSources(),
    };
}

export async function runSubgraphCheckCommand(ctx: CommandContext): Promise<JsonValue> {
    const common = parseCommonRequestOptions(ctx);
    const raw = parseRawFlag(ctx);

    const response = await executeSubgraphQuery<{
        __schema?: { queryType?: { fields?: { name?: string }[] } };
    }>({
        ...common,
        queryName: "introspection",
        query: SUBGRAPH_INTROSPECTION_QUERY,
        variables: {},
        raw,
    });

    const fields = response.data.__schema?.queryType?.fields;
    if (!Array.isArray(fields)) {
        throw new CliError("SUBGRAPH_INVALID_RESPONSE", "Introspection response missing query fields.", 2, {
            source: response.source,
            endpoint: response.endpoint,
        });
    }

    const fieldNames = fields
        .map((field) => field.name)
        .filter((name): name is string => typeof name === "string")
        .sort((a, b) => a.localeCompare(b));

    return {
        source: response.source,
        endpoint: response.endpoint,
        queryName: response.queryName,
        fieldCount: fieldNames.length,
        fields: fieldNames,
        ...(raw ? { raw: response.raw } : {}),
    };
}

export async function runSubgraphQueryCommand(ctx: CommandContext): Promise<JsonValue> {
    const common = parseCommonRequestOptions(ctx);
    const raw = parseRawFlag(ctx);
    const query = readQueryFromInput(ctx.args.flags);
    const variables = parseVariablesJson(getFlagString(ctx.args.flags, "variables-json"));

    const response = await executeSubgraphQuery({
        ...common,
        queryName: "custom",
        query,
        variables,
        raw,
    });

    return {
        source: response.source,
        endpoint: response.endpoint,
        queryName: response.queryName,
        data: response.data,
        ...(raw ? { raw: response.raw } : {}),
    };
}
