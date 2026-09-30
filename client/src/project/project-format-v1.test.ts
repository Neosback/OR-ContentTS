import { describe, expect, it } from "vitest";

import goldenFixture from "./fixtures/project-v1.golden.json";
import { PROJECT_FORMAT_V1_SCHEMA, decodeProjectV1, encodeProjectV1, validateProjectV1 } from "./project-format-v1";
import { ProjectFormatV1Error } from "./project-errors";

describe("Project Format v1", () => {
    it("decodes and round-trips the portable golden fixture", () => {
        const project = decodeProjectV1(goldenFixture);
        expect(project.id).toBe("golden-project-v1");
        expect(project.base).toEqual({
            kind: "cache",
            game: "oldschool",
            revision: 225,
            name: "OSRS revision 225",
            fingerprint: "fixture:osrs-225",
        });
        expect(decodeProjectV1(encodeProjectV1(project))).toEqual(project);
    });

    it("rejects unknown fields, unsupported versions, and invalid timestamps", () => {
        const invalid = structuredClone(goldenFixture) as any;
        invalid.extra = true;
        invalid.version = 2;
        invalid.updatedAt = invalid.createdAt - 1;

        const result = validateProjectV1(invalid);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.issues.map((issue) => issue.path)).toContain("$.extra");
            expect(result.issues.map((issue) => issue.path)).toContain("$.version");
            expect(result.issues.map((issue) => issue.path)).toContain("$.updatedAt");
        }
    });

    it("rejects invalid nested Edit Format documents with project-relative paths", () => {
        const invalid = structuredClone(goldenFixture) as any;
        invalid.edits.version = 99;

        const result = validateProjectV1(invalid);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.issues).toContainEqual({
                path: "$.edits.version",
                message: "Expected version 1.",
            });
        }
    });

    it("rejects malformed JSON", () => {
        expect(() => decodeProjectV1("{")).toThrow(ProjectFormatV1Error);
    });

    it("exports a machine-readable project schema", () => {
        expect(PROJECT_FORMAT_V1_SCHEMA.$id).toBe("urn:openrune:project:v1");
        expect(PROJECT_FORMAT_V1_SCHEMA.properties.version.const).toBe(1);
        expect(PROJECT_FORMAT_V1_SCHEMA.properties.edits.$ref).toBe("urn:openrune:edit-batch:v1");
    });
});
