import { describe, expect, it } from "vitest";

import goldenFixture from "./fixtures/project-v1.golden.json";
import { decodeProjectV1 } from "./project-format-v1";
import { toProjectSummary } from "./project-store";

describe("ProjectStore contract types", () => {
    it("summarizes authoritative project metadata without edit/runtime state", () => {
        const project = decodeProjectV1(goldenFixture);
        const summary = toProjectSummary(project);

        expect(summary).toEqual({
            id: "golden-project-v1",
            name: "Golden project",
            createdAt: 1_700_000_000_000,
            updatedAt: 1_700_000_000_100,
            base: project.base,
        });
        expect(summary).not.toHaveProperty("edits");
        expect(summary).not.toHaveProperty("history");
        expect(summary).not.toHaveProperty("dockLayout");
    });

    it("returns a detached base identity", () => {
        const project = decodeProjectV1(goldenFixture);
        const summary = toProjectSummary(project);
        summary.base.name = "Changed";

        expect(project.base.name).toBe("OSRS revision 225");
    });
});
