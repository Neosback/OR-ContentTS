import type { LocTypeLoader } from "../../rs/config/loctype/LocTypeLoader";
import { LocType } from "../../rs/config/loctype/LocType";
import type { Scene } from "../../rs/scene/Scene";
import { wallDecorationOffset } from "../../rs/scene/WallDecorationOffset";
import { getIdFromTag } from "../../rs/scene/entity/EntityTag";
import { rotationFromLocFlags, type SceneTileLocData } from "./sceneLocData";

/**
 * Puts the wall decoration on a tile at the distance its wall calls for.
 *
 * The client sets that distance while loading (a decoration is pushed by `decorDisplacement` of the wall beside it),
 * so decorations that are moved, copied or stamped, or walls that arrive on or leave a decorated tile, have to redo
 * it: otherwise a decoration keeps the offset of the wall it came from and ends up inside (or off) the new one.
 * Returns whether anything changed.
 */
export function refreshWallDecorationAt(
    scene: Scene,
    level: number,
    tileX: number,
    tileY: number,
    locTypeLoader: LocTypeLoader,
): boolean {
    const decoration = scene.tiles[level]?.[tileX]?.[tileY]?.wallDecoration;
    if (!decoration) {
        return false;
    }
    const wallTag = scene.getWallTag(level, tileX, tileY);
    const displacement =
        wallTag !== 0n
            ? locTypeLoader.load(getIdFromTag(wallTag)).decorDisplacement
            : LocType.DEFAULT_DECOR_DISPLACEMENT;
    const offset = wallDecorationOffset(
        decoration.flags & 0x3f,
        rotationFromLocFlags(decoration.flags),
        displacement,
    );
    if (offset.x === decoration.offsetX && offset.y === decoration.offsetY) {
        return false;
    }
    decoration.offsetX = offset.x;
    decoration.offsetY = offset.y;
    return true;
}

/** `refreshWallDecorationAt` for every tile the given entries sit on. */
export function refreshWallDecorationsForEntries(
    scene: Scene,
    entries: readonly Pick<SceneTileLocData, "level" | "tileX" | "tileY">[],
    locTypeLoader: LocTypeLoader,
): void {
    const seen = new Set<string>();
    for (const { level, tileX, tileY } of entries) {
        const key = `${level},${tileX},${tileY}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        refreshWallDecorationAt(scene, level, tileX, tileY, locTypeLoader);
    }
}
