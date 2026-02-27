export type RunMode = "agent" | "human";

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = unknown;

export type FlagValue = string | boolean;

export type NoncePolicy = "safe" | "replace" | "manual";

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

export type SubgraphSourceAlias = "core-base" | "gbm-base";

export interface SubgraphSourceDefinition {
    alias: SubgraphSourceAlias;
    endpoint: string;
    description: string;
}

export interface SubgraphRequestOptions {
    source: SubgraphSourceAlias;
    queryName: string;
    query: string;
    variables?: Record<string, unknown>;
    timeoutMs?: number;
    authEnvVar?: string;
    subgraphUrl?: string;
    allowUntrustedSubgraph?: boolean;
}

export interface SubgraphResponseEnvelope<T> {
    source: SubgraphSourceAlias;
    endpoint: string;
    queryName: string;
    data: T;
    raw?: JsonValue;
}

export interface BaazaarErc721ListingResult {
    id: string;
    category: string;
    erc721TokenAddress: `0x${string}`;
    tokenId: string;
    seller: `0x${string}`;
    priceInWei: string;
    cancelled: boolean;
    timeCreated: string;
    timePurchased: string;
}

export interface BaazaarErc1155ListingResult {
    id: string;
    category: string;
    erc1155TokenAddress: `0x${string}`;
    erc1155TypeId: string;
    quantity: string;
    seller: `0x${string}`;
    priceInWei: string;
    cancelled: boolean;
    sold: boolean;
    timeCreated: string;
}

export interface GbmAuctionResult {
    id: string;
    type?: string;
    contractAddress: `0x${string}`;
    tokenId: string;
    quantity: string;
    seller: `0x${string}`;
    highestBid: string;
    highestBidder?: `0x${string}`;
    totalBids: string;
    startsAt: string;
    endsAt: string;
    claimAt?: string;
    claimed: boolean;
    cancelled: boolean;
    presetId?: string;
    category?: string;
    buyNowPrice?: string;
    startBidPrice?: string;
}

export interface GbmBidResult {
    id: string;
    bidder: `0x${string}`;
    amount: string;
    bidTime: string;
    outbid: boolean;
    previousBid?: string;
    previousBidder?: `0x${string}`;
    auctionId?: string;
}

export interface SignerReadonlyConfig {
    type: "readonly";
}

export interface SignerEnvConfig {
    type: "env";
    envVar: string;
}

export interface SignerKeychainConfig {
    type: "keychain";
    accountId: string;
}

export interface SignerLedgerConfig {
    type: "ledger";
    derivationPath?: string;
    address?: `0x${string}`;
    bridgeCommandEnvVar?: string;
}

export interface SignerRemoteConfig {
    type: "remote";
    url: string;
    address?: `0x${string}`;
    authEnvVar?: string;
}

export type SignerConfig =
    | SignerReadonlyConfig
    | SignerEnvConfig
    | SignerKeychainConfig
    | SignerLedgerConfig
    | SignerRemoteConfig;

export interface PolicyConfig {
    name: string;
    maxValueWei?: string;
    maxGasLimit?: string;
    maxFeePerGasWei?: string;
    maxPriorityFeePerGasWei?: string;
    allowedTo?: `0x${string}`[];
    createdAt: string;
    updatedAt: string;
}

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
    schemaVersion: 2;
    activeProfile?: string;
    profiles: Record<string, ProfileConfig>;
    policies: Record<string, PolicyConfig>;
}

export interface TxIntent {
    idempotencyKey?: string;
    profileName: string;
    chainId: number;
    rpcUrl: string;
    signer: SignerConfig;
    policy: PolicyConfig;
    to: `0x${string}`;
    data?: `0x${string}`;
    valueWei?: bigint;
    noncePolicy: NoncePolicy;
    nonce?: number;
    waitForReceipt: boolean;
    dryRun?: boolean;
    timeoutMs: number;
    command: string;
}

export interface TxExecutionResult {
    idempotencyKey?: string;
    txHash?: `0x${string}`;
    from: `0x${string}`;
    to: `0x${string}`;
    nonce: number;
    gasLimit: string;
    maxFeePerGasWei?: string;
    maxPriorityFeePerGasWei?: string;
    status: "simulated" | "submitted" | "confirmed";
    dryRun?: boolean;
    simulation?: {
        requiredWei: string;
        balanceWei: string;
        signerCanSign: boolean;
        noncePolicy: NoncePolicy;
    };
    receipt?: {
        blockNumber: string;
        gasUsed: string;
        status: "success" | "reverted";
    };
}

export interface JournalEntry {
    id: number;
    idempotencyKey: string;
    profileName: string;
    chainId: number;
    command: string;
    toAddress: string;
    fromAddress: string;
    valueWei: string;
    dataHex: string;
    nonce: number;
    gasLimit: string;
    maxFeePerGasWei: string;
    maxPriorityFeePerGasWei: string;
    txHash: string;
    status: "prepared" | "submitted" | "confirmed" | "failed";
    errorCode: string;
    errorMessage: string;
    receiptJson: string;
    createdAt: string;
    updatedAt: string;
}
