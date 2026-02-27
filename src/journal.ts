import * as fs from "fs";

import Database from "better-sqlite3";

import { JournalEntry } from "./types";

interface PreparedInsertParams {
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
    status: JournalEntry["status"];
}

interface SubmittedUpdateParams {
    idempotencyKey: string;
    txHash: string;
    status: JournalEntry["status"];
    errorCode: string;
    errorMessage: string;
}

interface FileJournalPayload {
    nextId: number;
    entries: JournalEntry[];
}

function mapRow(row: Record<string, unknown>): JournalEntry {
    return {
        id: Number(row.id),
        idempotencyKey: String(row.idempotency_key),
        profileName: String(row.profile_name),
        chainId: Number(row.chain_id),
        command: String(row.command),
        toAddress: String(row.to_address),
        fromAddress: String(row.from_address),
        valueWei: String(row.value_wei),
        dataHex: String(row.data_hex),
        nonce: Number(row.nonce),
        gasLimit: String(row.gas_limit),
        maxFeePerGasWei: String(row.max_fee_per_gas_wei),
        maxPriorityFeePerGasWei: String(row.max_priority_fee_per_gas_wei),
        txHash: String(row.tx_hash),
        status: String(row.status) as JournalEntry["status"],
        errorCode: String(row.error_code),
        errorMessage: String(row.error_message),
        receiptJson: String(row.receipt_json),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
    };
}

function clone(entry: JournalEntry): JournalEntry {
    return JSON.parse(JSON.stringify(entry)) as JournalEntry;
}

function createEntry(id: number, params: PreparedInsertParams, timestamp: string): JournalEntry {
    return {
        id,
        idempotencyKey: params.idempotencyKey,
        profileName: params.profileName,
        chainId: params.chainId,
        command: params.command,
        toAddress: params.toAddress,
        fromAddress: params.fromAddress,
        valueWei: params.valueWei,
        dataHex: params.dataHex,
        nonce: params.nonce,
        gasLimit: params.gasLimit,
        maxFeePerGasWei: params.maxFeePerGasWei,
        maxPriorityFeePerGasWei: params.maxPriorityFeePerGasWei,
        txHash: "",
        status: params.status,
        errorCode: "",
        errorMessage: "",
        receiptJson: "",
        createdAt: timestamp,
        updatedAt: timestamp,
    };
}

export class JournalStore {
    private readonly dbPath: string;
    private readonly fallbackPath: string;
    private db: Database.Database | undefined;
    private fallback: FileJournalPayload = { nextId: 1, entries: [] };

    constructor(path: string) {
        this.dbPath = path;
        this.fallbackPath = `${path}.json`;

        try {
            this.db = new Database(path);
            this.db.pragma("journal_mode = WAL");
            this.db.exec(`
        CREATE TABLE IF NOT EXISTS tx_journal (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          idempotency_key TEXT NOT NULL UNIQUE,
          profile_name TEXT NOT NULL,
          chain_id INTEGER NOT NULL,
          command TEXT NOT NULL,
          to_address TEXT NOT NULL,
          from_address TEXT NOT NULL DEFAULT '',
          value_wei TEXT NOT NULL DEFAULT '0',
          data_hex TEXT NOT NULL DEFAULT '0x',
          nonce INTEGER NOT NULL DEFAULT -1,
          gas_limit TEXT NOT NULL DEFAULT '',
          max_fee_per_gas_wei TEXT NOT NULL DEFAULT '',
          max_priority_fee_per_gas_wei TEXT NOT NULL DEFAULT '',
          tx_hash TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL,
          error_code TEXT NOT NULL DEFAULT '',
          error_message TEXT NOT NULL DEFAULT '',
          receipt_json TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_tx_journal_tx_hash ON tx_journal(tx_hash);
        CREATE INDEX IF NOT EXISTS idx_tx_journal_status ON tx_journal(status);
      `);
        } catch {
            this.db = undefined;
            this.loadFallback();
        }
    }

    close(): void {
        if (this.db) {
            this.db.close();
        }
    }

    private loadFallback(): void {
        if (!fs.existsSync(this.fallbackPath)) {
            this.fallback = { nextId: 1, entries: [] };
            return;
        }

        try {
            const parsed = JSON.parse(fs.readFileSync(this.fallbackPath, "utf8")) as FileJournalPayload;
            this.fallback = parsed;
        } catch {
            this.fallback = { nextId: 1, entries: [] };
        }
    }

    private saveFallback(): void {
        fs.writeFileSync(this.fallbackPath, `${JSON.stringify(this.fallback, null, 2)}\n`, "utf8");
    }

    private getByIdempotencyKeyFallback(idempotencyKey: string): JournalEntry | undefined {
        const found = this.fallback.entries.find((entry) => entry.idempotencyKey === idempotencyKey);
        return found ? clone(found) : undefined;
    }

    private getByTxHashFallback(txHash: string): JournalEntry | undefined {
        const found = this.fallback.entries.find((entry) => entry.txHash === txHash);
        return found ? clone(found) : undefined;
    }

    upsertPrepared(params: PreparedInsertParams): JournalEntry {
        const timestamp = new Date().toISOString();

        if (!this.db) {
            const existingIndex = this.fallback.entries.findIndex((entry) => entry.idempotencyKey === params.idempotencyKey);

            if (existingIndex >= 0) {
                const existing = this.fallback.entries[existingIndex];
                this.fallback.entries[existingIndex] = {
                    ...existing,
                    ...createEntry(existing.id, params, existing.createdAt),
                    createdAt: existing.createdAt,
                    updatedAt: timestamp,
                };
            } else {
                this.fallback.entries.push(createEntry(this.fallback.nextId++, params, timestamp));
            }

            this.saveFallback();
            return this.getByIdempotencyKeyFallback(params.idempotencyKey) as JournalEntry;
        }

        const statement = this.db.prepare(`
      INSERT INTO tx_journal (
        idempotency_key,
        profile_name,
        chain_id,
        command,
        to_address,
        from_address,
        value_wei,
        data_hex,
        nonce,
        gas_limit,
        max_fee_per_gas_wei,
        max_priority_fee_per_gas_wei,
        status,
        created_at,
        updated_at
      ) VALUES (
        @idempotencyKey,
        @profileName,
        @chainId,
        @command,
        @toAddress,
        @fromAddress,
        @valueWei,
        @dataHex,
        @nonce,
        @gasLimit,
        @maxFeePerGasWei,
        @maxPriorityFeePerGasWei,
        @status,
        @createdAt,
        @updatedAt
      )
      ON CONFLICT(idempotency_key) DO UPDATE SET
        profile_name = excluded.profile_name,
        chain_id = excluded.chain_id,
        command = excluded.command,
        to_address = excluded.to_address,
        from_address = excluded.from_address,
        value_wei = excluded.value_wei,
        data_hex = excluded.data_hex,
        nonce = excluded.nonce,
        gas_limit = excluded.gas_limit,
        max_fee_per_gas_wei = excluded.max_fee_per_gas_wei,
        max_priority_fee_per_gas_wei = excluded.max_priority_fee_per_gas_wei,
        status = excluded.status,
        updated_at = excluded.updated_at
    `);

        statement.run({
            ...params,
            createdAt: timestamp,
            updatedAt: timestamp,
        });

        const entry = this.getByIdempotencyKey(params.idempotencyKey);
        if (!entry) {
            throw new Error("Journal write failed");
        }

        return entry;
    }

    markSubmitted(params: SubmittedUpdateParams): JournalEntry {
        if (!this.db) {
            const existing = this.fallback.entries.find((entry) => entry.idempotencyKey === params.idempotencyKey);
            if (!existing) {
                throw new Error("Journal update failed");
            }

            existing.txHash = params.txHash;
            existing.status = params.status;
            existing.errorCode = params.errorCode;
            existing.errorMessage = params.errorMessage;
            existing.updatedAt = new Date().toISOString();

            this.saveFallback();
            return clone(existing);
        }

        this.db
            .prepare(
                `
      UPDATE tx_journal
      SET tx_hash = @txHash,
          status = @status,
          error_code = @errorCode,
          error_message = @errorMessage,
          updated_at = @updatedAt
      WHERE idempotency_key = @idempotencyKey
    `,
            )
            .run({
                ...params,
                updatedAt: new Date().toISOString(),
            });

        const entry = this.getByIdempotencyKey(params.idempotencyKey);
        if (!entry) {
            throw new Error("Journal update failed");
        }

        return entry;
    }

    markConfirmed(idempotencyKey: string, receiptJson: string): JournalEntry {
        if (!this.db) {
            const existing = this.fallback.entries.find((entry) => entry.idempotencyKey === idempotencyKey);
            if (!existing) {
                throw new Error("Journal confirmation update failed");
            }

            existing.status = "confirmed";
            existing.receiptJson = receiptJson;
            existing.updatedAt = new Date().toISOString();

            this.saveFallback();
            return clone(existing);
        }

        this.db
            .prepare(
                `
      UPDATE tx_journal
      SET status = 'confirmed',
          receipt_json = @receiptJson,
          updated_at = @updatedAt
      WHERE idempotency_key = @idempotencyKey
    `,
            )
            .run({
                idempotencyKey,
                receiptJson,
                updatedAt: new Date().toISOString(),
            });

        const entry = this.getByIdempotencyKey(idempotencyKey);
        if (!entry) {
            throw new Error("Journal confirmation update failed");
        }

        return entry;
    }

    markFailed(idempotencyKey: string, errorCode: string, errorMessage: string): JournalEntry | undefined {
        if (!this.db) {
            const existing = this.fallback.entries.find((entry) => entry.idempotencyKey === idempotencyKey);
            if (!existing) {
                return undefined;
            }

            existing.status = "failed";
            existing.errorCode = errorCode;
            existing.errorMessage = errorMessage;
            existing.updatedAt = new Date().toISOString();

            this.saveFallback();
            return clone(existing);
        }

        this.db
            .prepare(
                `
      UPDATE tx_journal
      SET status = 'failed',
          error_code = @errorCode,
          error_message = @errorMessage,
          updated_at = @updatedAt
      WHERE idempotency_key = @idempotencyKey
    `,
            )
            .run({
                idempotencyKey,
                errorCode,
                errorMessage,
                updatedAt: new Date().toISOString(),
            });

        return this.getByIdempotencyKey(idempotencyKey);
    }

    getByIdempotencyKey(idempotencyKey: string): JournalEntry | undefined {
        if (!this.db) {
            return this.getByIdempotencyKeyFallback(idempotencyKey);
        }

        const row = this.db
            .prepare("SELECT * FROM tx_journal WHERE idempotency_key = ? LIMIT 1")
            .get(idempotencyKey) as Record<string, unknown> | undefined;

        if (!row) {
            return undefined;
        }

        return mapRow(row);
    }

    getByTxHash(txHash: string): JournalEntry | undefined {
        if (!this.db) {
            return this.getByTxHashFallback(txHash);
        }

        const row = this.db
            .prepare("SELECT * FROM tx_journal WHERE tx_hash = ? LIMIT 1")
            .get(txHash) as Record<string, unknown> | undefined;

        if (!row) {
            return undefined;
        }

        return mapRow(row);
    }

    listRecent(limit = 20): JournalEntry[] {
        if (!this.db) {
            return this.fallback.entries
                .slice()
                .sort((a, b) => b.id - a.id)
                .slice(0, limit)
                .map((entry) => clone(entry));
        }

        const rows = this.db
            .prepare("SELECT * FROM tx_journal ORDER BY id DESC LIMIT ?")
            .all(limit) as Record<string, unknown>[];

        return rows.map((row) => mapRow(row));
    }
}
