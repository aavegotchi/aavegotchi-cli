import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { describe, expect, it } from "vitest";

import { buildHelpText } from "./output";

describe("help output", () => {
    it("prints global help with command-specific hint", () => {
        const text = buildHelpText([]);
        expect(text).toContain("ag <command> --help");
        expect(text).toContain("ag help <command>");
    });

    it("prints mapped write help for buy-now", () => {
        const text = buildHelpText(["baazaar", "buy-now"]);
        expect(text).toContain("Mapped to onchain function:");
        expect(text).toContain("buyNow");
        expect(text).toContain("--args-json");
    });

    it("prints ABI-derived mapped function signature when --abi-file is supplied", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agcli-help-"));
        const abiPath = path.join(dir, "baazaar.json");
        fs.writeFileSync(
            abiPath,
            JSON.stringify([
                {
                    type: "function",
                    name: "buyNow",
                    stateMutability: "nonpayable",
                    inputs: [
                        { name: "_listingId", type: "uint256" },
                        { name: "_quantity", type: "uint256" },
                        { name: "_priceInWei", type: "uint256" },
                    ],
                    outputs: [],
                },
            ]),
            "utf8",
        );

        const text = buildHelpText(["baazaar", "buy-now"], { "abi-file": abiPath });
        expect(text).toContain("buyNow(uint256,uint256,uint256)");
        expect(text).toContain("_listingId");
        expect(text).toContain("_quantity");
        expect(text).toContain("_priceInWei");
    });
});
