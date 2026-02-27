import { createHash } from "crypto";

import { TxIntent } from "./types";

export function deriveIdempotencyKey(intent: TxIntent): string {
    const source = JSON.stringify({
        command: intent.command,
        profileName: intent.profileName,
        chainId: intent.chainId,
        to: intent.to,
        data: intent.data || "0x",
        valueWei: intent.valueWei?.toString() || "0",
        noncePolicy: intent.noncePolicy,
        nonce: intent.nonce,
    });

    return createHash("sha256").update(source).digest("hex");
}

export function resolveIdempotencyKey(intent: TxIntent): string {
    return intent.idempotencyKey || deriveIdempotencyKey(intent);
}
