import { LocModelType } from "../rs/config/loctype/LocModelType";
import type { LocType } from "../rs/config/loctype/LocType";

/**
 * Everything the cache knows about an object type, grouped for the Object properties window. Pure (a LocType in, plain
 * rows out) so it is testable and the window only has to draw it.
 */
export type PropertyRow = { label: string; value: string };
export type PropertySection = { title: string; rows: PropertyRow[] };

const CLIP_NAMES: Record<number, string> = { 0: "none", 1: "solid", 2: "standard" };

export function locModelTypeName(type: number): string {
    const name = LocModelType[type];
    if (name === undefined) return `type ${type}`;
    return `${name.toLowerCase().replace(/_/g, " ")} (${type})`;
}

const yesNo = (value: boolean): string => (value ? "yes" : "no");
const list = (values: readonly unknown[] | undefined): string => (values && values.length > 0 ? values.join(", ") : "none");
const unset = (value: number): string => (value < 0 ? "none" : String(value));

function pairs(from: readonly number[] | undefined, to: readonly number[] | undefined): string {
    if (!from || from.length === 0) return "none";
    return from.map((value, index) => `${value} → ${to?.[index] ?? "?"}`).join(", ");
}

/** Keys shown in the curated sections; everything else on the object is listed under "Other fields". */
const CURATED = new Set([
    "id", "name", "desc", "sizeX", "sizeY", "clipType", "blocksProjectile", "isInteractive", "obstructsGround", "isHollow",
    "supportItems", "mapFunctionId", "mapSceneId", "flipMapSceneSprite", "isRotated", "clipped", "lowDetail", "models", "types",
    "modelSizeX", "modelSizeHeight", "modelSizeY", "offsetX", "offsetHeight", "offsetY", "ambient", "contrast", "mergeNormals",
    "modelClipped", "contouredGround", "contourGroundType", "contourGroundParam", "decorDisplacement", "recolorFrom", "recolorTo",
    "retextureFrom", "retextureTo", "seqId", "seqRandomStart", "randomSeqIds", "randomSeqDelays", "actions", "transforms",
    "transformVarbit", "transformVarp", "ambientSoundId", "ambientSoundDistance", "ambientSoundChangeTicksMin",
    "ambientSoundChangeTicksMax", "ambientSoundRetain", "ambientSoundIds", "params", "cacheInfo", "cacheType",
]);

function describeOther(locType: LocType): PropertyRow[] {
    const rows: PropertyRow[] = [];
    for (const [key, value] of Object.entries(locType)) {
        if (CURATED.has(key) || typeof value === "function" || value === undefined) continue;
        rows.push({ label: key, value: Array.isArray(value) ? list(value) : typeof value === "object" && value !== null ? JSON.stringify(value) : String(value) });
    }
    return rows;
}

export function describeLocType(locType: LocType): PropertySection[] {
    const sections: PropertySection[] = [];
    const actions = (locType.actions ?? []).map((action, slot) => (action ? `${slot + 1}: ${action}` : "")).filter(Boolean);

    sections.push({
        title: "General",
        rows: [
            { label: "Id", value: String(locType.id) },
            { label: "Name", value: locType.name && locType.name !== "null" ? locType.name : "unnamed" },
            ...(locType.desc ? [{ label: "Examine", value: locType.desc }] : []),
            { label: "Size", value: `${locType.sizeX} × ${locType.sizeY} tiles` },
            { label: "Clipping", value: CLIP_NAMES[locType.clipType] ?? String(locType.clipType) },
            { label: "Blocks projectiles", value: yesNo(locType.blocksProjectile) },
            { label: "Interactive", value: locType.isInteractive < 0 ? "default" : yesNo(locType.isInteractive !== 0) },
            { label: "Obstructs ground", value: yesNo(locType.obstructsGround) },
            { label: "Hollow", value: yesNo(locType.isHollow) },
            { label: "Rotated", value: yesNo(locType.isRotated) },
            { label: "Clipped", value: yesNo(locType.clipped) },
            { label: "Low detail", value: yesNo(locType.lowDetail) },
            { label: "Support items", value: unset(locType.supportItems) },
            { label: "Map function", value: unset(locType.mapFunctionId) },
            { label: "Map scene", value: unset(locType.mapSceneId) + (locType.flipMapSceneSprite ? " (flipped)" : "") },
        ],
    });

    const models = (locType.models ?? []).map((ids, index) => {
        const type = locType.types?.[index];
        return { label: type === undefined ? `Model set ${index + 1}` : locModelTypeName(type), value: list(ids) };
    });
    sections.push({ title: "Models", rows: models.length > 0 ? models : [{ label: "Models", value: "none" }] });

    sections.push({
        title: "Shape and lighting",
        rows: [
            { label: "Model size", value: `${locType.modelSizeX} × ${locType.modelSizeHeight} × ${locType.modelSizeY}` },
            { label: "Offset", value: `${locType.offsetX}, ${locType.offsetHeight}, ${locType.offsetY}` },
            { label: "Ambient", value: String(locType.ambient) },
            { label: "Contrast", value: String(locType.contrast) },
            { label: "Merge normals", value: yesNo(locType.mergeNormals) },
            { label: "Model clipped", value: yesNo(locType.modelClipped) },
            { label: "Contoured ground", value: unset(locType.contouredGround) },
            { label: "Contour type / param", value: `${locType.contourGroundType} / ${locType.contourGroundParam}` },
            { label: "Decor displacement", value: String(locType.decorDisplacement) },
        ],
    });

    sections.push({
        title: "Colours and textures",
        rows: [
            { label: "Recolour", value: pairs(locType.recolorFrom, locType.recolorTo) },
            { label: "Retexture", value: pairs(locType.retextureFrom, locType.retextureTo) },
        ],
    });

    sections.push({
        title: "Animation",
        rows: [
            { label: "Sequence", value: unset(locType.seqId) },
            { label: "Random start", value: yesNo(locType.seqRandomStart) },
            ...(locType.randomSeqIds ? [{ label: "Random sequences", value: pairs(locType.randomSeqIds, locType.randomSeqDelays).replace(/ → /g, " after ") }] : []),
        ],
    });

    sections.push({ title: "Actions", rows: [{ label: "Right-click options", value: actions.length > 0 ? actions.join(" · ") : "none" }] });

    if (locType.transforms && locType.transforms.length > 0) {
        sections.push({
            title: "Transforms",
            rows: [
                { label: "Varbit", value: unset(locType.transformVarbit) },
                { label: "Varp", value: unset(locType.transformVarp) },
                { label: "Becomes", value: list(locType.transforms) },
            ],
        });
    }

    if (locType.ambientSoundId >= 0 || (locType.ambientSoundIds?.length ?? 0) > 0) {
        sections.push({
            title: "Sound",
            rows: [
                { label: "Ambient sound", value: unset(locType.ambientSoundId) },
                { label: "Distance", value: String(locType.ambientSoundDistance) },
                { label: "Change ticks", value: `${locType.ambientSoundChangeTicksMin} – ${locType.ambientSoundChangeTicksMax}` },
                { label: "Retain", value: String(locType.ambientSoundRetain) },
                { label: "Sound set", value: list(locType.ambientSoundIds) },
            ],
        });
    }

    const params = locType.params ? [...locType.params.entries()] : [];
    if (params.length > 0) {
        sections.push({ title: "Params", rows: params.map(([key, value]) => ({ label: String(key), value: String(value) })) });
    }

    const other = describeOther(locType);
    if (other.length > 0) sections.push({ title: "Other fields", rows: other });

    return sections;
}

/** Plain-text copy of the sections ("Section\n  Label: value"), for pasting into notes or chat. */
export function propertiesToText(sections: readonly PropertySection[]): string {
    return sections.map((section) => `${section.title}\n${section.rows.map((row) => `  ${row.label}: ${row.value}`).join("\n")}`).join("\n\n");
}
