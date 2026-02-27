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

    it("throws for malformed env name", () => {
        expect(() => parseSigner("env:agcli_key")).toThrowError();
    });
});
