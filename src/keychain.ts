import * as crypto from "crypto";
import * as fs from "fs";

import { privateKeyToAccount } from "viem/accounts";

import { resolveAgcliHome, resolveKeychainPath } from "./config";
import { CliError } from "./errors";

interface KeychainEntry {
    accountId: string;
    address: `0x${string}`;
    ivHex: string;
    saltHex: string;
    tagHex: string;
    ciphertextHex: string;
    createdAt: string;
    updatedAt: string;
}

interface KeychainFile {
    schemaVersion: 1;
    entries: Record<string, KeychainEntry>;
}

function nowIso(): string {
    return new Date().toISOString();
}

function createDefaultFile(): KeychainFile {
    return {
        schemaVersion: 1,
        entries: {},
    };
}

function getPassphrase(): string {
    const value = process.env.AGCLI_KEYCHAIN_PASSPHRASE;
    if (!value || value.length < 8) {
        throw new CliError(
            "MISSING_KEYCHAIN_PASSPHRASE",
            "Set AGCLI_KEYCHAIN_PASSPHRASE (8+ chars) to use keychain signer backend.",
            2,
        );
    }

    return value;
}

function deriveKey(passphrase: string, saltHex: string): Buffer {
    return crypto.scryptSync(passphrase, Buffer.from(saltHex, "hex"), 32);
}

function encryptPrivateKey(privateKey: `0x${string}`, passphrase: string): Omit<KeychainEntry, "accountId" | "address" | "createdAt" | "updatedAt"> {
    const iv = crypto.randomBytes(12);
    const salt = crypto.randomBytes(16);

    const key = deriveKey(passphrase, salt.toString("hex"));

    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(privateKey, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
        ivHex: iv.toString("hex"),
        saltHex: salt.toString("hex"),
        tagHex: tag.toString("hex"),
        ciphertextHex: ciphertext.toString("hex"),
    };
}

function decryptPrivateKey(entry: KeychainEntry, passphrase: string): `0x${string}` {
    const key = deriveKey(passphrase, entry.saltHex);

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(entry.ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(entry.tagHex, "hex"));

    const plaintext = Buffer.concat([
        decipher.update(Buffer.from(entry.ciphertextHex, "hex")),
        decipher.final(),
    ]).toString("utf8");

    if (!/^0x[0-9a-fA-F]{64}$/.test(plaintext)) {
        throw new CliError("INVALID_PRIVATE_KEY", "Decrypted keychain secret is not a valid private key.", 2);
    }

    return plaintext as `0x${string}`;
}

function loadKeychainFile(customHome?: string): KeychainFile {
    const keychainPath = resolveKeychainPath(customHome);

    if (!fs.existsSync(keychainPath)) {
        return createDefaultFile();
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(fs.readFileSync(keychainPath, "utf8"));
    } catch {
        throw new CliError("INVALID_KEYCHAIN", `Keychain file is not valid JSON: ${keychainPath}`, 2);
    }

    if (
        !parsed ||
        typeof parsed !== "object" ||
        (parsed as { schemaVersion?: number }).schemaVersion !== 1 ||
        typeof (parsed as { entries?: unknown }).entries !== "object"
    ) {
        throw new CliError("INVALID_KEYCHAIN", `Unsupported keychain format: ${keychainPath}`, 2);
    }

    return parsed as KeychainFile;
}

function saveKeychainFile(file: KeychainFile, customHome?: string): string {
    const home = resolveAgcliHome(customHome);
    const keychainPath = resolveKeychainPath(customHome);

    fs.mkdirSync(home, { recursive: true });

    const tmpPath = `${keychainPath}.tmp`;
    fs.writeFileSync(tmpPath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
    fs.renameSync(tmpPath, keychainPath);

    return keychainPath;
}

function parsePrivateKey(value: string, hint: string): `0x${string}` {
    if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
        throw new CliError("INVALID_PRIVATE_KEY", `${hint} is not a valid private key.`, 2);
    }

    return value as `0x${string}`;
}

export function keychainImportFromEnv(accountId: string, envVar: string, customHome?: string): { accountId: string; address: `0x${string}`; keychainPath: string } {
    if (!/^[A-Za-z0-9._-]+$/.test(accountId)) {
        throw new CliError("INVALID_ARGUMENT", "account-id may only contain letters, numbers, dot, underscore, dash.", 2);
    }

    if (!/^[A-Z_][A-Z0-9_]*$/.test(envVar)) {
        throw new CliError("INVALID_ARGUMENT", "private-key-env must be an uppercase env var name.", 2);
    }

    const privateKeyRaw = process.env[envVar];
    if (!privateKeyRaw) {
        throw new CliError("MISSING_SIGNER_SECRET", `Missing environment variable '${envVar}'.`, 2);
    }

    const privateKey = parsePrivateKey(privateKeyRaw, `Environment variable '${envVar}'`);
    const account = privateKeyToAccount(privateKey);
    const address = account.address.toLowerCase() as `0x${string}`;

    const passphrase = getPassphrase();
    const encrypted = encryptPrivateKey(privateKey, passphrase);

    const file = loadKeychainFile(customHome);
    const existing = file.entries[accountId];
    const timestamp = nowIso();

    file.entries[accountId] = {
        accountId,
        address,
        ...encrypted,
        createdAt: existing?.createdAt || timestamp,
        updatedAt: timestamp,
    };

    const keychainPath = saveKeychainFile(file, customHome);

    return {
        accountId,
        address,
        keychainPath,
    };
}

export function keychainList(customHome?: string): { accountId: string; address: `0x${string}`; updatedAt: string }[] {
    const file = loadKeychainFile(customHome);

    return Object.values(file.entries)
        .sort((a, b) => a.accountId.localeCompare(b.accountId))
        .map((entry) => ({
            accountId: entry.accountId,
            address: entry.address,
            updatedAt: entry.updatedAt,
        }));
}

export function keychainRemove(accountId: string, customHome?: string): { accountId: string; removed: boolean; keychainPath: string } {
    const file = loadKeychainFile(customHome);
    const removed = Boolean(file.entries[accountId]);

    if (removed) {
        delete file.entries[accountId];
    }

    const keychainPath = saveKeychainFile(file, customHome);

    return {
        accountId,
        removed,
        keychainPath,
    };
}

export function keychainResolvePrivateKey(accountId: string, customHome?: string): { privateKey: `0x${string}`; address: `0x${string}` } {
    const file = loadKeychainFile(customHome);
    const entry = file.entries[accountId];
    if (!entry) {
        throw new CliError("KEYCHAIN_ENTRY_NOT_FOUND", `No keychain entry for '${accountId}'.`, 2);
    }

    const passphrase = getPassphrase();
    const privateKey = decryptPrivateKey(entry, passphrase);

    const account = privateKeyToAccount(privateKey);
    if (account.address.toLowerCase() !== entry.address.toLowerCase()) {
        throw new CliError("KEYCHAIN_ADDRESS_MISMATCH", `Decrypted key does not match stored address for '${accountId}'.`, 2);
    }

    return {
        privateKey,
        address: entry.address.toLowerCase() as `0x${string}`,
    };
}
