import { describe, expect, it } from "vitest";

import { isDomainStubRoot } from "./stubs";

describe("domain stub roots", () => {
    it("includes all mapped domain families", () => {
        expect(isDomainStubRoot("auction")).toBe(true);
        expect(isDomainStubRoot("staking")).toBe(true);
        expect(isDomainStubRoot("gotchi-points")).toBe(true);
    });
});
