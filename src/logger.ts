import pino from "pino";

import { GlobalOptions } from "./types";

let cached = pino({ level: "silent" });

export function initializeLogger(globals: GlobalOptions): void {
    const level = process.env.AGCLI_LOG_LEVEL || (globals.mode === "agent" ? "warn" : "info");

    cached = pino({
        level,
        base: undefined,
        timestamp: pino.stdTimeFunctions.isoTime,
    });
}

export function getLogger(): pino.Logger {
    return cached;
}
