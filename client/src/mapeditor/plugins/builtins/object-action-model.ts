import type { IEditorPluginHost } from "../editor-plugin-host";

/**
 * What the Select tool is doing with an object besides picking it. Panels and keys set this; the renderer reads it each
 * frame to draw the ghost and to act on clicks, so the UI never needs a reference to the renderer.
 *
 * - `move`: the selected object follows the cursor as a ghost; a click puts it down.
 * - `place`: a new object of `locTypeId` follows the cursor; every click places one (Esc ends).
 * - the replace preview shows `candidate` standing where the selected object is, while the Replace button is hovered.
 */
export type ObjectActionMode = "move" | "place";

/** DataTransfer type used when an object row is dragged from the catalog onto the viewport. */
export const LOC_DRAG_TYPE = "application/x-openrune-loc";

export type ObjectActionRequest =
    | { type: "replace"; locTypeId: number }
    | { type: "nudge"; dx: number; dy: number }
    | { type: "delete-selected" }
    /** Places `locTypeId` with its start tile at a world tile right away (the viewport menu's "Place here"). */
    | { type: "place-at"; locTypeId: number; rotation: number; worldX: number; worldY: number; level: number };

type State = {
    mode?: ObjectActionMode;
    /** The object type picked in the catalog (used by Place and Replace). */
    candidate?: number;
    /** Rotation of the object being placed (quarter turns). */
    placeRotation: number;
    /** True while the pointer is over the Replace button: the renderer previews the replacement in place. */
    previewReplace: boolean;
    requests: ObjectActionRequest[];
};

const stateByHost = new WeakMap<IEditorPluginHost, State>();

function stateFor(host: IEditorPluginHost): State {
    let state = stateByHost.get(host);
    if (!state) stateByHost.set(host, (state = { placeRotation: 0, previewReplace: false, requests: [] }));
    return state;
}

export type ObjectActionModel = {
    readonly mode: ObjectActionMode | undefined;
    readonly candidate: number | undefined;
    readonly placeRotation: number;
    readonly previewReplace: boolean;
    startMove: () => void;
    /** Starts placing `locTypeId` (or the catalog's current pick). */
    startPlace: (locTypeId?: number) => void;
    cancel: () => void;
    setCandidate: (locTypeId: number | undefined) => void;
    setPreviewReplace: (on: boolean) => void;
    /** Quarter-turns the object being placed. */
    rotatePlacement: () => void;
    request: (request: ObjectActionRequest) => void;
    /** The renderer takes the queued requests once per frame. */
    takeRequests: () => ObjectActionRequest[];
};

export function getObjectActionModel(host: IEditorPluginHost): ObjectActionModel {
    const state = stateFor(host);
    const notify = (): void => host.notifyWorkbenchStateChanged();
    return {
        mode: state.mode,
        candidate: state.candidate,
        placeRotation: state.placeRotation,
        previewReplace: state.previewReplace,
        startMove() {
            if (state.mode === "move") return;
            host.cancelObjectCopyPlacement();
            state.mode = "move";
            notify();
        },
        startPlace(locTypeId) {
            const id = locTypeId ?? state.candidate;
            if (id === undefined) return;
            // Putting things down happens in the Place tool; a copy in hand gives way to the catalog pick.
            if (!host.isObjectPlaceToolActive()) host.setEditorTool("object-place");
            host.cancelObjectCopyPlacement();
            state.candidate = id;
            state.mode = "place";
            notify();
        },
        cancel() {
            if (state.mode === undefined && !state.previewReplace) return;
            state.mode = undefined;
            state.previewReplace = false;
            notify();
        },
        setCandidate(locTypeId) {
            if (state.candidate === locTypeId) return;
            state.candidate = locTypeId;
            notify();
        },
        setPreviewReplace(on) {
            if (state.previewReplace === on) return;
            state.previewReplace = on;
            notify();
        },
        rotatePlacement() {
            state.placeRotation = (state.placeRotation + 1) & 3;
            notify();
        },
        request(request) {
            state.requests.push(request);
        },
        takeRequests() {
            const taken = state.requests;
            state.requests = [];
            return taken;
        },
    };
}

export function getObjectActionWorkbenchSnapshot(host: IEditorPluginHost): string {
    const s = stateFor(host);
    return `${s.mode ?? "-"}:${s.candidate ?? "-"}:${s.placeRotation}:${s.previewReplace ? 1 : 0}`;
}
