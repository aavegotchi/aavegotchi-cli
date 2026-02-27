import { describe, expect, it } from "vitest";

import { parseSigner } from "./signer";

describe("agcli signer parser", () => {
    it("defaults to readonly when omitted", () => {
        expect(parseSigner()).toEqual({ type: "readonly" });
    });

    it("parses env signer", () => {
        expect(parseSigner("env:AGCLI_PRIVATE_KEY")).toEqual({
            type: "env",
            envVar: "AGCLI_PRIVATE_KEY",
        });
    });

    it("parses keychain signer", () => {
        expect(parseSigner("keychain:bot-account")).toEqual({
            type: "keychain",
            accountId: "bot-account",
        });
    });

    it("parses ledger signer", () => {
        expect(parseSigner("ledger:m/44'/60'/0'/0/0")).toEqual({
            type: "ledger",
            derivationPath: "m/44'/60'/0'/0/0",
        });
    });

    it("parses ledger signer with address and bridge env", () => {
        expect(
            parseSigner("ledger:m/44'/60'/0'/0/0|0x0000000000000000000000000000000000000001|AGCLI_LEDGER_CMD"),
        ).toEqual({
            type: "ledger",
            derivationPath: "m/44'/60'/0'/0/0",
            address: "0x0000000000000000000000000000000000000001",
            bridgeCommandEnvVar: "AGCLI_LEDGER_CMD",
        });
    });

    it("parses remote signer", () => {
        expect(parseSigner("remote:https://signer.example.com")).toEqual({
            type: "remote",
            url: "https://signer.example.com",
        });
    });

    it("parses remote signer with address and auth env", () => {
        expect(
            parseSigner("remote:https://signer.example.com|0x0000000000000000000000000000000000000001|AGCLI_REMOTE_TOKEN"),
        ).toEqual({
            type: "remote",
            url: "https://signer.example.com",
            address: "0x0000000000000000000000000000000000000001",
            authEnvVar: "AGCLI_REMOTE_TOKEN",
        });
    });

    it("parses bankr signer defaults", () => {
        expect(parseSigner("bankr")).toEqual({
            type: "bankr",
        });
    });

    it("parses bankr signer with address, api env, and api url", () => {
        expect(
            parseSigner("bankr:0x0000000000000000000000000000000000000001|BANKR_KEY|https://api.bankr.bot"),
        ).toEqual({
            type: "bankr",
            address: "0x0000000000000000000000000000000000000001",
            apiKeyEnvVar: "BANKR_KEY",
            apiUrl: "https://api.bankr.bot",
        });
    });

    it("throws for malformed env name", () => {
        expect(() => parseSigner("env:agcli_key")).toThrowError();
    });
});
