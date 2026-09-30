import "fake-indexeddb/auto";

import { describe, expect, it } from "vitest";

import {
    IndexedDbProjectStore,
    PROJECT_STORE_OBJECT_STORE,
} from "./indexeddb-project-store";
let dbCounter = 0;

function createStore(now = 1_700_000_000_000): IndexedDbProjectStore {
    dbCounter += 1;
    return new IndexedDbProjectStore({
        dbName: "openrune-project-store-test-" + dbCounter,
        now: () => now,
        idFactory: () => "project-" + dbCounter,
    });
}

const base = {
    kind: "cache" as const,
    game: "oldschool",
    revision: 225,
    profileId: "local-profile-1",
    name: "Local OSRS",
    fingerprint: "fixture:cache-225",
};

async function putRaw(dbName: string, value: unknown): Promise<void> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    try {
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction(PROJECT_STORE_OBJECT_STORE, "readwrite");
            transaction.objectStore(PROJECT_STORE_OBJECT_STORE).put(value);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
    } finally {
        db.close();
    }
}

describe("IndexedDbProjectStore", () => {
    it("creates, lists, loads, saves, and deletes multiple projects", async () => {
        const store = createStore();
        const first = await store.createProject({ id: "first", name: "First", base });
        const second = await store.createProject({ id: "second", name: "Second", base });

        expect((await store.listProjects()).map((project) => project.id).sort()).toEqual(["first", "second"]);
        expect(await store.loadProject(first.id)).toEqual(first);

        const renamed = { ...first, name: "Renamed", updatedAt: first.updatedAt + 100 };
        await store.saveProject(renamed);
        expect((await store.loadProject(first.id))?.name).toBe("Renamed");

        await store.deleteProject(second.id);
        expect(await store.loadProject(second.id)).toBeUndefined();
        expect((await store.listProjects()).map((project) => project.id)).toEqual(["first"]);
    });

    it("survives a new store instance using the same IndexedDB database", async () => {
        const dbName = "openrune-project-store-reload-" + ++dbCounter;
        const firstStore = new IndexedDbProjectStore({
            dbName,
            now: () => 100,
            idFactory: () => "persisted",
        });
        await firstStore.createProject({ name: "Persisted", base });

        const secondStore = new IndexedDbProjectStore({ dbName });
        expect((await secondStore.loadProject("persisted"))?.name).toBe("Persisted");
    });

    it("exports portable JSON and validates before import persistence", async () => {
        const store = createStore();
        const project = await store.createProject({ id: "portable", name: "Portable", base });
        const exported = await store.exportProject(project.id);

        await store.deleteProject(project.id);
        const imported = await store.importProject(exported);
        expect(imported).toEqual(project);

        await expect(store.importProject(exported)).rejects.toMatchObject({
            code: "CONFLICT",
        });

        const invalid = JSON.parse(exported);
        invalid.version = 99;
        await expect(store.importProject(JSON.stringify(invalid))).rejects.toMatchObject({
            code: "INVALID_PROJECT",
        });

        expect((await store.listProjects()).map((item) => item.id)).toEqual(["portable"]);
    });

    it("does not let a corrupt record break project listing", async () => {
        const dbName = "openrune-project-store-corrupt-" + ++dbCounter;
        const store = new IndexedDbProjectStore({
            dbName,
            now: () => 100,
            idFactory: () => "valid",
        });
        await store.createProject({ name: "Valid", base });

        await putRaw(dbName, { id: "corrupt", format: "not-a-project" });

        expect((await store.listProjects()).map((project) => project.id)).toEqual(["valid"]);
        await expect(store.loadProject("corrupt")).rejects.toMatchObject({
            code: "INVALID_PROJECT",
        });
    });

    it("reports missing exports and invalid project saves with typed errors", async () => {
        const store = createStore();

        await expect(store.exportProject("missing")).rejects.toMatchObject({
            code: "NOT_FOUND",
        });

        const project = await store.createProject({ id: "invalid-save", name: "Valid first", base });
        await expect(
            store.saveProject({ ...project, name: "" }),
        ).rejects.toMatchObject({ code: "INVALID_PROJECT" });
    });
});
