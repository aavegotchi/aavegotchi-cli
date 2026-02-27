import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { afterEach, describe, expect, it } from "vitest";

import { keychainImportFromEnv, keychainList, keychainRemove, keychainResolvePrivateKey } from "./keychain";

const homes: string[] = [];

function createHome(): string {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "agcli-keychain-test-"));
    homes.push(home);
    return home;
}

afterEach(() => {
    for (const home of homes.splice(0)) {
        fs.rmSync(home, { recursive: true, force: true });
    }

    delete process.env.AGCLI_HOME;
    delete process.env.AGCLI_KEYCHAIN_PASSPHRASE;
    delete process.env.AGCLI_PRIVATE_KEY;
});

describe("keychain", () => {
    it("imports, resolves, lists and removes a keychain entry", () => {
        const home = createHome();
        process.env.AGCLI_HOME = home;
        process.env.AGCLI_KEYCHAIN_PASSPHRASE = "test-passphrase-123";
        process.env.AGCLI_PRIVATE_KEY = "0x1111111111111111111111111111111111111111111111111111111111111111";

        const imported = keychainImportFromEnv("bot", "AGCLI_PRIVATE_KEY");
        expect(imported.accountId).toBe("bot");
        expect(imported.address).toMatch(/^0x[a-f0-9]{40}$/);

        const listed = keychainList();
        expect(listed.length).toBe(1);
        expect(listed[0].accountId).toBe("bot");

        const resolved = keychainResolvePrivateKey("bot");
        expect(resolved.privateKey).toBe(process.env.AGCLI_PRIVATE_KEY);
        expect(resolved.address).toBe(imported.address);

        const removed = keychainRemove("bot");
        expect(removed.removed).toBe(true);
        expect(keychainList().length).toBe(0);
    });

    it("requires keychain passphrase", () => {
        const home = createHome();
        process.env.AGCLI_HOME = home;
        process.env.AGCLI_PRIVATE_KEY = "0x1111111111111111111111111111111111111111111111111111111111111111";

        expect(() => keychainImportFromEnv("bot", "AGCLI_PRIVATE_KEY")).toThrowError();
    });
});
