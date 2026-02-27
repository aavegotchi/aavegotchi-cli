import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { afterEach, describe, expect, it } from "vitest";

import { JournalStore } from "./journal";

const tempPaths: string[] = [];

afterEach(() => {
    for (const file of tempPaths.splice(0)) {
        fs.rmSync(file, { force: true });
    }
});

function createDbPath(): string {
    const file = path.join(os.tmpdir(), `agcli-journal-test-${Date.now()}-${Math.random()}.sqlite`);
    tempPaths.push(file);
    return file;
}

describe("journal store", () => {
    it("writes and updates tx records", () => {
        const journal = new JournalStore(createDbPath());

        const prepared = journal.upsertPrepared({
            idempotencyKey: "key-1",
            profileName: "prod",
            chainId: 8453,
            command: "tx send",
            toAddress: "0x0000000000000000000000000000000000000001",
            fromAddress: "0x0000000000000000000000000000000000000002",
            valueWei: "1",
            dataHex: "0x",
            nonce: 1,
            gasLimit: "21000",
            maxFeePerGasWei: "100",
            maxPriorityFeePerGasWei: "2",
            status: "prepared",
        });

        expect(prepared.status).toBe("prepared");

        const submitted = journal.markSubmitted({
            idempotencyKey: "key-1",
            txHash: "0xabc",
            status: "submitted",
            errorCode: "",
            errorMessage: "",
        });

        expect(submitted.status).toBe("submitted");
        expect(submitted.txHash).toBe("0xabc");

        const confirmed = journal.markConfirmed("key-1", '{"status":"success"}');
        expect(confirmed.status).toBe("confirmed");

        const loaded = journal.getByIdempotencyKey("key-1");
        expect(loaded?.status).toBe("confirmed");

        journal.close();
    });
});
