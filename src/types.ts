export type RunMode = "agent" | "human";

export type JsonValue = unknown;

export type FlagValue = string | boolean;

export interface ParsedArgs {
    positionals: string[];
    flags: Record<string, FlagValue>;
}

export interface GlobalOptions {
    mode: RunMode;
    json: boolean;
    yes: boolean;
    profile?: string;
}

export interface OutputEnvelope {
    schemaVersion: "1.0.0";
    command: string;
    status: "ok" | "error";
    data?: JsonValue;
    error?: {
        code: string;
        message: string;
        details?: JsonValue;
    };
    meta: {
        timestamp: string;
        mode: RunMode;
    };
}

export interface CommandContext {
    commandPath: string[];
    args: ParsedArgs;
    globals: GlobalOptions;
}

export interface SignerReadonlyConfig {
    type: "readonly";
}

export interface SignerEnvConfig {
    type: "env";
    envVar: string;
}

export type SignerConfig = SignerReadonlyConfig | SignerEnvConfig;

export interface ProfileConfig {
    name: string;
    chain: string;
    chainId: number;
    rpcUrl: string;
    signer: SignerConfig;
    policy: string;
    createdAt: string;
    updatedAt: string;
}

export interface CliConfig {
    schemaVersion: 1;
    activeProfile?: string;
    profiles: Record<string, ProfileConfig>;
}
