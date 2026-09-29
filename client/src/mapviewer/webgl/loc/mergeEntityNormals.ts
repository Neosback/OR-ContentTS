import { LocModelLoader } from "../../../rs/config/loctype/LocModelLoader";
import { LocType } from "../../../rs/config/loctype/LocType";
import { ModelData } from "../../../rs/model/ModelData";
import { Scene } from "../../../rs/scene/Scene";
import { Entity } from "../../../rs/scene/entity/Entity";
import { LocEntity } from "../../../rs/scene/entity/LocEntity";

/**
 * Engine-exact cross-tile normal merging for the GPU chunk builders.
 *
 * The live client merges wall/loc normals across tiles in `Scene.light`
 * (`mergeLargeLocNormals` / `mergeFloorNormals`): seamless shading at joins
 * plus hiding of wall end-caps embedded in the joined wall
 * (`hideOccludedFaces`, baked as `faceColors3 = -2`, which the mesh builder
 * already skips). The GPU builders resolve every entity from its `LocEntity`
 * independently and never run that pass, so joins shade with hard faceted
 * edges (reads as a seam) and hidden end-caps stay visible (poke out).
 *
 * The full-map `MODELS` build already merges via `Scene.light`; this covers
 * the entity paths (editor chunk rebuilds after every object edit, and any
 * scene built with `NO_MODELS`) by stashing resolved `ModelData` into the
 * scene tiles and then running the engine's own merge + bake code, so the
 * result is identical to `Scene.light` by construction.
 *
 * Must be called once per scene before the tile walk that splits entities
 * into baked models vs `LocEntity`s: afterwards static mergeNormals entities
 * are baked `Model`s (routed to the model path) and everything else is
 * untouched.
 */
export function bakeMergedSceneModels(
    scene: Scene,
    locModelLoader: LocModelLoader,
    centerLocHeightWithSize: boolean,
): void {
    // Phase 1: resolve fresh unbaked ModelData for every static mergeNormals
    // entity and stash it in the scene tiles. Neighbors must all be stashed
    // before any merging runs, like the MODELS build.
    for (let level = 0; level < scene.levels; level++) {
        for (let tileX = 0; tileX < scene.sizeX; tileX++) {
            for (let tileY = 0; tileY < scene.sizeY; tileY++) {
                const tile = scene.tiles[level][tileX][tileY];
                if (!tile) {
                    continue;
                }
                if (tile.wall) {
                    if (tile.wall.entity0) {
                        tile.wall.entity0 = stashEntity(
                            scene,
                            locModelLoader,
                            centerLocHeightWithSize,
                            level,
                            tileX,
                            tileY,
                            tile.wall.entity0,
                        );
                    }
                    if (tile.wall.entity1) {
                        tile.wall.entity1 = stashEntity(
                            scene,
                            locModelLoader,
                            centerLocHeightWithSize,
                            level,
                            tileX,
                            tileY,
                            tile.wall.entity1,
                        );
                    }
                }
                for (const loc of tile.locs) {
                    // The same Loc object is registered on every footprint tile;
                    // stash once (by anchor) so each instance merges exactly
                    // like the engine's per-tile processing expects shared state.
                    if (loc.startX !== tileX || loc.startY !== tileY) {
                        continue;
                    }
                    loc.entity = stashEntity(
                        scene,
                        locModelLoader,
                        centerLocHeightWithSize,
                        level,
                        tileX,
                        tileY,
                        loc.entity,
                    );
                }
                if (tile.floorDecoration) {
                    tile.floorDecoration.entity = stashEntity(
                        scene,
                        locModelLoader,
                        centerLocHeightWithSize,
                        level,
                        tileX,
                        tileY,
                        tile.floorDecoration.entity,
                    );
                }
            }
        }
    }

    // Phase 2: engine merge + bake, same order and calls as Scene.light.
    const textureLoader = locModelLoader.textureLoader;
    for (let level = 0; level < scene.levels; level++) {
        for (let tileX = 0; tileX < scene.sizeX; tileX++) {
            for (let tileY = 0; tileY < scene.sizeY; tileY++) {
                const tile = scene.tiles[level][tileX][tileY];
                if (!tile) {
                    continue;
                }
                const wall = tile.wall;
                if (wall && wall.entity0 instanceof ModelData) {
                    const model0 = wall.entity0;
                    scene.mergeLargeLocNormals(model0, level, tileX, tileY, 1, 1);
                    if (wall.entity1 instanceof ModelData) {
                        const model1 = wall.entity1;
                        scene.mergeLargeLocNormals(model1, level, tileX, tileY, 1, 1);
                        ModelData.mergeNormals(model0, model1, 0, 0, 0, false);
                        wall.entity1 = model1.light(
                            textureLoader,
                            model1.ambient,
                            model1.contrast,
                            -50,
                            -10,
                            -50,
                        );
                    }
                    wall.entity0 = model0.light(
                        textureLoader,
                        model0.ambient,
                        model0.contrast,
                        -50,
                        -10,
                        -50,
                    );
                }
                for (const loc of tile.locs) {
                    if (loc.entity instanceof ModelData) {
                        scene.mergeLargeLocNormals(
                            loc.entity,
                            level,
                            tileX,
                            tileY,
                            loc.endX - loc.startX + 1,
                            loc.endY - loc.startY + 1,
                        );
                        loc.entity = loc.entity.light(
                            textureLoader,
                            loc.entity.ambient,
                            loc.entity.contrast,
                            -50,
                            -10,
                            -50,
                        );
                    }
                }
                const floorDecoration = tile.floorDecoration;
                if (floorDecoration && floorDecoration.entity instanceof ModelData) {
                    scene.mergeFloorNormals(floorDecoration.entity, level, tileX, tileY);
                    floorDecoration.entity = floorDecoration.entity.light(
                        textureLoader,
                        floorDecoration.entity.ambient,
                        floorDecoration.entity.contrast,
                        -50,
                        -10,
                        -50,
                    );
                }
            }
        }
    }
}

function stashEntity(
    scene: Scene,
    locModelLoader: LocModelLoader,
    centerLocHeightWithSize: boolean,
    level: number,
    tileX: number,
    tileY: number,
    entity: Entity,
): Entity {
    if (!(entity instanceof LocEntity)) {
        return entity;
    }
    // Animated and morphing entities stay LocEntity in the engine's MODELS
    // build (Scene.light skips them via instanceof); keep them unresolved.
    if (entity.seqId !== -1) {
        return entity;
    }
    const base = locModelLoader.locTypeLoader.load(entity.id);
    if (base.transforms) {
        return entity;
    }
    if (!base.mergeNormals) {
        return entity;
    }
    const modelData = locModelLoader.getLocModelData(base, entity.type, entity.rotation);
    if (!modelData) {
        return entity;
    }
    // getLocModelData shares the cache's faceRenderTypes array by reference;
    // merge-hiding writes into it, which would leak hidden faces into every
    // later wall of the same model (and pollute the loader cache across chunk
    // rebuilds). Mirror ModelData.copy(): give this instance its own array.
    if (modelData.faceRenderTypes) {
        modelData.faceRenderTypes = Int8Array.from(modelData.faceRenderTypes);
    }
    let ambient = 64;
    let contrast = 768;
    const ignoreLocLighting = base.cacheInfo.game === "runescape" && base.cacheInfo.revision <= 445;
    if (!ignoreLocLighting) {
        ambient += base.ambient;
        contrast += base.contrast;
    }
    modelData.ambient = ambient;
    modelData.contrast = contrast;
    // Eager: the engine's MODELS path computes normals once on the shared
    // cached instance inside getModel (before any hiding), and tile copies
    // share that array. Match it so hidden faces still contribute.
    modelData.calculateVertexNormals();
    if (base.contourGroundType !== 0) {
        const info = buildContourInfo(
            scene,
            centerLocHeightWithSize,
            entity,
            base,
            level,
            tileX,
            tileY,
        );
        return modelData.contourGround(
            info.type,
            info.param,
            info.heightMap,
            info.heightMapAbove,
            info.entityX,
            info.entityY,
            info.entityZ,
        );
    }
    return modelData;
}

function buildContourInfo(
    scene: Scene,
    centerLocHeightWithSize: boolean,
    entity: LocEntity,
    locType: LocType,
    level: number,
    tileX: number,
    tileY: number,
): {
    type: number;
    param: number;
    heightMap: Int32Array[];
    heightMapAbove: Int32Array[] | undefined;
    entityX: number;
    entityY: number;
    entityZ: number;
} {
    const { rotation } = entity;
    let sizeX = locType.sizeX;
    let sizeY = locType.sizeY;
    if (rotation === 1 || rotation === 3) {
        sizeX = locType.sizeY;
        sizeY = locType.sizeX;
    }
    // Mirrors SceneBuilder.decodeLocs (and the chunk entity resolvers).
    let startX = tileX;
    let endX = tileX + 1;
    let startY = tileY;
    let endY = tileY + 1;
    if (centerLocHeightWithSize) {
        startX = (sizeX >> 1) + tileX;
        endX = ((sizeX + 1) >> 1) + tileX;
        startY = (sizeY >> 1) + tileY;
        endY = ((sizeY + 1) >> 1) + tileY;
    }
    const heightMap = scene.tileHeights[level];
    let heightMapAbove: Int32Array[] | undefined;
    if (level < scene.levels - 1) {
        heightMapAbove = scene.tileHeights[level + 1];
    }
    const centerHeight =
        (heightMap[endX][endY] +
            heightMap[startX][endY] +
            heightMap[startX][startY] +
            heightMap[endX][startY]) >>
        2;
    return {
        type: locType.contourGroundType,
        param: locType.contourGroundParam,
        heightMap,
        heightMapAbove,
        entityX: (tileX << 7) + (sizeX << 6),
        entityY: centerHeight,
        entityZ: (tileY << 7) + (sizeY << 6),
    };
}
