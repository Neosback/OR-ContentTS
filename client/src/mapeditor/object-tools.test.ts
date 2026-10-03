import { describe, expect, it } from "vitest";

import type { LocType } from "../rs/config/loctype/LocType";
import type { IEditorPluginHost } from "./plugins/editor-plugin-host";
import { getObjectActionModel } from "./plugins/builtins/object-action-model";
import { getObjectDeleteModel, parseStoredDeleteSettings } from "./plugins/builtins/object-delete-model";
import { canPlaceAsNormalObject, placementProblem } from "./plugins/builtins/object-edit-runtime";
import { ObjectPickIndex, type EditorObjectRef } from "./webgl/sceneLocPicker";

const host = (): IEditorPluginHost & { notified: number; copyCancelled: number } => {
    const fake = {
        notified: 0,
        copyCancelled: 0,
        notifyWorkbenchStateChanged() { fake.notified++; },
        cancelObjectCopyPlacement() { fake.copyCancelled++; },
    };
    return fake as unknown as IEditorPluginHost & { notified: number; copyCancelled: number };
};

const loc = (overrides: Partial<LocType>): LocType => ({ models: [[1]], types: undefined, ...overrides }) as unknown as LocType;

describe("delete model", () => {
    it("reads saved settings and ignores junk", () => {
        expect(parseStoredDeleteSettings({ mode: "area", kinds: { wall: false, loc: "no" } })).toEqual({
            mode: "area",
            kinds: { loc: true, wall: false, wallDecoration: true, floorDecoration: true },
        });
        expect(parseStoredDeleteSettings("garbage").mode).toBe("single");
    });

    it("notifies only when the preview changes", () => {
        const h = host();
        const model = getObjectDeleteModel(h);
        const ref = { locTypeId: 5 } as EditorObjectRef;
        model.setPreview([ref], () => "Oak #5");
        model.setPreview([ref], () => "Oak #5");
        expect(h.notified).toBe(1);
        expect(getObjectDeleteModel(h).previewCount).toBe(1);
        getObjectDeleteModel(h).setKind("wall", false);
        expect(getObjectDeleteModel(h).allows("wall")).toBe(false);
    });
});

describe("object action model", () => {
    it("moves between modes, queues requests once and wraps the placement rotation", () => {
        const h = host();
        const actions = getObjectActionModel(h);
        actions.startPlace(7);
        expect(getObjectActionModel(h).mode).toBe("place");
        expect(getObjectActionModel(h).candidate).toBe(7);
        for (let i = 0; i < 5; i++) getObjectActionModel(h).rotatePlacement();
        expect(getObjectActionModel(h).placeRotation).toBe(1);
        actions.request({ type: "nudge", dx: 1, dy: 0 });
        expect(actions.takeRequests()).toEqual([{ type: "nudge", dx: 1, dy: 0 }]);
        expect(actions.takeRequests()).toEqual([]);
        getObjectActionModel(h).cancel();
        expect(getObjectActionModel(h).mode).toBeUndefined();
        expect(h.copyCancelled).toBeGreaterThan(0);
    });
});

describe("placement rules", () => {
    it("allows normal objects and says why other types cannot be placed", () => {
        expect(canPlaceAsNormalObject(loc({}))).toBe(true);
        expect(canPlaceAsNormalObject(loc({ types: [10, 22] as never }))).toBe(true);
        expect(canPlaceAsNormalObject(loc({ types: [0] as never }))).toBe(false);
        expect(placementProblem(loc({ types: [0] as never }))).toMatch(/Wall or roof/);
        expect(placementProblem(loc({ models: [] }))).toMatch(/No model/);
        expect(placementProblem(loc({}))).toBeUndefined();
    });
});

describe("ObjectPickIndex.listAt", () => {
    it("returns every object on a tile and nothing for an empty one", () => {
        const index = new ObjectPickIndex();
        const tile = { level: 0, tileX: 4, tileY: 4 };
        const floor = { tag: "1", flags: 0, x: 0, y: 0, height: 0, entity: { id: 9, type: 22, rotation: 0, level: 0, tileX: 4, tileY: 4, seqId: -1, seqRandomStart: false } };
        const wall = { tag: "2", flags: 0, x: 0, y: 0, height: 0, entity0: { id: 8, type: 0, rotation: 0, level: 0, tileX: 4, tileY: 4, seqId: -1, seqRandomStart: false } };
        const built = ObjectPickIndex.fromSceneLocData(1, 1, 257, { tiles: [{ ...tile, floorDecoration: floor }, { ...tile, wall }] } as never);
        expect(built.listAt(0, 4, 4).map((ref) => ref.kind).sort()).toEqual(["floorDecoration", "wall"]);
        expect(built.listAt(0, 5, 5)).toEqual([]);
        expect(index.listAt(0, 0, 0)).toEqual([]);
    });
});
