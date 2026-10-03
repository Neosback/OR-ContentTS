/**
 * "Go to" input for the command palette: a map square id (12342), map square coordinates (48,54), a world tile
 * (3100, 3512) with an optional plane, with or without labels ("region 12342", "x: 3100 y: 3512 z: 1").
 */
export type GoToTarget = {
    /** World tile to centre the camera on. */
    worldX: number;
    worldY: number;
    plane?: number;
    /** What was understood, for the palette row ("Region 12342 (48, 54)"). */
    label: string;
};

const MAP_SQUARES = 256;
const MAX_WORLD = MAP_SQUARES * 64 - 1;

function regionTarget(mapX: number, mapY: number, plane?: number): GoToTarget {
    const id = (mapX << 8) | mapY;
    return { worldX: mapX * 64 + 32, worldY: mapY * 64 + 32, plane, label: `Region ${id} (${mapX}, ${mapY})${plane === undefined ? "" : `, plane ${plane}`}` };
}

export function parseGoTo(input: string): GoToTarget | undefined {
    const text = input.trim().toLowerCase();
    if (!text || !/\d/.test(text)) return undefined;
    // Only digits, separators and the usual labels are accepted; anything else is a search, not a location.
    if (/[^0-9\s,;:.()\-xyzregionpltile]/.test(text)) return undefined;
    const numbers = (text.match(/\d+/g) ?? []).map(Number);
    if (numbers.length === 0 || numbers.length > 3) return undefined;
    const labelled = /\b(x|y|tile|world)\b|x\s*:/.test(text);
    const regionLabel = /\b(region|r)\b/.test(text);

    if (numbers.length === 1) {
        const [id] = numbers;
        if (labelled || id > 0xffff) return undefined;
        if (!regionLabel && id < MAP_SQUARES) return undefined; // a bare small number is not a region id
        return regionTarget(id >> 8, id & 0xff);
    }

    const [a, b, c] = numbers;
    if (numbers.length === 3) {
        if (c > 3 || a > MAX_WORLD || b > MAX_WORLD) return undefined;
        return { worldX: a, worldY: b, plane: c, label: `Tile ${a}, ${b}, plane ${c}` };
    }
    // Two numbers: map square coordinates when both fit and nothing says "tile", otherwise a world tile.
    if (!labelled && a < MAP_SQUARES && b < MAP_SQUARES && (regionLabel || (a <= 99 && b <= 99))) return regionTarget(a, b);
    if (a > MAX_WORLD || b > MAX_WORLD) return undefined;
    return { worldX: a, worldY: b, label: `Tile ${a}, ${b}` };
}
