import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig, saveConfig, setActiveProfile, upsertProfile } from "./config";
import { CliConfig, ProfileConfig } from "./types";

const testHomes: string[] = [];

afterEach(() => {
    for (const home of testHomes.splice(0)) {
        fs.rmSync(home, { recursive: true, force: true });
    }
});

function createHome(): string {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "agcli-config-test-"));
    testHomes.push(home);
    return home;
}

function createProfile(name = "prod"): ProfileConfig {
    const now = new Date().toISOString();

    return {
        name,
        chain: "base",
        chainId: 8453,
        rpcUrl: "https://mainnet.base.org",
        signer: { type: "readonly" },
        policy: "default",
        createdAt: now,
        updatedAt: now,
    };
}

describe("agcli config", () => {
    it("writes and reads config", () => {
        const home = createHome();

        const initial: CliConfig = {
            schemaVersion: 1,
            profiles: {},
        };

        const withProfile = upsertProfile(initial, createProfile("prod"));
        const active = setActiveProfile(withProfile, "prod");

        saveConfig(active, home);

        const loaded = loadConfig(home);

        expect(loaded.activeProfile).toBe("prod");
        expect(loaded.profiles.prod.chainId).toBe(8453);
    });

    it("returns defaults when config does not exist", () => {
        const home = createHome();

        const loaded = loadConfig(home);

        expect(loaded.schemaVersion).toBe(1);
        expect(loaded.activeProfile).toBeUndefined();
        expect(loaded.profiles).toEqual({});
    });
});
