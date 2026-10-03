import { describe, expect, it } from "vitest";

import { InMemoryProjectFileSystem } from "./in-memory-project-filesystem";
import { explainRejection, locateOpenRuneProject, looksLikeOpenRuneRoot } from "./openrune-project-locator";
import { ScopedProjectFileSystem } from "./scoped-project-filesystem";

const projectFiles = (prefix = ""): Record<string, string> => ({
    [`${prefix}settings.gradle.kts`]: 'rootProject.name = "OpenRune"',
    [`${prefix}or-cache/build.gradle.kts`]: "",
    [`${prefix}game.yml`]: "name: Test\nrevision: 237",
});

describe("ScopedProjectFileSystem", () => {
    it("sees a subfolder as its own root and cannot leave it", async () => {
        const inner = new InMemoryProjectFileSystem({ "outer.txt": "outside", "proj/a.txt": "inside", "proj/dir/b.txt": "b" });
        const scoped = new ScopedProjectFileSystem(inner, "proj");
        expect(await scoped.readText("a.txt")).toBe("inside");
        expect((await scoped.list("")).map((entry) => entry.path).sort()).toEqual(["a.txt", "dir"]);
        expect(await scoped.exists("outer.txt")).toBe(false);
        await expect(scoped.readText("../outer.txt")).rejects.toThrow();
    });
});

describe("locateOpenRuneProject", () => {
    it("accepts the repository root", async () => {
        const fs = new InMemoryProjectFileSystem(projectFiles());
        expect(await looksLikeOpenRuneRoot(fs)).toBe(true);
        const result = await locateOpenRuneProject(fs);
        expect(result.kind).toBe("project");
    });

    it("finds a project inside the picked folder (a workspace folder, one or two levels down)", async () => {
        const fs = new InMemoryProjectFileSystem({
            "notes.txt": "x",
            ...projectFiles("OpenRune-Server-main/"),
            "other/readme.md": "x",
        });
        const result = await locateOpenRuneProject(fs);
        expect(result).toEqual({ kind: "nested", candidates: [{ subPath: "OpenRune-Server-main", name: "OpenRune-Server-main" }] });

        const deeper = await locateOpenRuneProject(new InMemoryProjectFileSystem(projectFiles("work/OR/")));
        expect(deeper).toMatchObject({ kind: "nested", candidates: [{ subPath: "work/OR" }] });
    });

    it("lists every project when there are several, and skips build and hidden folders", async () => {
        const fs = new InMemoryProjectFileSystem({
            ...projectFiles("a/"),
            ...projectFiles("b/"),
            ...projectFiles("build/ignored/"),
            ...projectFiles(".hidden/x/"),
        });
        const result = await locateOpenRuneProject(fs);
        expect(result.kind === "nested" && result.candidates.map((c) => c.subPath)).toEqual(["a", "b"]);
    });

    it("explains why a folder is not a project", async () => {
        const module = await locateOpenRuneProject(new InMemoryProjectFileSystem({ "build.gradle.kts": "", "src/Main.kt": "" }));
        expect(module).toMatchObject({ kind: "rejected", rejection: { code: "INSIDE_PROJECT" } });

        const generic = await locateOpenRuneProject(new InMemoryProjectFileSystem({ "settings.gradle.kts": "", "src/Main.kt": "" }));
        expect(generic).toMatchObject({ kind: "rejected", rejection: { code: "MISSING_MARKERS", found: ["settings.gradle.kts"] } });

        const other = await locateOpenRuneProject(new InMemoryProjectFileSystem({ "photo.png": "", "docs/a.md": "" }));
        expect(other).toMatchObject({ kind: "rejected", rejection: { code: "NO_GRADLE" } });
        expect(other.kind === "rejected" && other.rejection.message).toContain("photo.png");
    });

    it("reports an unreadable folder", async () => {
        const broken = new InMemoryProjectFileSystem({ "x.txt": "" });
        broken.list = async () => {
            throw new Error("denied");
        };
        expect((await explainRejection(broken)).code).toBe("UNREADABLE");
    });

    it("stops searching after the folder budget", async () => {
        const files: Record<string, string> = {};
        for (let i = 0; i < 20; i++) files[`d${String(i).padStart(2, "0")}/x.txt`] = "";
        Object.assign(files, projectFiles("zz/"));
        const result = await locateOpenRuneProject(new InMemoryProjectFileSystem(files), { maxDirectories: 5 });
        expect(result.kind).toBe("rejected");
    });
});
