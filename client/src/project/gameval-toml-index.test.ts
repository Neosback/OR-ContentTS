import { describe, expect, it } from "vitest";

import { InMemoryProjectFileSystem } from "./in-memory-project-filesystem";
import {
    buildGameValTomlIndex,
    findGameValTomlId,
    findGameValTomlSymbol,
    indexProjectGameValToml,
    parseGameValToml,
} from "./gameval-toml-index";

describe("parseGameValToml", () => {
    it("parses supported [gamevals.<table>] sections with source provenance", () => {
        const parsed = parseGameValToml(
            "content/skills/woodcutting/gamevals.toml",
            [
                "# declarations",
                "[gamevals.loc]",
                "tree = 50000",
                "willow=-1",
                "",
                "[gamevals.obj]",
                "logs = 60000",
            ].join("\n"),
            "content/skills/woodcutting",
        );

        expect(parsed.entries).toEqual([
            {
                table: "loc",
                key: "tree",
                symbol: "loc.tree",
                id: 50000,
                sourcePath: "content/skills/woodcutting/gamevals.toml",
                line: 3,
                modulePath: "content/skills/woodcutting",
            },
            {
                table: "loc",
                key: "willow",
                symbol: "loc.willow",
                id: -1,
                sourcePath: "content/skills/woodcutting/gamevals.toml",
                line: 4,
                modulePath: "content/skills/woodcutting",
            },
            {
                table: "obj",
                key: "logs",
                symbol: "obj.logs",
                id: 60000,
                sourcePath: "content/skills/woodcutting/gamevals.toml",
                line: 7,
                modulePath: "content/skills/woodcutting",
            },
        ]);
        expect(parsed.issues).toEqual([]);
    });

    it("preserves grouped keys containing colons", () => {
        const parsed = parseGameValToml(
            "content/ui/gamevals.toml",
            "[gamevals.component]\nchatbox:input = 10616833",
        );

        expect(parsed.entries[0]).toMatchObject({
            table: "component",
            key: "chatbox:input",
            symbol: "component.chatbox:input",
            id: 10616833,
        });
    });

    it("ignores unrelated TOML sections and diagnoses unsupported GameVal tables", () => {
        const parsed = parseGameValToml(
            "content/test/gamevals.toml",
            [
                "[metadata]",
                "name = 123",
                "[gamevals.not_real]",
                "foo = 1",
                "[gamevals.npc]",
                "boss = 70000",
            ].join("\n"),
        );

        expect(parsed.entries.map((entry) => entry.symbol)).toEqual(["npc.boss"]);
        expect(parsed.issues).toMatchObject([
            {
                code: "UNSUPPORTED_TABLE",
                table: "not_real",
                line: 3,
            },
        ]);
    });

    it("mirrors OpenRune loader behavior for malformed and non-integer values", () => {
        const parsed = parseGameValToml(
            "content/test/gamevals.toml",
            [
                "[gamevals.varp]",
                "good = 70000",
                "missing_equals",
                "= 70001",
                "inline_comment = 70002 # OpenRune loader does not strip this",
                "too_negative = -2",
                "fraction = 1.5",
                "also_good = +70003",
            ].join("\n"),
        );

        expect(parsed.entries.map((entry) => [entry.key, entry.id])).toEqual([
            ["good", 70000],
            ["also_good", 70003],
        ]);
        expect(parsed.issues.map((issue) => issue.code)).toEqual([
            "MALFORMED_ENTRY",
            "MALFORMED_ENTRY",
            "INVALID_ID",
            "INVALID_ID",
            "INVALID_ID",
        ]);
    });
});

describe("buildGameValTomlIndex", () => {
    it("detects duplicate symbols, conflicting symbols, and table-local id conflicts", () => {
        const index = buildGameValTomlIndex([
            parseGameValToml(
                "content/a/gamevals.toml",
                "[gamevals.loc]\na = 50000\nb = 50001\nc = 50001",
            ),
            parseGameValToml(
                "content/b/gamevals.toml",
                "[gamevals.loc]\na = 50000\nb = 50002",
            ),
        ]);

        expect(index.issues.map((issue) => issue.code)).toEqual([
            "ID_CONFLICT",
            "DUPLICATE_SYMBOL",
            "SYMBOL_CONFLICT",
        ]);
        expect(findGameValTomlSymbol(index, "loc.a")).toHaveLength(2);
        expect(findGameValTomlSymbol(index, "loc.b").map((entry) => entry.id)).toEqual([
            50001,
            50002,
        ]);
        expect(findGameValTomlId(index, "loc", 50001).map((entry) => entry.symbol)).toEqual([
            "loc.b",
            "loc.c",
        ]);
    });

    it("does not treat repeated -1 values as id conflicts", () => {
        const index = buildGameValTomlIndex([
            parseGameValToml(
                "content/a/gamevals.toml",
                "[gamevals.obj]\nfirst = -1\nsecond = -1",
            ),
        ]);

        expect(index.issues).toEqual([]);
        expect(findGameValTomlId(index, "obj", -1)).toEqual([]);
    });
});

describe("indexProjectGameValToml", () => {
    it("loads project-indexed files deterministically and retains module association", async () => {
        const fs = new InMemoryProjectFileSystem({
            "api/account/gamevals.toml": "[gamevals.varp]\naccount_state = 70000",
            "content/skills/woodcutting/gamevals.toml":
                "[gamevals.loc]\ntree = 50000",
        });

        const index = await indexProjectGameValToml(fs, {
            gameValTomlFiles: [
                "content/skills/woodcutting/gamevals.toml",
                "api/account/gamevals.toml",
            ],
            modules: [
                {
                    path: "api/account",
                    name: "account",
                    buildFile: "api/account/build.gradle.kts",
                    family: "api",
                    isPackModule: false,
                    packRoots: [],
                    gameValTomlFiles: ["api/account/gamevals.toml"],
                },
                {
                    path: "content/skills/woodcutting",
                    name: "woodcutting",
                    buildFile: "content/skills/woodcutting/build.gradle.kts",
                    family: "content",
                    isPackModule: false,
                    packRoots: [],
                    gameValTomlFiles: ["content/skills/woodcutting/gamevals.toml"],
                },
            ],
        });

        expect(index.files.map((file) => [file.sourcePath, file.modulePath])).toEqual([
            ["api/account/gamevals.toml", "api/account"],
            [
                "content/skills/woodcutting/gamevals.toml",
                "content/skills/woodcutting",
            ],
        ]);
        expect(index.entries.map((entry) => entry.symbol)).toEqual([
            "loc.tree",
            "varp.account_state",
        ]);
    });
});
