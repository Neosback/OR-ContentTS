import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { inlineGlslIncludes } from "./plugins.mts";

describe("inlineGlslIncludes", () => {
    it("inlines nested includes relative to the including file and reports them", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "glsl-"));
        fs.mkdirSync(path.join(dir, "inc"));
        fs.writeFileSync(path.join(dir, "inc", "a.glsl"), 'float a;\n#include "./b.glsl";\n');
        fs.writeFileSync(path.join(dir, "inc", "b.glsl"), "float b;\n");
        const main = path.join(dir, "main.glsl");
        const included: string[] = [];

        const out = inlineGlslIncludes('void main() {}\n#include "./inc/a.glsl";\n', main, (f) => included.push(path.basename(f)));

        expect(out).toContain("float a;");
        expect(out).toContain("float b;");
        expect(out).not.toContain("#include");
        expect(included).toEqual(["a.glsl", "b.glsl"]);
    });
});
