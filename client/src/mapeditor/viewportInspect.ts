import { LocModelType } from "../rs/config/loctype/LocModelType";
import type { LocTypeLoader } from "../rs/config/loctype/LocTypeLoader";
import type { SeqTypeLoader } from "../rs/config/seqtype/SeqTypeLoader";
import type { VarManager } from "../rs/config/vartype/VarManager";
import { Scene } from "../rs/scene/Scene";
import { getMapSquareId } from "../rs/map/MapFileIndex";
import { isSceneTileVisible, type PlaneViewOptions } from "./planeVisibility";
import type { EditorMapSquare } from "./webgl/EditorMapSquare";
import type { EditorObjectRef } from "./webgl/sceneLocPicker";
import type { LocEntityData, SceneTileLocData } from "./webgl/sceneLocData";

/**
 * Plain-JSON snapshot of a tile and the objects on it, for the viewport "Copy …" menu. Kept free of
 * engine objects so it can be pasted into a bug report (or to an assistant) and read back as is.
 */
export type ViewportInspectInfo = {
    world: { x: number; y: number };
    region: { id: number; mapX: number; mapY: number; localX: number; localY: number };
    view: PlaneViewOptions;
    planes: TileInspectInfo[];
};

export type ViewportHoverInspectInfo = ViewportInspectInfo & { hoveredObject?: EditorObjectRef };

export type TileInspectInfo = {
    level: number;
    /** Drawn with the current view options (Scene.draw minPlane rule). */
    visible: boolean;
    minPlane: number;
    flags: {
        raw: number;
        blocked: boolean;
        bridge: boolean;
        roofRemoval: boolean;
        drawFromPlane0: boolean;
        lowDetailHidden: boolean;
    };
    /** Corner heights in engine units (negative is up): sw, se, ne, nw. */
    heights: [number, number, number, number];
    underlayId: number;
    overlayId: number;
    shape: number;
    rotation: number;
    objects: ObjectInspectInfo[];
};

export type ObjectInspectInfo = {
    kind: "loc" | "wall" | "wallDecoration" | "floorDecoration";
    id: number;
    name: string;
    /** Loc shape (0–22) and its name. */
    shape: number;
    shapeName: string;
    rotation: number;
    /** Scene flags: shape in bits 0–5, rotation in bits 6–7. */
    flags: number;
    anchor: { tileX: number; tileY: number };
    footprint?: { startX: number; startY: number; endX: number; endY: number };
    sceneHeight: number;
    wallDecorationOffset?: { x: number; y: number };
    /** Second model of a wall corner / double decoration. */
    entity1?: { shape: number; rotation: number };
    def: Record<string, unknown>;
    animation?: Record<string, unknown>;
};

function shapeName(shape: number): string {
    return LocModelType[shape] ?? `UNKNOWN_${shape}`;
}

function locDefSummary(
    locTypeLoader: LocTypeLoader,
    id: number,
    varManager?: VarManager,
): { name: string; def: Record<string, unknown> } {
    const t = locTypeLoader.load(id);
    const def: Record<string, unknown> = {
        models: t.models,
        modelShapes: t.types,
        size: [t.sizeX, t.sizeY],
        isRotated: t.isRotated,
        modelScale: [t.modelSizeX, t.modelSizeHeight, t.modelSizeY],
        offset: [t.offsetX, t.offsetHeight, t.offsetY],
        contourGroundType: t.contourGroundType,
        contourGroundParam: t.contourGroundParam,
        mergeNormals: t.mergeNormals,
        modelClipped: t.modelClipped,
        clipType: t.clipType,
        blocksProjectile: t.blocksProjectile,
        isInteractive: t.isInteractive,
        obstructsGround: t.obstructsGround,
        isHollow: t.isHollow,
        decorDisplacement: t.decorDisplacement,
        ambient: t.ambient,
        contrast: t.contrast,
        seqId: t.seqId,
        seqRandomStart: t.seqRandomStart,
    };
    if (t.recolorFrom?.length) def.recolor = { from: t.recolorFrom, to: t.recolorTo };
    if (t.retextureFrom?.length) def.retexture = { from: t.retextureFrom, to: t.retextureTo };
    if (t.transforms?.length) {
        const drawn = varManager ? t.transform(varManager, locTypeLoader) : undefined;
        def.transforms = {
            varbit: t.transformVarbit,
            varp: t.transformVarp,
            value:
                varManager &&
                (t.transformVarbit !== -1
                    ? varManager.getVarbit(t.transformVarbit)
                    : t.transformVarp !== -1
                      ? varManager.getVarp(t.transformVarp)
                      : undefined),
            ids: t.transforms,
            /** Definition drawn for the current var values (models/animation come from it). */
            drawn: drawn ? { id: drawn.id, name: drawn.name, models: drawn.models, seqId: drawn.seqId } : null,
        };
    }
    if (t.randomSeqIds?.length) def.randomSeqs = { ids: t.randomSeqIds, delays: t.randomSeqDelays };
    if (t.actions?.some((a) => a)) def.actions = t.actions;
    return { name: t.name, def };
}

function seqSummary(seqTypeLoader: SeqTypeLoader, seqId: number): Record<string, unknown> | undefined {
    if (seqId < 0) {
        return undefined;
    }
    const s = seqTypeLoader.load(seqId);
    if (s.isSkeletalSeq()) {
        return {
            seqId,
            skeletal: true,
            skeletalId: s.skeletalId,
            durationTicks: s.getSkeletalDuration(),
            frameStep: s.frameStep,
            looping: s.looping,
            maxLoops: s.maxLoops,
        };
    }
    const lengths = s.frameLengths ?? [];
    return {
        seqId,
        skeletal: false,
        frameCount: s.frameIds?.length ?? 0,
        frameLengths: lengths,
        /** Client ticks (20 ms) for one pass of the sequence. */
        totalClientTicks: lengths.reduce((a, b) => a + b, 0),
        frameStep: s.frameStep,
        looping: s.looping,
        maxLoops: s.maxLoops,
    };
}

function objectInfo(
    kind: ObjectInspectInfo["kind"],
    entity: LocEntityData,
    flags: number,
    sceneHeight: number,
    locTypeLoader: LocTypeLoader,
    seqTypeLoader: SeqTypeLoader,
    varManager?: VarManager,
): ObjectInspectInfo {
    const { name, def } = locDefSummary(locTypeLoader, entity.id, varManager);
    const shape = flags & 0x3f;
    return {
        kind,
        id: entity.id,
        name,
        shape,
        shapeName: shapeName(shape),
        rotation: (flags >> 6) & 3,
        flags,
        anchor: { tileX: entity.tileX, tileY: entity.tileY },
        sceneHeight,
        def,
        animation: seqSummary(seqTypeLoader, entity.seqId),
    };
}

function objectsOnTile(
    entries: readonly SceneTileLocData[],
    level: number,
    sceneX: number,
    sceneY: number,
    locTypeLoader: LocTypeLoader,
    seqTypeLoader: SeqTypeLoader,
    varManager?: VarManager,
): ObjectInspectInfo[] {
    const out: ObjectInspectInfo[] = [];
    for (const e of entries) {
        if (e.level !== level) {
            continue;
        }
        const onTile = e.tileX === sceneX && e.tileY === sceneY;
        if (onTile && e.floorDecoration) {
            const d = e.floorDecoration;
            out.push(objectInfo("floorDecoration", d.entity, d.flags, d.height, locTypeLoader, seqTypeLoader, varManager));
        }
        if (onTile && e.wall) {
            const w = e.wall;
            const primary = w.entity0 ?? w.entity1;
            if (primary) {
                const info = objectInfo("wall", primary, w.flags, w.height, locTypeLoader, seqTypeLoader, varManager);
                if (w.entity0 && w.entity1) {
                    info.entity1 = { shape: w.entity1.type, rotation: w.entity1.rotation };
                }
                out.push(info);
            }
        }
        if (onTile && e.wallDecoration) {
            const d = e.wallDecoration;
            const info = objectInfo("wallDecoration", d.entity0, d.flags, d.height, locTypeLoader, seqTypeLoader, varManager);
            info.wallDecorationOffset = { x: d.offsetX, y: d.offsetY };
            if (d.entity1) {
                info.entity1 = { shape: d.entity1.type, rotation: d.entity1.rotation };
            }
            out.push(info);
        }
        if (e.loc) {
            const l = e.loc;
            if (sceneX < l.startX || sceneX > l.endX || sceneY < l.startY || sceneY > l.endY) {
                continue;
            }
            const info = objectInfo("loc", l.entity, l.flags, l.height, locTypeLoader, seqTypeLoader, varManager);
            info.footprint = { startX: l.startX, startY: l.startY, endX: l.endX, endY: l.endY };
            out.push(info);
        }
    }
    return out;
}

export function inspectViewportTile(
    map: EditorMapSquare,
    worldX: number,
    worldY: number,
    view: PlaneViewOptions,
    locTypeLoader: LocTypeLoader,
    seqTypeLoader: SeqTypeLoader,
    varManager?: VarManager,
): ViewportInspectInfo | undefined {
    const scene = map.scene;
    const localX = ((worldX % 64) + 64) % 64;
    const localY = ((worldY % 64) + 64) % 64;
    const x = localX + map.borderSize;
    const y = localY + map.borderSize;
    if (x < 0 || y < 0 || x + 1 >= scene.sizeX || y + 1 >= scene.sizeY) {
        return undefined;
    }

    const planes: TileInspectInfo[] = [];
    for (let level = 0; level < Scene.MAX_LEVELS; level++) {
        const raw = scene.tileRenderFlags[level][x][y];
        const h = scene.tileHeights[level];
        planes.push({
            level,
            visible: isSceneTileVisible(scene, level, x, y, view),
            minPlane: scene.getTileMinLevel(level, x, y, view.bridgeLinkBelow),
            flags: {
                raw,
                blocked: (raw & 0x1) !== 0,
                bridge: (raw & 0x2) !== 0,
                roofRemoval: (raw & 0x4) !== 0,
                drawFromPlane0: (raw & 0x8) !== 0,
                lowDetailHidden: (raw & 0x10) !== 0,
            },
            heights: [h[x][y], h[x + 1][y], h[x + 1][y + 1], h[x][y + 1]],
            underlayId: scene.tileUnderlays[level][x][y] - 1,
            overlayId: scene.tileOverlays[level][x][y] - 1,
            shape: scene.tileShapes[level][x][y],
            rotation: scene.tileRotations[level][x][y],
            objects: objectsOnTile(map.sceneLocData.tiles, level, x, y, locTypeLoader, seqTypeLoader, varManager),
        });
    }

    return {
        world: { x: worldX, y: worldY },
        region: {
            id: getMapSquareId(map.mapX, map.mapY),
            mapX: map.mapX,
            mapY: map.mapY,
            localX,
            localY,
        },
        view,
        planes,
    };
}
