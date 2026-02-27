import { describe, expect, it } from "vitest";

import { isDomainStubRoot, listDomainStubRoots } from "./stubs";

describe("domain stub roots", () => {
    it("includes all mapped domain families", () => {
        expect(isDomainStubRoot("auction")).toBe(true);
        expect(isDomainStubRoot("staking")).toBe(true);
    });

    it("exposes stub roots list", () => {
        expect(listDomainStubRoots()).toContain("baazaar");
        expect(listDomainStubRoots()).toContain("token");
    });
});
