import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { APP_FILE_COMMANDS, describePermissions, probeWrite } from "./folder-access";

const here = path.dirname(fileURLToPath(import.meta.url));
const tauriRoot = path.resolve(here, "../../../src-tauri");

describe("folder access", () => {
    it("lists exactly the file commands the app registers", () => {
        const lib = fs.readFileSync(path.join(tauriRoot, "src/lib.rs"), "utf8");
        const handler = /generate_handler!\[([\s\S]*?)\]/.exec(lib)?.[1] ?? "";
        const registered = [...handler.matchAll(/access::(fs_\w+)/g)].map((match) => match[1]);
        expect([...APP_FILE_COMMANDS].sort()).toEqual(registered.sort());
    });

    it("no longer depends on the Tauri fs plugin, whose folder scope cannot match hidden folders", () => {
        const capability = JSON.parse(fs.readFileSync(path.join(tauriRoot, "capabilities/default.json"), "utf8")) as { permissions: string[] };
        expect(capability.permissions.some((name) => name.startsWith("fs:"))).toBe(false);
    });

    it("summarizes read, write and delete as allowed and the rest as unavailable", () => {
        const rows = Object.fromEntries(describePermissions().map((row) => [row.id, row.allowed]));
        expect(rows).toEqual({ read: true, write: true, mkdir: true, delete: true, other: false });
        expect(describePermissions([]).every((row) => !row.allowed)).toBe(true);
    });

    it("write probe creates then removes its temporary file", async () => {
        const calls: string[] = [];
        const result = await probeWrite("/project", {
            join: async (...parts) => parts.join("/"),
            writeTextFile: async (file) => void calls.push(`write ${file}`),
            remove: async (file) => void calls.push(`remove ${file}`),
        });
        expect(result).toEqual({ ok: true, detail: "writable" });
        expect(calls).toEqual(["write /project/.openrune-write-test", "remove /project/.openrune-write-test"]);
    });

    it("write probe reports a forbidden folder, and a file it could not clean up", async () => {
        const forbidden = await probeWrite("/x", {
            join: async (...parts) => parts.join("/"),
            writeTextFile: async () => {
                throw "forbidden path: /x/.openrune-write-test";
            },
            remove: async () => {},
        });
        expect(forbidden.ok).toBe(false);
        expect(forbidden.detail).toContain("forbidden path");

        const stuck = await probeWrite("/x", {
            join: async (...parts) => parts.join("/"),
            writeTextFile: async () => {},
            remove: async () => {
                throw new Error("busy");
            },
        });
        expect(stuck.ok).toBe(true);
        expect(stuck.detail).toContain("could not be removed");
    });
});
