import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { afterEach, describe, expect, it } from "vitest";

import { runSignerKeychainImportCommand, runSignerKeychainListCommand, runSignerKeychainRemoveCommand } from "./signer";
import { CommandContext } from "../types";

const homes: string[] = [];

function createHome(): string {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "agcli-signer-cmd-test-"));
    homes.push(home);
    return home;
}

function createCtx(positionals: string[], flags: Record<string, string | boolean> = {}): CommandContext {
    return {
        commandPath: positionals,
        args: { positionals, flags },
        globals: { mode: "agent", json: true, yes: true },
    };
}

afterEach(() => {
    for (const home of homes.splice(0)) {
        fs.rmSync(home, { recursive: true, force: true });
    }

    delete process.env.AGCLI_HOME;
    delete process.env.AGCLI_KEYCHAIN_PASSPHRASE;
    delete process.env.AGCLI_PRIVATE_KEY;
});

describe("signer commands", () => {
    it("imports and lists keychain entries", async () => {
        process.env.AGCLI_HOME = createHome();
        process.env.AGCLI_KEYCHAIN_PASSPHRASE = "passphrase-123";
        process.env.AGCLI_PRIVATE_KEY = "0x1111111111111111111111111111111111111111111111111111111111111111";

        const importResult = await runSignerKeychainImportCommand(
            createCtx(["signer", "keychain", "import"], {
                "account-id": "bot",
                "private-key-env": "AGCLI_PRIVATE_KEY",
            }),
        );

        expect((importResult as { accountId: string }).accountId).toBe("bot");

        const listResult = await runSignerKeychainListCommand();
        expect((listResult as { entries: { accountId: string }[] }).entries[0].accountId).toBe("bot");
    });

    it("removes keychain entries", async () => {
        process.env.AGCLI_HOME = createHome();
        process.env.AGCLI_KEYCHAIN_PASSPHRASE = "passphrase-123";
        process.env.AGCLI_PRIVATE_KEY = "0x1111111111111111111111111111111111111111111111111111111111111111";

        await runSignerKeychainImportCommand(
            createCtx(["signer", "keychain", "import"], {
                "account-id": "bot",
                "private-key-env": "AGCLI_PRIVATE_KEY",
            }),
        );

        const removeResult = await runSignerKeychainRemoveCommand(
            createCtx(["signer", "keychain", "remove"], {
                "account-id": "bot",
            }),
        );

        expect((removeResult as { removed: boolean }).removed).toBe(true);
    });
});
