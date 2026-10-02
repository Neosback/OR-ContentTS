import { LocModelType } from "../../../rs/config/loctype/LocModelType";
import { LocType } from "../../../rs/config/loctype/LocType";
import { LocTypeLoader } from "../../../rs/config/loctype/LocTypeLoader";
import { Model } from "../../../rs/model/Model";
import { Scene } from "../../../rs/scene/Scene";
import { SceneLoc } from "../../../rs/scene/SceneLoc";
import { getIdFromTag } from "../../../rs/scene/entity/EntityTag";
import { LocEntity } from "../../../rs/scene/entity/LocEntity";
import { INVALID_HSL_COLOR } from "../../../rs/util/ColorUtil";
import {
    OBJECT_CHUNKS_PER_AXIS,
    OBJECT_CHUNK_TILES,
    locFootprintIntersectsChunk,
    sceneTileIntersectsChunk,
} from "../../../mapeditor/webgl/objectChunk";
import { InteractType } from "../../webgl/InteractType";
import { ContourGroundType, SceneModel } from "../buffer/SceneBuffer";
import { SceneLocEntity } from "./SceneLocEntity";

/**
 * Model draw priority (3 bits in the model info texture): locs 1, walls 2, floor decorations 3,
 * wall decorations 5. main.vert pushes walls (2) slightly away from the camera and biases the rest
 * by priority, standing in for the software renderer's painter order where things touching a wall
 * are drawn over it. Keep in sync with WALL_PRIORITY in main.vert.glsl.
 */
const WALL_PRIORITY = 2;
const WALL_DECORATION_PRIORITY = 5;

export type SceneLocs = {
    locs: SceneModel[];
    locEntities: SceneLocEntity[];
};

export function isLowDetail(
    scene: Scene,
    level: number,
    tileX: number,
    tileY: number,
    locType: LocType,
    locModelType: LocModelType,
): boolean {
    const tile = scene.tiles[level][tileX][tileY];
    const tileModel = tile?.tileModel;
    // no tile model, or tile model has invis faces
    const hasTileModel =
        tileModel && tileModel.faceColorsA.findIndex((c) => c === INVALID_HSL_COLOR) === -1;

    if (
        locModelType === LocModelType.FLOOR_DECORATION &&
        locType.isInteractive === 0 &&
        locType.clipType !== 1 &&
        !locType.obstructsGround &&
        hasTileModel
    ) {
        return true;
    }

    const isWallDecoration =
        locModelType >= LocModelType.WALL_DECORATION_INSIDE &&
        locModelType <= LocModelType.WALL_DECORATION_DIAGONAL_DOUBLE;
    if (
        (locModelType === LocModelType.NORMAL ||
            locModelType === LocModelType.NORMAL_DIAGIONAL ||
            isWallDecoration) &&
        locType.isInteractive === 1
    ) {
        return scene.isInside(level, tileX, tileY);
    }

    return false;
}

type SceneLocWithFootprint = SceneLoc & {
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
};

/** Ground height from current tile data so loc meshes track terrain edits. */
export function getGroundHeightForSceneLoc(
    scene: Scene,
    level: number,
    tileX: number,
    tileY: number,
    sceneLoc: SceneLoc,
): number {
    const loc = sceneLoc as SceneLocWithFootprint;
    if (
        typeof loc.startX === "number" &&
        typeof loc.endX === "number" &&
        typeof loc.startY === "number" &&
        typeof loc.endY === "number"
    ) {
        const heightMap = scene.tileHeights[level];
        return (
            heightMap[loc.endX][loc.endY] +
            heightMap[loc.startX][loc.endY] +
            heightMap[loc.startX][loc.startY] +
            heightMap[loc.endX][loc.startY]
        ) >> 2;
    }
    return scene.getCenterHeight(level, tileX, tileY);
}

export function createSceneModel(
    locTypeLoader: LocTypeLoader,
    scene: Scene,
    model: Model,
    sceneLoc: SceneLoc,
    offsetX: number,
    offsetY: number,
    level: number,
    tileX: number,
    tileY: number,
    priority: number,
): SceneModel {
    const id = getIdFromTag(sceneLoc.tag);
    const type: LocModelType = sceneLoc.flags & 0x3f;
    const locType = locTypeLoader.load(id);

    const sceneX = sceneLoc.x + offsetX;
    const sceneZ = sceneLoc.y + offsetY;
    const sceneHeight = sceneLoc.height;

    const contourGroundType = model.contourVerticesY
        ? ContourGroundType.VERTEX
        : ContourGroundType.CENTER_TILE;

    return {
        model,
        sceneHeight,
        lowDetail: isLowDetail(scene, level, tileX, tileY, locType, type),
        forceMerge: locType.contourGroundType > 1,

        sceneX,
        sceneZ,
        heightOffset: 0,
        level,
        contourGround: contourGroundType,
        priority,
        interactType: InteractType.LOC,
        interactId: id,
        roof: isRoofShape(type),
    };
}

/** Loc shapes 12–21 are roofs. */
export function isRoofShape(type: LocModelType): boolean {
    return type >= LocModelType.ROOF_SLOPED && type <= LocModelType.ROOF_SLOPED_OVERHANG_HARD_OUTER_CORNER;
}

export function createSceneLocEntity(
    locTypeLoader: LocTypeLoader,
    entity: LocEntity,
    sceneLoc: SceneLoc,
    offsetX: number,
    offsetY: number,
    level: number,
    priority: number,
): SceneLocEntity {
    const id = getIdFromTag(sceneLoc.tag);
    const locType = locTypeLoader.load(id);

    const contourGroundType =
        locType.contourGroundType > 0 ? ContourGroundType.VERTEX : ContourGroundType.CENTER_TILE;

    const sceneX = sceneLoc.x + offsetX;
    const sceneZ = sceneLoc.y + offsetY;

    return {
        entity,
        sceneLoc,
        lowDetail: false,
        roof: isRoofShape(sceneLoc.flags & 0x3f),

        sceneX,
        sceneZ,
        heightOffset: 0,
        level,
        contourGround: contourGroundType,
        priority,
        interactType: InteractType.LOC,
        interactId: id,
    };
}

export function getSceneLocs(
    locTypeLoader: LocTypeLoader,
    scene: Scene,
    borderSize: number,
    maxLevel: number,
): SceneLocs {
    return getSceneLocsForChunk(locTypeLoader, scene, borderSize, maxLevel, -1);
}

/** Largest loc footprint (tiles beyond the start tile, per axis) in the map square, cached per scene. */
const maxLocSpanCache = new WeakMap<Scene, { x: number; y: number }>();

function getMaxLocSpan(
    scene: Scene,
    startX: number,
    endX: number,
    startY: number,
    endY: number,
): { x: number; y: number } {
    let span = maxLocSpanCache.get(scene);
    if (span) {
        return span;
    }
    span = { x: 0, y: 0 };
    for (let level = 0; level < scene.levels; level++) {
        for (let tileX = startX; tileX < endX; tileX++) {
            for (let tileY = startY; tileY < endY; tileY++) {
                const tile = scene.tiles[level][tileX][tileY];
                if (!tile) {
                    continue;
                }
                for (const loc of tile.locs) {
                    if (loc.startX === tileX && loc.startY === tileY) {
                        span.x = Math.max(span.x, loc.endX - loc.startX);
                        span.y = Math.max(span.y, loc.endY - loc.startY);
                    }
                }
            }
        }
    }
    maxLocSpanCache.set(scene, span);
    return span;
}

export function getSceneLocsForChunk(
    locTypeLoader: LocTypeLoader,
    scene: Scene,
    borderSize: number,
    maxLevel: number,
    chunkId: number,
): SceneLocs {
    const locs: SceneModel[] = [];
    const locEntities: SceneLocEntity[] = [];

    const startX = borderSize;
    const startY = borderSize;
    const endX = borderSize + Scene.MAP_SQUARE_SIZE;
    const endY = borderSize + Scene.MAP_SQUARE_SIZE;

    const sceneOffset = borderSize * -128;

    const tileInChunk = (tx: number, ty: number): boolean =>
        chunkId < 0 || sceneTileIntersectsChunk(tx, ty, borderSize, chunkId);

    // A chunk only needs the tiles it covers plus those whose locs reach into it. Scanning the whole map square for
    // each of the 64 chunks visited every tile 64 times. Tiles are still visited in the same order, so the output is
    // identical to the full scan.
    let scanMinX = startX;
    let scanMaxX = endX - 1;
    let scanMinY = startY;
    let scanMaxY = endY - 1;
    if (chunkId >= 0) {
        const span = getMaxLocSpan(scene, startX, endX, startY, endY);
        const chunkMinX = startX + (chunkId % OBJECT_CHUNKS_PER_AXIS) * OBJECT_CHUNK_TILES;
        const chunkMinY = startY + Math.floor(chunkId / OBJECT_CHUNKS_PER_AXIS) * OBJECT_CHUNK_TILES;
        scanMinX = Math.max(startX, chunkMinX - span.x);
        scanMaxX = Math.min(endX - 1, chunkMinX + OBJECT_CHUNK_TILES - 1);
        scanMinY = Math.max(startY, chunkMinY - span.y);
        scanMaxY = Math.min(endY - 1, chunkMinY + OBJECT_CHUNK_TILES - 1);
    }

    for (let level = 0; level < scene.levels; level++) {
        for (let tileX = scanMinX; tileX <= scanMaxX; tileX++) {
            for (let tileY = scanMinY; tileY <= scanMaxY; tileY++) {
                const tile = scene.tiles[level][tileX][tileY];
                // if (!tile || tile.minLevel > maxLevel) {
                //     continue;
                // }
                if (
                    !tile ||
                    (tile.minLevel > maxLevel &&
                        !scene.isPlayerLevel(level, tileX, tileY, maxLevel))
                ) {
                    continue;
                }

                if (tile.floorDecoration && tileInChunk(tileX, tileY)) {
                    if (tile.floorDecoration.entity instanceof Model) {
                        locs.push(
                            createSceneModel(
                                locTypeLoader,
                                scene,
                                tile.floorDecoration.entity,
                                tile.floorDecoration,
                                sceneOffset,
                                sceneOffset,
                                level,
                                tileX,
                                tileY,
                                3,
                            ),
                        );
                    } else if (tile.floorDecoration.entity instanceof LocEntity) {
                        locEntities.push(
                            createSceneLocEntity(
                                locTypeLoader,
                                tile.floorDecoration.entity,
                                tile.floorDecoration,
                                sceneOffset,
                                sceneOffset,
                                level,
                                3,
                            ),
                        );
                    }
                }

                if (tile.wall && tileInChunk(tileX, tileY)) {
                    if (tile.wall.entity0 instanceof Model) {
                        locs.push(
                            createSceneModel(
                                locTypeLoader,
                                scene,
                                tile.wall.entity0,
                                tile.wall,
                                sceneOffset,
                                sceneOffset,
                                level,
                                tileX,
                                tileY,
                                WALL_PRIORITY,
                            ),
                        );
                    } else if (tile.wall.entity0 instanceof LocEntity) {
                        locEntities.push(
                            createSceneLocEntity(
                                locTypeLoader,
                                tile.wall.entity0,
                                tile.wall,
                                sceneOffset,
                                sceneOffset,
                                level,
                                WALL_PRIORITY,
                            ),
                        );
                    }

                    if (tile.wall.entity1 instanceof Model) {
                        locs.push(
                            createSceneModel(
                                locTypeLoader,
                                scene,
                                tile.wall.entity1,
                                tile.wall,
                                sceneOffset,
                                sceneOffset,
                                level,
                                tileX,
                                tileY,
                                WALL_PRIORITY,
                            ),
                        );
                    } else if (tile.wall.entity1 instanceof LocEntity) {
                        locEntities.push(
                            createSceneLocEntity(
                                locTypeLoader,
                                tile.wall.entity1,
                                tile.wall,
                                sceneOffset,
                                sceneOffset,
                                level,
                                WALL_PRIORITY,
                            ),
                        );
                    }
                }

                if (tile.wallDecoration && tileInChunk(tileX, tileY)) {
                    const offsetX = tile.wallDecoration.offsetX;
                    const offsetY = tile.wallDecoration.offsetY;
                    if (tile.wallDecoration.entity0 instanceof Model) {
                        locs.push(
                            createSceneModel(
                                locTypeLoader,
                                scene,
                                tile.wallDecoration.entity0,
                                tile.wallDecoration,
                                offsetX + sceneOffset,
                                offsetY + sceneOffset,
                                level,
                                tileX,
                                tileY,
                                WALL_DECORATION_PRIORITY,
                            ),
                        );
                    } else if (tile.wallDecoration.entity0 instanceof LocEntity) {
                        locEntities.push(
                            createSceneLocEntity(
                                locTypeLoader,
                                tile.wallDecoration.entity0,
                                tile.wallDecoration,
                                offsetX + sceneOffset,
                                offsetY + sceneOffset,
                                level,
                                WALL_DECORATION_PRIORITY,
                            ),
                        );
                    }

                    if (tile.wallDecoration.entity1 instanceof Model) {
                        locs.push(
                            createSceneModel(
                                locTypeLoader,
                                scene,
                                tile.wallDecoration.entity1,
                                tile.wallDecoration,
                                sceneOffset,
                                sceneOffset,
                                level,
                                tileX,
                                tileY,
                                WALL_DECORATION_PRIORITY,
                            ),
                        );
                    } else if (tile.wallDecoration.entity1 instanceof LocEntity) {
                        locEntities.push(
                            createSceneLocEntity(
                                locTypeLoader,
                                tile.wallDecoration.entity1,
                                tile.wallDecoration,
                                sceneOffset,
                                sceneOffset,
                                level,
                                WALL_DECORATION_PRIORITY,
                            ),
                        );
                    }
                }

                for (const loc of tile.locs) {
                    if (loc.startX !== tileX || loc.startY !== tileY) {
                        continue;
                    }
                    // Diagonal walls (shape 9) are placed as game objects but draw like walls.
                    const locPriority =
                        (loc.flags & 0x3f) === LocModelType.WALL_DIAGONAL ? WALL_PRIORITY : 1;

                    if (
                        chunkId >= 0 &&
                        !locFootprintIntersectsChunk(
                            loc.startX,
                            loc.startY,
                            loc.endX,
                            loc.endY,
                            borderSize,
                            chunkId,
                        )
                    ) {
                        continue;
                    }

                    if (loc.entity instanceof Model) {
                        locs.push(
                            createSceneModel(
                                locTypeLoader,
                                scene,
                                loc.entity,
                                loc,
                                sceneOffset,
                                sceneOffset,
                                level,
                                tileX,
                                tileY,
                                locPriority,
                            ),
                        );
                    } else if (loc.entity instanceof LocEntity) {
                        locEntities.push(
                            createSceneLocEntity(
                                locTypeLoader,
                                loc.entity,
                                loc,
                                sceneOffset,
                                sceneOffset,
                                level,
                                locPriority,
                            ),
                        );
                    }
                }
            }
        }
    }

    return {
        locs: locs,
        locEntities: locEntities,
    };
}
