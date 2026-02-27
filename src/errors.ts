import { JsonValue } from "./types";

export class CliError extends Error {
    readonly code: string;
    readonly exitCode: number;
    readonly details?: JsonValue;

    constructor(code: string, message: string, exitCode = 1, details?: JsonValue) {
        super(message);
        this.code = code;
        this.exitCode = exitCode;
        this.details = details;
    }
}

export function assertCondition(condition: boolean, code: string, message: string, details?: JsonValue): void {
    if (!condition) {
        throw new CliError(code, message, 2, details);
    }
}

export function toCliError(error: unknown): CliError {
    if (error instanceof CliError) {
        return error;
    }

    if (error instanceof Error) {
        return new CliError("UNEXPECTED_ERROR", error.message, 1);
    }

    return new CliError("UNEXPECTED_ERROR", "An unknown error occurred.", 1);
}
