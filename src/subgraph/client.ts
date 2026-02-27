import { CliError } from "../errors";
import { SubgraphRequestOptions, SubgraphResponseEnvelope } from "../types";

import { resolveSubgraphEndpoint } from "./sources";

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_RETRIES = 1;
const DEFAULT_AUTH_ENV_VAR = "GOLDSKY_API_KEY";

interface GraphQlPayload {
    data?: unknown;
    errors?: unknown;
}

function ensureAuthEnvVarName(value: string): string {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(value)) {
        throw new CliError("INVALID_ARGUMENT", `Invalid auth env var '${value}'.`, 2, {
            authEnvVar: value,
        });
    }

    return value;
}

async function fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
    details: { source: string; endpoint: string; queryName: string },
): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            ...init,
            signal: controller.signal,
        });
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            throw new CliError("SUBGRAPH_TIMEOUT", `Subgraph query timed out after ${timeoutMs}ms.`, 2, {
                ...details,
                timeoutMs,
            });
        }

        throw new CliError("SUBGRAPH_HTTP_ERROR", "Failed to reach subgraph endpoint.", 2, {
            ...details,
            message: error instanceof Error ? error.message : String(error),
        });
    } finally {
        clearTimeout(timer);
    }
}

function parseGraphQlPayload(
    raw: string,
    details: { source: string; endpoint: string; queryName: string },
): GraphQlPayload {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new CliError("SUBGRAPH_INVALID_RESPONSE", "Subgraph response was not valid JSON.", 2, details);
    }

    if (!parsed || typeof parsed !== "object") {
        throw new CliError("SUBGRAPH_INVALID_RESPONSE", "Subgraph response shape is invalid.", 2, details);
    }

    return parsed as GraphQlPayload;
}

function isRetriableError(error: CliError): boolean {
    return error.code === "SUBGRAPH_TIMEOUT" || error.code === "SUBGRAPH_HTTP_ERROR";
}

export async function executeSubgraphQuery<TData = unknown>(
    options: SubgraphRequestOptions & { raw?: boolean },
): Promise<SubgraphResponseEnvelope<TData>> {
    const resolved = resolveSubgraphEndpoint({
        source: options.source,
        subgraphUrl: options.subgraphUrl,
        allowUntrustedSubgraph: options.allowUntrustedSubgraph,
    });

    const authEnvVar = ensureAuthEnvVarName(options.authEnvVar || DEFAULT_AUTH_ENV_VAR);
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
        throw new CliError("INVALID_ARGUMENT", "--timeout-ms must be a positive integer.", 2, {
            timeoutMs,
        });
    }
    const retries = DEFAULT_RETRIES;

    const headers: Record<string, string> = {
        "content-type": "application/json",
    };

    const authToken = process.env[authEnvVar];
    if (authToken) {
        headers.authorization = `Bearer ${authToken}`;
    }

    const requestBody = JSON.stringify({
        query: options.query,
        variables: options.variables || {},
    });

    const requestDetails = {
        source: resolved.source,
        endpoint: resolved.endpoint,
        queryName: options.queryName,
    };

    let lastError: CliError | undefined;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await fetchWithTimeout(
                resolved.endpoint,
                {
                    method: "POST",
                    headers,
                    body: requestBody,
                },
                timeoutMs,
                requestDetails,
            );

            const responseText = await response.text();
            if (!response.ok) {
                throw new CliError("SUBGRAPH_HTTP_ERROR", `Subgraph endpoint returned HTTP ${response.status}.`, 2, {
                    ...requestDetails,
                    status: response.status,
                    body: responseText.slice(0, 500),
                });
            }

            const payload = parseGraphQlPayload(responseText, requestDetails);

            if (Array.isArray(payload.errors) && payload.errors.length > 0) {
                throw new CliError("SUBGRAPH_GRAPHQL_ERROR", "Subgraph query returned GraphQL errors.", 2, {
                    ...requestDetails,
                    errors: payload.errors,
                });
            }

            if (!("data" in payload)) {
                throw new CliError("SUBGRAPH_INVALID_RESPONSE", "Subgraph response missing 'data' field.", 2, requestDetails);
            }

            return {
                source: resolved.source,
                endpoint: resolved.endpoint,
                queryName: options.queryName,
                data: payload.data as TData,
                ...(options.raw ? { raw: payload as unknown as object } : {}),
            };
        } catch (error) {
            if (error instanceof CliError) {
                lastError = error;
                if (attempt < retries && isRetriableError(error)) {
                    continue;
                }
                throw error;
            }

            lastError = new CliError("SUBGRAPH_HTTP_ERROR", "Subgraph request failed.", 2, {
                ...requestDetails,
                message: error instanceof Error ? error.message : String(error),
            });
            if (attempt < retries) {
                continue;
            }
            throw lastError;
        }
    }

    throw (
        lastError ||
        new CliError("SUBGRAPH_HTTP_ERROR", "Subgraph request failed.", 2, {
            ...requestDetails,
        })
    );
}
