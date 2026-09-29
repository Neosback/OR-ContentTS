import { LocModelType } from "../../../rs/config/loctype/LocModelType";
import type { LocModelLoader } from "../../../rs/config/loctype/LocModelLoader";
import type { LocType } from "../../../rs/config/loctype/LocType";
import type { NpcModelLoader } from "../../../rs/config/npctype/NpcModelLoader";
import type { NpcType } from "../../../rs/config/npctype/NpcType";
import { UnderlayFloorType } from "../../../rs/config/floortype/UnderlayFloorType";
import type { Model } from "../../../rs/model/Model";
import { Model2DRenderer } from "../../../ui/model/Model2DRenderer";
import type { OsrsClient } from "../../OsrsClient";
import { readTerrainTile, type TerrainTileRecord } from "./RegionPack";
import type {
    EditModePlacement,
    EditModePreviewTarget,
    EditModePreviewView,
    EditModeReport,
    EditModeSearchKind,
    EditModeTile,
    EditModeTileInspection,
} from "./types";

/**
 * Read-only inspection for the Studio Inspector: tile terrain records, full
 * definition reports (after RSPSi's TileBrushPanel/ObjectReport) and isolated
 * model previews (after RSPSi's ObjectViewerPanel), built from the loaded cache.
 */

type InspectionRenderer = {
    getInteractLocModelLoader?(): LocModelLoader | undefined;
    getInteractNpcModelLoader?(): NpcModelLoader | undefined;
    getLocIdsAtTileAllLevels?(tileX: number, tileY: number): Array<{ id: number; level: number; typeRot?: number }>;
    getTileHeightAtPlane?(tileX: number, tileY: number, plane: number): number;
    terrainOverrides?: Map<string, { underlay?: number; overlay?: number; shape?: number; rotation?: number }>;
    mapRegionReplacements?: Map<number, { terrainData: Int8Array | Uint8Array }>;
};

/** Rev 209+ OSRS terrain stores values as shorts. */
export function usesWideTerrain(client: OsrsClient): boolean {
    return client.loadedCache?.info.game === "oldschool" && (client.loadedCache?.info.revision ?? 0) >= 209;
}

const TILE_FLAGS: ReadonlyArray<[number, string]> = [
    [0x1, "Blocked"],
    [0x2, "Bridge (planes above render one lower)"],
    [0x4, "Removes roofs"],
    [0x8, "Visible from lower planes"],
    [0x10, "Hidden from lower planes"],
];

export function tileFlagNames(flags: number): string[] {
    return TILE_FLAGS.filter(([bit]) => (flags & bit) !== 0).map(([, name]) => name);
}

export function locLayerName(shape: number): string {
    if (shape <= LocModelType.WALL_RECT_CORNER) return "Wall";
    if (shape <= LocModelType.WALL_DECORATION_DIAGONAL_DOUBLE) return "Wall decoration";
    if (shape === LocModelType.FLOOR_DECORATION) return "Ground decoration";
    if (shape >= LocModelType.ROOF_SLOPED) return "Roof";
    return "Game object";
}

export function locShapeLabel(shape: number): string {
    const name = LocModelType[shape];
    if (!name) return String(shape);
    return `${shape} · ${name.toLowerCase().replace("diagional", "diagonal").replace(/_/g, " ")}`;
}

function renderer(client: OsrsClient): InspectionRenderer | undefined {
    return client.renderer as unknown as InspectionRenderer | undefined;
}

function terrainRecord(client: OsrsClient, plane: number, tileX: number, tileY: number): TerrainTileRecord | undefined {
    const mapX = tileX >> 6;
    const mapY = tileY >> 6;
    const replacement = renderer(client)?.mapRegionReplacements?.get((mapX << 8) | mapY);
    const data =
        replacement?.terrainData ??
        client.loaderFactory?.getMapFileLoader().getTerrainData(mapX, mapY, client.loadedCache?.xteas);
    if (!data) return undefined;
    return readTerrainTile(data, plane, tileX & 0x3f, tileY & 0x3f, usesWideTerrain(client));
}

function locName(client: OsrsClient, id: number): string {
    try {
        const name = client.locTypeLoader?.load(id)?.name;
        return name && name !== "null" ? name : `Object ${id}`;
    } catch {
        return `Object ${id}`;
    }
}

export function inspectTile(client: OsrsClient, tile: EditModeTile): EditModeTileInspection | undefined {
    const record = terrainRecord(client, tile.plane, tile.tileX, tile.tileY);
    if (!record) return undefined;
    const host = renderer(client);

    // Unsaved paint previews live in the renderer's override map, ahead of the map file.
    const override = host?.terrainOverrides?.get(`${tile.tileX},${tile.tileY},${tile.plane}`);
    const overlayId = override?.overlay ?? record.overlayId;
    const overlayShape = override?.shape ?? record.overlayShape;
    const overlayRotation = override?.rotation ?? record.overlayRotation;
    const underlayId = override?.underlay ?? record.underlayId;

    const bridgeFlags = tile.plane > 0 ? terrainRecord(client, 1, tile.tileX, tile.tileY)?.flags ?? 0 : 0;
    const scenePlane = tile.plane > 0 && (bridgeFlags & 0x2) !== 0 ? tile.plane - 1 : tile.plane;

    let overlay: EditModeTileInspection["overlay"];
    if (overlayId > 0) {
        overlay = { id: overlayId, shape: overlayShape, rotation: overlayRotation };
        try {
            const type = client.loaderFactory?.getOverlayTypeLoader().load(overlayId);
            if (type) {
                overlay.name = type.name || undefined;
                overlay.rgb = type.primaryRgb & 0xffffff;
                overlay.textureId = type.textureId >= 0 ? type.textureId : undefined;
            }
        } catch {
            // Sparse caches may still be fetching the definition.
        }
    }

    let underlay: EditModeTileInspection["underlay"];
    if (underlayId > 0) {
        underlay = { id: underlayId };
        try {
            // Underlay ids in the map file are 1-based.
            const type = client.loaderFactory?.getUnderlayTypeLoader().load(underlayId - 1);
            if (type instanceof UnderlayFloorType) {
                underlay.rgb = type.rgbColor & 0xffffff;
                underlay.textureId = type.textureId >= 0 ? type.textureId : undefined;
            }
        } catch {
            // Same as above.
        }
    }

    let heights: EditModeTileInspection["heights"];
    const heightAt = host?.getTileHeightAtPlane;
    if (heightAt) {
        // Scene heights grow downwards; report them as "up" in tile units (1/8 of a scene unit step).
        const corner = (dx: number, dy: number) =>
            Math.round(-heightAt.call(host, tile.tileX + dx, tile.tileY + dy, tile.plane) / 8);
        heights = [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)];
    }

    const objects = (host?.getLocIdsAtTileAllLevels?.(tile.tileX, tile.tileY) ?? []).map((loc) => {
        const shape = loc.typeRot === undefined ? LocModelType.NORMAL : loc.typeRot & 0x3f;
        return {
            id: loc.id,
            name: locName(client, loc.id),
            level: loc.level,
            shape,
            rotation: loc.typeRot === undefined ? 0 : (loc.typeRot >> 6) & 3,
            layer: locLayerName(shape),
        };
    });

    return {
        tile,
        scenePlane,
        overlay,
        underlay,
        heights,
        flags: record.flags,
        flagNames: tileFlagNames(record.flags),
        objects,
    };
}

function list(values: ArrayLike<unknown> | undefined): string {
    if (!values || values.length === 0) return "—";
    return Array.from(values)
        .filter((value) => value !== null && value !== undefined && value !== "")
        .join(", ") || "—";
}

function pairs(from: ArrayLike<number> | undefined, to: ArrayLike<number> | undefined): string | undefined {
    if (!from || !to || from.length === 0) return undefined;
    const out: string[] = [];
    for (let i = 0; i < from.length; i++) out.push(`${from[i]} → ${to[i]}`);
    return out.join(", ");
}

function transformsRow(type: { transforms?: number[]; transformVarbit: number; transformVarp: number }): string | undefined {
    if (!type.transforms || type.transforms.length === 0) return undefined;
    const source = type.transformVarbit !== -1 ? `varbit ${type.transformVarbit}` : `varp ${type.transformVarp}`;
    return `${source} → ${list(type.transforms.map((id) => (id === -1 ? "none" : id)))}`;
}

function locReport(client: OsrsClient, id: number, placement?: EditModePlacement): EditModeReport | undefined {
    const type = client.locTypeLoader?.load(id) as LocType | undefined;
    if (!type) return undefined;
    const name = type.name && type.name !== "null" ? type.name : "Unnamed object";

    const identity: Array<[string, string]> = [["Name", name], ["ID", String(id)]];
    if (placement) {
        identity.push(
            ["Shape", locShapeLabel(placement.shape)],
            ["Layer", locLayerName(placement.shape)],
            ["Rotation", `${placement.rotation} (${placement.rotation * 90}°)`],
            ["Position", `${placement.tile.tileX}, ${placement.tile.tileY} · plane ${placement.tile.plane}`],
        );
    }

    const appearance: Array<[string, string]> = [];
    const transforms = transformsRow(type);
    if (transforms) appearance.push(["States", transforms]);
    if (type.seqId >= 0) appearance.push(["Animation", String(type.seqId)]);
    if (type.randomSeqIds?.length) appearance.push(["Random animations", list(type.randomSeqIds)]);
    if (type.models?.length) {
        appearance.push([
            "Models by type",
            type.models
                .map((models, index) => `${type.types ? locShapeLabel(type.types[index]) : "any"}: ${list(models)}`)
                .join("; "),
        ]);
    }
    if (type.modelSizeX !== 128 || type.modelSizeHeight !== 128 || type.modelSizeY !== 128) {
        appearance.push(["Scale (X/Y/Z)", `${type.modelSizeX} / ${type.modelSizeHeight} / ${type.modelSizeY} (128 = 1×)`]);
    }
    if (type.offsetX || type.offsetHeight || type.offsetY) {
        appearance.push(["Offset (X/Y/Z)", `${type.offsetX} / ${type.offsetHeight} / ${type.offsetY}`]);
    }
    const recolours = pairs(type.recolorFrom, type.recolorTo);
    if (recolours) appearance.push(["Recolours", recolours]);
    const retextures = pairs(type.retextureFrom, type.retextureTo);
    if (retextures) appearance.push(["Retextures", retextures]);
    if (type.contouredGround !== -1 || type.contourGroundType) {
        appearance.push(["Follows terrain", `yes (type ${type.contourGroundType})`]);
    }
    if (type.ambient || type.contrast) appearance.push(["Lighting", `ambient ${type.ambient} · contrast ${type.contrast}`]);
    if (type.isRotated) appearance.push(["Mirrored", "yes"]);
    if (type.isHollow) appearance.push(["Hollow", "yes"]);

    const footprint: Array<[string, string]> = [
        ["Size", `${type.sizeX} × ${type.sizeY} tiles`],
        ["Blocks walking", type.clipType === 0 ? "no" : `yes (clip type ${type.clipType})`],
        ["Blocks projectiles", type.blocksProjectile ? "yes" : "no"],
        ["Interactive", type.isInteractive === 1 ? "yes" : type.isInteractive === 0 ? "no" : "auto"],
        ["Actions", list(type.actions)],
    ];
    if (type.mapFunctionId >= 0) footprint.push(["Map function icon", String(type.mapFunctionId)]);
    if (type.mapSceneId >= 0) footprint.push(["Map scene icon", String(type.mapSceneId)]);
    if (type.ambientSoundId >= 0) footprint.push(["Ambient sound", String(type.ambientSoundId)]);

    const sections = [
        { title: "Identity", rows: identity },
        { title: "Appearance", rows: appearance },
        { title: "Footprint & interaction", rows: footprint },
    ].filter((section) => section.rows.length > 0);
    return { title: `${name} #${id}`, sections };
}

function npcReport(client: OsrsClient, id: number): EditModeReport | undefined {
    const type = client.npcTypeLoader?.load(id) as NpcType | undefined;
    if (!type) return undefined;
    const name = type.name && type.name !== "null" ? type.name : "Unnamed NPC";

    const identity: Array<[string, string]> = [
        ["Name", name],
        ["ID", String(id)],
        ["Combat level", type.combatLevel > 0 ? String(type.combatLevel) : "—"],
        ["Size", `${type.size} × ${type.size} tiles`],
        ["Actions", list(type.actions)],
    ];
    const transforms = transformsRow(type);
    if (transforms) identity.push(["States", transforms]);

    const stats: Array<[string, string]> = [
        ["Attack / Strength / Defence", `${type.attackLevel} / ${type.strengthLevel} / ${type.defenceLevel}`],
        ["Hitpoints", String(type.hitpoints)],
        ["Ranged / Magic", `${type.rangedLevel} / ${type.magicLevel}`],
        ["Attack speed", String(type.attackSpeed)],
    ];

    const appearance: Array<[string, string]> = [
        ["Models", list(type.modelIds)],
        ["Idle / walk animation", `${type.idleSeqId} / ${type.walkSeqId}`],
    ];
    if (type.chatheadModelIds?.length) appearance.push(["Chathead models", list(type.chatheadModelIds)]);
    if (type.widthScale !== 128 || type.heightScale !== 128) {
        appearance.push(["Scale (width/height)", `${type.widthScale} / ${type.heightScale} (128 = 1×)`]);
    }
    const recolours = pairs(type.recolorFrom, type.recolorTo);
    if (recolours) appearance.push(["Recolours", recolours]);
    const retextures = pairs(type.retextureFrom, type.retextureTo);
    if (retextures) appearance.push(["Retextures", retextures]);

    return {
        title: `${name} #${id}`,
        sections: [
            { title: "Identity", rows: identity },
            { title: "Combat", rows: stats },
            { title: "Appearance", rows: appearance },
        ],
    };
}

function itemReport(client: OsrsClient, id: number): EditModeReport | undefined {
    const type = client.objTypeLoader?.load(id) as unknown as Record<string, unknown> | undefined;
    if (!type) return undefined;
    const name = typeof type.name === "string" && type.name !== "null" ? type.name : "Unnamed item";
    const value = (key: string): string => {
        const raw = type[key];
        if (Array.isArray(raw)) return list(raw);
        if (raw === undefined || raw === null || raw === "") return "—";
        return String(raw);
    };
    return {
        title: `${name} #${id}`,
        sections: [
            {
                title: "Identity",
                rows: [
                    ["Name", name],
                    ["ID", String(id)],
                    ["Examine", value("examine")],
                    ["Members", value("isMembers")],
                    ["Tradeable", value("isTradable")],
                    ["Price", value("price")],
                    ["Weight", value("weight")],
                    ["Stackable", value("stackability")],
                ],
            },
            {
                title: "Actions",
                rows: [
                    ["Ground", value("groundActions")],
                    ["Inventory", value("inventoryActions")],
                    ["Equip slot", value("wearPos")],
                ],
            },
            {
                title: "Appearance",
                rows: [
                    ["Model", value("model")],
                    ["Noted / placeholder", `${value("note")} / ${value("placeholder")}`],
                ],
            },
        ],
    };
}

export function describeReport(
    client: OsrsClient,
    kind: EditModeSearchKind,
    id: number,
    placement?: EditModePlacement,
): EditModeReport | undefined {
    try {
        if (kind === "loc") return locReport(client, id, placement);
        if (kind === "npc") return npcReport(client, id);
        return itemReport(client, id);
    } catch {
        return undefined;
    }
}

let previewRenderer: Model2DRenderer | undefined;

function previewModel(client: OsrsClient, target: EditModePreviewTarget): Model | undefined {
    const host = renderer(client);
    if (target.kind === "loc") {
        let type = client.locTypeLoader?.load(target.id) as LocType | undefined;
        if (type?.transforms) type = type.transform(client.varManager, client.locTypeLoader) ?? type;
        const loader = host?.getInteractLocModelLoader?.();
        if (!type || !loader) return undefined;
        // Diagonal game objects are the normal model turned an extra 45° (rotation 4-7).
        const diagonal = target.shape === LocModelType.NORMAL_DIAGIONAL;
        return loader.getModelAnimated(
            type,
            diagonal ? LocModelType.NORMAL : (target.shape as LocModelType),
            diagonal ? (target.rotation + 4) & 0x7 : target.rotation,
            -1,
            -1,
        );
    }
    if (target.kind === "npc") {
        let type = client.npcTypeLoader?.load(target.id) as NpcType | undefined;
        if (type?.transforms) type = type.transform(client.varManager, client.npcTypeLoader) ?? type;
        return type ? host?.getInteractNpcModelLoader?.()?.getModel(type, -1, -1) : undefined;
    }
    return undefined;
}

export function renderPreview(
    client: OsrsClient,
    target: EditModePreviewTarget,
    view: EditModePreviewView,
    width: number,
    height: number,
    reuse?: HTMLCanvasElement,
): HTMLCanvasElement | undefined {
    if (!client.modelLoader || !client.textureLoader || !client.objTypeLoader) return undefined;
    previewRenderer ??= new Model2DRenderer(
        client.objTypeLoader,
        client.modelLoader,
        client.textureLoader,
        client.seqTypeLoader,
        client.seqFrameLoader,
        client.skeletalSeqLoader,
    );
    const params = { xan2d: view.pitch & 2047, yan2d: view.yaw & 2047, zoom3d: 512, depthTest: true };
    try {
        if (target.kind === "item") {
            const result = previewRenderer.renderItemToCanvasExtents(target.id, 1, { ...params, zoom2d: 2000 / view.zoom }, width, height);
            if (!result) return undefined;
            const canvas = reuse ?? document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d");
            if (!context) return undefined;
            context.clearRect(0, 0, width, height);
            const scale = Math.min(width / result.canvas.width, height / result.canvas.height, 4);
            const drawWidth = result.canvas.width * scale;
            const drawHeight = result.canvas.height * scale;
            context.imageSmoothingEnabled = false;
            context.drawImage(result.canvas, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
            return canvas;
        }

        const model = previewModel(client, target);
        if (!model || model.faceCount === 0) return undefined;
        model.calculateBoundsCylinder?.();
        // Fit like the portrait widgets do: the larger of height and diameter fills the box.
        const modelHeight = Math.max(1, model.height | 0);
        const modelWidth = Math.max(1, (model.xzRadius | 0) * 2);
        const fit = Math.max((modelHeight * 512) / height, (modelWidth * 512) / width) * 1.2;
        return previewRenderer.renderModelInstanceToCanvasWidget(
            model,
            { ...params, zoom2d: Math.max(1, (fit / view.zoom) | 0), modelHeightOffset2d: (modelHeight / 2) | 0 },
            width,
            height,
            reuse,
        )?.canvas;
    } catch {
        return undefined;
    }
}
