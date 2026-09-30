import { getMapSquareId } from "../rs/map/MapFileIndex";
import type { IEditorPluginHost } from "./plugins/editor-plugin-host";
import { readTileFieldSnapshot } from "./map-editor-history-snapshot";
import type { EditorMapSquare } from "./webgl/EditorMapSquare";

export function recordEditTileMutation(
    host: IEditorPluginHost,
    map: EditorMapSquare,
    level: number,
    sceneX: number,
    sceneY: number,
    mutate: () => void,
): void {
    if (host.isHistoryApplying()) {
        mutate();
        return;
    }

    const border = map.borderSize;
    const localX = sceneX - border;
    const localY = sceneY - border;
    const scene = map.scene;

    if (sceneX < 0 || sceneX >= scene.sizeX || sceneY < 0 || sceneY >= scene.sizeY) {
        mutate();
        return;
    }

    if (localX < 0 || localX >= 64 || localY < 0 || localY >= 64) {
        mutate();
        return;
    }

    const before = readTileFieldSnapshot(scene, level, sceneX, sceneY);
    mutate();
    const after = readTileFieldSnapshot(scene, level, sceneX, sceneY);
    host.recordEditMutation({
        kind: "map.tile",
        mapId: getMapSquareId(map.mapX, map.mapY),
        level,
        localTileId: (localX << 8) | localY,
        before,
        after,
    });
}


/** @deprecated Use recordEditTileMutation. */
export const recordHistoryTileMutation = recordEditTileMutation;
