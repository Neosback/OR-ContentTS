import "fake-indexeddb/auto";

import { describe, expect, it } from "vitest";

import type { EditorTransaction } from "../mapeditor/editor-transaction";
import type {
    MapEditorHistoryEntry,
    MapEditorHistorySnapshot,
} from "../mapeditor/map-editor-history";
import { IndexedDbProjectStore } from "./indexeddb-project-store";
import {
    getAppliedHistoryTransactions,
    ProjectLifecycle,
    ProjectLifecycleError,
} from "./project-lifecycle";
import { decodeProjectV1 } from "./project-format-v1";

let dbCounter = 0;

const base = {
    kind: "cache" as const,
    game: "oldschool",
    revision: 240,
    profileId: "local:openrune-240",
    fingerprint: "fixture:openrune-240",
};

function createLifecycle() {
    dbCounter += 1;
    let clock = 1_000;
    const store = new IndexedDbProjectStore({
        dbName: "openrune-project-lifecycle-test-" + dbCounter,
        now: () => clock,
        idFactory: () => "project-" + dbCounter,
    });
    const lifecycle = new ProjectLifecycle(store, () => clock);
    return {
        lifecycle,
        store,
        setClock(value: number) {
            clock = value;
        },
    };
}

function transaction(id: string, underlayAfter: number): EditorTransaction {
    const mapId = (50 << 8) | 60;
    return {
        id,
        label: "Edit " + id,
        source: "underlay",
        timestamp: 500,
        mutations: [
            {
                kind: "map.tile",
                mapId,
                level: 0,
                localTileId: (4 << 8) | 5,
                before: { u: 1 },
                after: { u: underlayAfter },
            },
        ],
        mapIds: [mapId],
        tileCount: 1,
    };
}

function historyEntry(tx: EditorTransaction): MapEditorHistoryEntry {
    return {
        ...tx,
        tool: tx.source,
        deltas: [],
        objectDeltas: [],
    };
}

function history(
    transactions: EditorTransaction[],
    currentIndex = transactions.length - 1,
): MapEditorHistorySnapshot {
    return {
        entries: transactions.map(historyEntry),
        currentIndex,
        canUndo: currentIndex >= 0,
        canRedo: currentIndex < transactions.length - 1,
        editedMapIds: [],
    };
}

describe("ProjectLifecycle", () => {
    it("creates, renames, saves, opens, and closes a project", async () => {
        const { lifecycle, setClock } = createLifecycle();
        const created = await lifecycle.createProject({ name: "Map work", base });

        expect(lifecycle.getSnapshot()).toMatchObject({
            project: { id: created.id, name: "Map work" },
            dirty: false,
        });

        lifecycle.renameCurrentProject("Map work renamed");
        expect(lifecycle.getSnapshot().dirty).toBe(true);

        setClock(2_000);
        const saved = await lifecycle.saveProject();
        expect(saved.name).toBe("Map work renamed");
        expect(saved.updatedAt).toBe(2_000);
        expect(lifecycle.getSnapshot().dirty).toBe(false);

        lifecycle.closeProject();
        expect(lifecycle.getSnapshot().project).toBeUndefined();

        const opened = await lifecycle.openProject(saved.id);
        expect(opened.name).toBe("Map work renamed");
        expect(lifecycle.getSnapshot().dirty).toBe(false);
    });

    it("persists only transactions at or before the applied history cursor", async () => {
        const { lifecycle, store } = createLifecycle();
        const project = await lifecycle.createProject({ id: "cursor", name: "Cursor", base });
        const a = transaction("a", 2);
        const b = transaction("b", 3);
        const c = transaction("c", 4);

        const snapshot = history([a, b, c], 1);
        expect(getAppliedHistoryTransactions(snapshot).map((tx) => tx.id)).toEqual(["a", "b"]);

        lifecycle.syncFromHistory(snapshot);
        await lifecycle.saveProject();

        expect((await store.loadProject(project.id))?.edits.transactions.map((tx) => tx.id)).toEqual(["a", "b"]);
    });

    it("tracks undo and redo against the last saved applied edit state", async () => {
        const { lifecycle } = createLifecycle();
        await lifecycle.createProject({ name: "Undo project", base });
        const a = transaction("a", 2);

        lifecycle.syncFromHistory(history([a], 0));
        expect(lifecycle.getSnapshot().dirty).toBe(true);

        await lifecycle.saveProject();
        expect(lifecycle.getSnapshot().dirty).toBe(false);

        lifecycle.syncFromHistory(history([a], -1));
        expect(lifecycle.getSnapshot().dirty).toBe(true);

        lifecycle.syncFromHistory(history([a], 0));
        expect(lifecycle.getSnapshot().dirty).toBe(false);
    });

    it("requires explicit discard before replacing or closing a dirty project", async () => {
        const other = createLifecycle();
        await other.lifecycle.createProject({ id: "other", name: "Other", base });
        const otherSerialized = other.lifecycle.exportCurrentProject();


        const { lifecycle } = createLifecycle();
        await lifecycle.createProject({ name: "Dirty", base });
        lifecycle.syncFromHistory(history([transaction("a", 2)]));

        expect(() => lifecycle.closeProject()).toThrowError(ProjectLifecycleError);
        expect(() => lifecycle.closeProject()).toThrow(
            "Project has unsaved changes",
        );
        await expect(
            lifecycle.createProject({ id: "replacement", name: "Replacement", base }),
        ).rejects.toMatchObject({ code: "DIRTY_PROJECT" });
        await expect(lifecycle.importProject(otherSerialized)).rejects.toMatchObject({
            code: "DIRTY_PROJECT",
        });

        lifecycle.closeProject({ discardChanges: true });
        expect(lifecycle.getSnapshot().project).toBeUndefined();
    });

    it("exports current unsaved edits without implicitly saving them", async () => {
        const { lifecycle, store, setClock } = createLifecycle();
        const project = await lifecycle.createProject({ id: "export", name: "Export", base });
        lifecycle.syncFromHistory(history([transaction("a", 2)]));
        setClock(3_000);

        const exported = decodeProjectV1(lifecycle.exportCurrentProject());
        expect(exported.updatedAt).toBe(3_000);
        expect(exported.edits.transactions.map((tx) => tx.id)).toEqual(["a"]);

        const stored = await store.loadProject(project.id);
        expect(stored?.edits.transactions).toEqual([]);
        expect(lifecycle.getSnapshot().dirty).toBe(true);
    });

    it("save-as creates an independent project and edit-batch identity", async () => {
        const { lifecycle, store } = createLifecycle();
        const original = await lifecycle.createProject({ id: "original", name: "Original", base });
        lifecycle.syncFromHistory(history([transaction("a", 2)]));

        const copy = await lifecycle.saveProjectAs({ id: "copy", name: "Copy" });
        expect(copy.id).toBe("copy");
        expect(copy.name).toBe("Copy");
        expect(copy.edits.id).not.toBe(original.edits.id);
        expect(copy.edits.transactions.map((tx) => tx.id)).toEqual(["a"]);
        expect(lifecycle.getSnapshot().dirty).toBe(false);

        expect((await store.loadProject("original"))?.edits.transactions).toEqual([]);
        expect((await store.loadProject("copy"))?.edits.transactions.map((tx) => tx.id)).toEqual(["a"]);
    });

    it("imports and activates a portable project", async () => {
        const first = createLifecycle();
        const source = await first.lifecycle.createProject({ id: "portable", name: "Portable", base });
        first.lifecycle.syncFromHistory(history([transaction("a", 2)]));
        await first.lifecycle.saveProject();
        const serialized = first.lifecycle.exportCurrentProject();

        const second = createLifecycle();
        const imported = await second.lifecycle.importProject(serialized);

        expect(imported.id).toBe(source.id);
        expect(second.lifecycle.getSnapshot()).toMatchObject({
            project: { id: "portable" },
            dirty: false,
        });
        expect(second.lifecycle.getSnapshot().workingEdits?.transactions.map((tx) => tx.id)).toEqual(["a"]);
    });

    it("reports attempts to open a missing project with a lifecycle error", async () => {
        const { lifecycle } = createLifecycle();

        await expect(lifecycle.openProject("missing")).rejects.toMatchObject({
            code: "NOT_FOUND",
        });
    });
});
