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

    it("parses remote signer", () => {
        expect(parseSigner("remote:https://signer.example.com")).toEqual({
            type: "remote",
            url: "https://signer.example.com",
        });
    });

    it("throws for malformed env name", () => {
        expect(() => parseSigner("env:agcli_key")).toThrowError();
    });
});
