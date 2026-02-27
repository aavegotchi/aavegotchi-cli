import { describe, expect, it } from "vitest";

import { enforcePolicy } from "./policy";

describe("policy enforcement", () => {
    it("allows tx when under limits", () => {
        expect(() =>
            enforcePolicy({
                policy: {
                    name: "default",
                    maxValueWei: "100",
                    maxGasLimit: "500000",
                    maxFeePerGasWei: "1000000000",
                    maxPriorityFeePerGasWei: "100000000",
                    allowedTo: ["0x0000000000000000000000000000000000000001"],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
                to: "0x0000000000000000000000000000000000000001",
                valueWei: 50n,
                gasLimit: 100000n,
                maxFeePerGasWei: 10000000n,
                maxPriorityFeePerGasWei: 1000000n,
            }),
        ).not.toThrow();
    });

    it("blocks tx when allowlist fails", () => {
        expect(() =>
            enforcePolicy({
                policy: {
                    name: "strict",
                    allowedTo: ["0x0000000000000000000000000000000000000001"],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
                to: "0x0000000000000000000000000000000000000002",
            }),
        ).toThrowError();
    });
});
