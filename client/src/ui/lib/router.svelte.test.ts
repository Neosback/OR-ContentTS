import { describe, expect, it } from "vitest";

import { router } from "./router.svelte";

describe("router", () => {
    it("pushes, replaces and reads query params", () => {
        router.navigate("/map/editor?cx=1");
        expect(router.path).toBe("/map/editor");
        expect(router.params.get("cx")).toBe("1");

        const length = window.history.length;
        router.setSearchParams({ cx: "2", cy: "3" });
        expect(router.search).toBe("?cx=2&cy=3");
        expect(window.history.length).toBe(length);

        router.navigate("/interface");
        expect(router.path).toBe("/interface");
        expect(window.history.length).toBe(length + 1);
    });

    it("treats a route and its children as active, but / only exactly", () => {
        router.navigate("/map/viewer");
        expect(router.isActive("/map")).toBe(true);
        expect(router.isActive("/")).toBe(false);
        expect(router.isActive("/mapping")).toBe(false);
    });
});
