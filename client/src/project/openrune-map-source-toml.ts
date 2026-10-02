import {
    findGameValSymbol,
    type GameValRegistry,
} from "./gameval-registry";
import type { OpenRuneProjectIndex } from "./openrune-project-index";
import type { ProjectFileSystem } from "./project-filesystem";

export type OpenRuneMapSourceKind = "npc" | "obj" | "area";

export type OpenRuneMapCoordGrid = {
    raw: string;
    level: number;
    mapX: number;
    mapZ: number;
    localX: number;
    localZ: number;
    worldX: number;
    worldZ: number;
    mapSquareId: number;
};

export type OpenRuneNpcSpawn = {
    kind: "npc";
    npc: string;
    npcId?: number;
    coords: OpenRuneMapCoordGrid;
    sourcePath: string;
    line: number;
    ordinal: number;
    rawText: string;
};

export type OpenRuneObjSpawn = {
    kind: "obj";
    obj: string;
    objId?: number;
    count: number;
    coords: OpenRuneMapCoordGrid;
    sourcePath: string;
    line: number;
    ordinal: number;
    rawText: string;
};

export type OpenRuneAreaPolygon = {
    vertices: readonly (readonly [number, number])[];
    line: number;
};

export type OpenRuneAreaSource = {
    kind: "area";
    name: string;
    areaId: string;
    resolvedAreaId?: number;
    levels: readonly number[];
    includes: readonly string[];
    resolvedIncludes: readonly number[];
    excludes: readonly string[];
    resolvedExcludes: readonly number[];
    polygons: readonly OpenRuneAreaPolygon[];
    sourcePath: string;
    line: number;
    ordinal: number;
    rawText: string;
};

export type OpenRuneMapSourceIssueCode =
    | "MISSING_FIELD"
    | "INVALID_SYMBOL"
    | "UNRESOLVED_SYMBOL"
    | "ID_OUT_OF_RANGE"
    | "INVALID_COORDS"
    | "INVALID_COUNT"
    | "INVALID_LEVELS"
    | "INVALID_POLYGON"
    | "INVALID_AREA_REFERENCE"
    | "DUPLICATE_AREA_ID";

export type OpenRuneMapSourceIssue = {
    code: OpenRuneMapSourceIssueCode;
    message: string;
    sourcePath: string;
    line?: number;
    kind: OpenRuneMapSourceKind;
    symbol?: string;
    resolvedId?: number;
    related?: Array<{
        sourcePath: string;
        line: number;
        symbol: string;
    }>;
};

export type OpenRuneNpcSpawnFileIndex = {
    kind: "npc";
    sourcePath: string;
    sourceText: string;
    spawns: readonly OpenRuneNpcSpawn[];
    issues: readonly OpenRuneMapSourceIssue[];
};

export type OpenRuneObjSpawnFileIndex = {
    kind: "obj";
    sourcePath: string;
    sourceText: string;
    spawns: readonly OpenRuneObjSpawn[];
    issues: readonly OpenRuneMapSourceIssue[];
};

export type OpenRuneAreaFileIndex = {
    kind: "area";
    sourcePath: string;
    sourceText: string;
    areas: readonly OpenRuneAreaSource[];
    issues: readonly OpenRuneMapSourceIssue[];
};

export type OpenRuneMapSourceIndex = {
    npcFiles: readonly OpenRuneNpcSpawnFileIndex[];
    objFiles: readonly OpenRuneObjSpawnFileIndex[];
    areaFiles: readonly OpenRuneAreaFileIndex[];
    npcs: readonly OpenRuneNpcSpawn[];
    objs: readonly OpenRuneObjSpawn[];
    areas: readonly OpenRuneAreaSource[];
    issues: readonly OpenRuneMapSourceIssue[];
    npcsByMapSquare: ReadonlyMap<number, readonly OpenRuneNpcSpawn[]>;
    objsByMapSquare: ReadonlyMap<number, readonly OpenRuneObjSpawn[]>;
    areasBySymbol: ReadonlyMap<string, readonly OpenRuneAreaSource[]>;
};

export type SerializableOpenRuneNpcSpawn = {
    npc: string;
    coords: OpenRuneMapCoordGrid | string;
};

export type SerializableOpenRuneObjSpawn = {
    obj: string;
    count?: number;
    coords: OpenRuneMapCoordGrid | string;
};

export type SerializableOpenRuneArea = {
    name: string;
    areaId: string;
    levels: readonly number[];
    includes?: readonly string[];
    excludes?: readonly string[];
    polygons?: readonly (readonly (readonly [number, number])[])[];
};

export type OpenRuneMapSourceWriteErrorCode =
    | "INVALID_PATH"
    | "SOURCE_MISSING"
    | "SOURCE_EXISTS"
    | "STALE_SOURCE";

export class OpenRuneMapSourceWriteError extends Error {
    constructor(
        readonly code: OpenRuneMapSourceWriteErrorCode,
        message: string,
        readonly sourcePath: string,
    ) {
        super(message);
        this.name = "OpenRuneMapSourceWriteError";
    }
}

const ARRAY_HEADER = /^\s*\[\[\s*([^\[\]]+?)\s*\]\](?:\s*#.*)?\s*$/;
const SIMPLE_ASSIGNMENT = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

function compareText(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

function stripInlineComment(raw: string): string {
    let single = false;
    let double = false;
    let escaped = false;

    for (let index = 0; index < raw.length; index++) {
        const char = raw[index]!;
        if (double) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (char === "\\") {
                escaped = true;
                continue;
            }
            if (char === '"') double = false;
            continue;
        }
        if (single) {
            if (char === "'") single = false;
            continue;
        }
        if (char === '"') {
            double = true;
            continue;
        }
        if (char === "'") {
            single = true;
            continue;
        }
        if (char === "#") return raw.slice(0, index).trimEnd();
    }

    return raw.trimEnd();
}

class TomlLiteralCursor {
    private index = 0;

    constructor(private readonly source: string) {}

    parse(): unknown {
        const value = this.value();
        this.space();
        if (this.index !== this.source.length) {
            throw new Error("Unexpected trailing TOML literal content.");
        }
        return value;
    }

    private value(): unknown {
        this.space();
        const char = this.source[this.index];
        if (char === "[") return this.array();
        if (char === '"' || char === "'") return this.string();
        return this.integer();
    }

    private array(): unknown[] {
        this.expect("[");
        const values: unknown[] = [];
        this.space();
        if (this.peek("]")) {
            this.index++;
            return values;
        }

        while (this.index < this.source.length) {
            values.push(this.value());
            this.space();
            if (this.peek(",")) {
                this.index++;
                this.space();
                if (this.peek("]")) {
                    this.index++;
                    return values;
                }
                continue;
            }
            if (this.peek("]")) {
                this.index++;
                return values;
            }
            throw new Error("Expected ',' or ']' in TOML array.");
        }
        throw new Error("Unterminated TOML array.");
    }

    private string(): string {
        const quote = this.source[this.index]!;
        const start = this.index;
        this.index++;
        let escaped = false;

        while (this.index < this.source.length) {
            const char = this.source[this.index++]!;
            if (quote === '"') {
                if (escaped) {
                    escaped = false;
                    continue;
                }
                if (char === "\\") {
                    escaped = true;
                    continue;
                }
            }
            if (char === quote) {
                const raw = this.source.slice(start, this.index);
                if (quote === '"') {
                    const parsed = JSON.parse(raw);
                    if (typeof parsed !== "string") throw new Error("Invalid TOML string.");
                    return parsed;
                }
                return raw.slice(1, -1);
            }
        }
        throw new Error("Unterminated TOML string.");
    }

    private integer(): number {
        const remaining = this.source.slice(this.index);
        const match = /^[+-]?\d+/.exec(remaining);
        if (!match) throw new Error("Expected TOML integer.");
        this.index += match[0].length;
        const value = Number(match[0]);
        if (!Number.isSafeInteger(value)) throw new Error("TOML integer is not safe.");
        return value;
    }

    private space(): void {
        while (/\s/.test(this.source[this.index] ?? "")) this.index++;
    }

    private expect(char: string): void {
        this.space();
        if (!this.peek(char)) throw new Error(`Expected '${char}'.`);
        this.index++;
    }

    private peek(char: string): boolean {
        return this.source[this.index] === char;
    }
}

function parseLiteral(raw: string): unknown {
    return new TomlLiteralCursor(stripInlineComment(raw).trim()).parse();
}

type Assignment = {
    key: string;
    raw: string;
    line: number;
};

function bracketDelta(raw: string): number {
    let delta = 0;
    let single = false;
    let double = false;
    let escaped = false;

    for (const char of stripInlineComment(raw)) {
        if (double) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (char === "\\") {
                escaped = true;
                continue;
            }
            if (char === '"') double = false;
            continue;
        }
        if (single) {
            if (char === "'") single = false;
            continue;
        }
        if (char === '"') {
            double = true;
            continue;
        }
        if (char === "'") {
            single = true;
            continue;
        }
        if (char === "[") delta++;
        else if (char === "]") delta--;
    }
    return delta;
}

function collectAssignments(
    lines: readonly string[],
    startInclusive: number,
    endExclusive: number,
): Assignment[] {
    const assignments: Assignment[] = [];

    for (let index = startInclusive; index < endExclusive; index++) {
        const line = lines[index]!;
        const match = SIMPLE_ASSIGNMENT.exec(line);
        if (!match) continue;

        let raw = match[2]!;
        let balance = bracketDelta(raw);
        while (balance > 0 && index + 1 < endExclusive) {
            index++;
            raw += `\n${lines[index]!}`;
            balance += bracketDelta(lines[index]!);
        }

        assignments.push({
            key: match[1]!,
            raw,
            line: index - raw.split("\n").length + 2,
        });
    }

    return assignments;
}

function assignmentValue(
    assignments: readonly Assignment[],
    key: string,
): { value?: unknown; line?: number } {
    const assignment = assignments.find((entry) => entry.key === key);
    if (!assignment) return {};
    try {
        return { value: parseLiteral(assignment.raw), line: assignment.line };
    } catch {
        return { line: assignment.line };
    }
}

function splitArrayBlocks(
    text: string,
    headerName: string,
): Array<{ ordinal: number; start: number; end: number; lines: string[]; rawText: string }> {
    const lineEnding = text.includes("\r\n") ? "\r\n" : "\n";
    const lines = text.split(/\r?\n/);
    const starts: number[] = [];

    for (let index = 0; index < lines.length; index++) {
        const match = ARRAY_HEADER.exec(lines[index]!);
        if (match?.[1]?.trim() === headerName) starts.push(index);
    }

    return starts.map((start, ordinal) => {
        const end = starts[ordinal + 1] ?? lines.length;
        return {
            ordinal,
            start,
            end,
            lines: lines.slice(start, end),
            rawText: lines.slice(start, end).join(lineEnding),
        };
    });
}

export function parseOpenRuneCoordGrid(raw: string): OpenRuneMapCoordGrid | undefined {
    const parts = raw.split("_");
    if (parts.length !== 5 || parts.some((part) => !/^\d+$/.test(part))) {
        return undefined;
    }

    const [level, mapX, mapZ, localX, localZ] = parts.map(Number);
    if (
        !Number.isSafeInteger(level) ||
        !Number.isSafeInteger(mapX) ||
        !Number.isSafeInteger(mapZ) ||
        !Number.isSafeInteger(localX) ||
        !Number.isSafeInteger(localZ) ||
        level! < 0 ||
        level! > 3 ||
        mapX! < 0 ||
        mapX! > 255 ||
        mapZ! < 0 ||
        mapZ! > 255 ||
        localX! < 0 ||
        localX! > 63 ||
        localZ! < 0 ||
        localZ! > 63
    ) {
        return undefined;
    }

    return {
        raw,
        level: level!,
        mapX: mapX!,
        mapZ: mapZ!,
        localX: localX!,
        localZ: localZ!,
        worldX: mapX! * 64 + localX!,
        worldZ: mapZ! * 64 + localZ!,
        mapSquareId: (mapX! << 8) | mapZ!,
    };
}

export function formatOpenRuneCoordGrid(
    coords: OpenRuneMapCoordGrid | string,
): string {
    if (typeof coords === "string") {
        const parsed = parseOpenRuneCoordGrid(coords);
        if (!parsed) throw new Error(`Invalid OpenRune CoordGrid "${coords}".`);
        return parsed.raw;
    }
    return `${coords.level}_${coords.mapX}_${coords.mapZ}_${coords.localX}_${coords.localZ}`;
}

function resolveSymbol(
    symbol: string,
    table: string,
    gameVals: GameValRegistry | undefined,
): number | undefined {
    if (!symbol.startsWith(`${table}.`)) return undefined;
    return gameVals ? findGameValSymbol(gameVals, symbol)?.id : undefined;
}

function validateResolvedId(
    kind: OpenRuneMapSourceKind,
    symbol: string,
    resolvedId: number | undefined,
    sourcePath: string,
    line: number,
    gameVals: GameValRegistry | undefined,
    issues: OpenRuneMapSourceIssue[],
): void {
    if (!gameVals) return;
    if (resolvedId === undefined) {
        issues.push({
            code: "UNRESOLVED_SYMBOL",
            message: `OpenRune ${kind} symbol "${symbol}" at ${sourcePath}:${line} is not present in the selected GameVal registry.`,
            sourcePath,
            line,
            kind,
            symbol,
        });
        return;
    }
    if (resolvedId < 0 || resolvedId > 0xffff) {
        issues.push({
            code: "ID_OUT_OF_RANGE",
            message: `OpenRune ${kind} symbol "${symbol}" resolves to id ${resolvedId}, outside the 16-bit map-source range.`,
            sourcePath,
            line,
            kind,
            symbol,
            resolvedId,
        });
    }
}

function parseSpawnFile(
    kind: "npc" | "obj",
    sourcePath: string,
    text: string,
    gameVals?: GameValRegistry,
): OpenRuneNpcSpawnFileIndex | OpenRuneObjSpawnFileIndex {
    const blocks = splitArrayBlocks(text, "spawn");
    const issues: OpenRuneMapSourceIssue[] = [];
    const npcSpawns: OpenRuneNpcSpawn[] = [];
    const objSpawns: OpenRuneObjSpawn[] = [];

    for (const block of blocks) {
        const assignments = collectAssignments(block.lines, 1, block.lines.length);
        const entity = assignmentValue(assignments, kind);
        const coordsValue = assignmentValue(assignments, "coords");
        const sourceLine = block.start + 1;

        if (typeof entity.value !== "string") {
            issues.push({
                code: "MISSING_FIELD",
                message: `OpenRune ${kind} spawn at ${sourcePath}:${sourceLine} requires a quoted "${kind}" symbol.`,
                sourcePath,
                line: sourceLine,
                kind,
            });
            continue;
        }

        if (!entity.value.startsWith(`${kind}.`)) {
            issues.push({
                code: "INVALID_SYMBOL",
                message: `OpenRune ${kind} spawn symbol "${entity.value}" at ${sourcePath}:${entity.line ?? sourceLine} must use the "${kind}." namespace.`,
                sourcePath,
                line: entity.line ?? sourceLine,
                kind,
                symbol: entity.value,
            });
        }

        if (typeof coordsValue.value !== "string") {
            issues.push({
                code: "MISSING_FIELD",
                message: `OpenRune ${kind} spawn at ${sourcePath}:${sourceLine} requires a quoted "coords" value.`,
                sourcePath,
                line: sourceLine,
                kind,
                symbol: entity.value,
            });
            continue;
        }

        const coords = parseOpenRuneCoordGrid(coordsValue.value);
        if (!coords) {
            issues.push({
                code: "INVALID_COORDS",
                message: `OpenRune ${kind} spawn coords "${coordsValue.value}" at ${sourcePath}:${coordsValue.line ?? sourceLine} must be level_mapX_mapZ_localX_localZ with level 0..3 and local coordinates 0..63.`,
                sourcePath,
                line: coordsValue.line ?? sourceLine,
                kind,
                symbol: entity.value,
            });
            continue;
        }

        const resolved = resolveSymbol(entity.value, kind, gameVals);
        validateResolvedId(
            kind,
            entity.value,
            resolved,
            sourcePath,
            entity.line ?? sourceLine,
            gameVals,
            issues,
        );

        if (kind === "npc") {
            npcSpawns.push({
                kind: "npc",
                npc: entity.value,
                npcId: resolved,
                coords,
                sourcePath,
                line: sourceLine,
                ordinal: block.ordinal,
                rawText: block.rawText,
            });
            continue;
        }

        const countValue = assignmentValue(assignments, "count");
        const count = countValue.value === undefined ? 1 : countValue.value;
        if (
            typeof count !== "number" ||
            !Number.isSafeInteger(count) ||
            count < 0 ||
            count > 0xffffffff
        ) {
            issues.push({
                code: "INVALID_COUNT",
                message: `OpenRune obj spawn count at ${sourcePath}:${countValue.line ?? sourceLine} must be an integer in 0..4294967295.`,
                sourcePath,
                line: countValue.line ?? sourceLine,
                kind: "obj",
                symbol: entity.value,
            });
            continue;
        }

        objSpawns.push({
            kind: "obj",
            obj: entity.value,
            objId: resolved,
            count,
            coords,
            sourcePath,
            line: sourceLine,
            ordinal: block.ordinal,
            rawText: block.rawText,
        });
    }

    if (kind === "npc") {
        return {
            kind: "npc",
            sourcePath,
            sourceText: text,
            spawns: npcSpawns,
            issues,
        };
    }
    return {
        kind: "obj",
        sourcePath,
        sourceText: text,
        spawns: objSpawns,
        issues,
    };
}

export function parseOpenRuneNpcSpawnToml(
    sourcePath: string,
    text: string,
    gameVals?: GameValRegistry,
): OpenRuneNpcSpawnFileIndex {
    return parseSpawnFile("npc", sourcePath, text, gameVals) as OpenRuneNpcSpawnFileIndex;
}

export function parseOpenRuneObjSpawnToml(
    sourcePath: string,
    text: string,
    gameVals?: GameValRegistry,
): OpenRuneObjSpawnFileIndex {
    return parseSpawnFile("obj", sourcePath, text, gameVals) as OpenRuneObjSpawnFileIndex;
}

function stringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
        return undefined;
    }
    return value as string[];
}

function intArray(value: unknown): number[] | undefined {
    if (
        !Array.isArray(value) ||
        value.some((entry) => typeof entry !== "number" || !Number.isSafeInteger(entry))
    ) {
        return undefined;
    }
    return value as number[];
}

function polygonVertices(value: unknown): Array<readonly [number, number]> | undefined {
    if (!Array.isArray(value)) return undefined;
    const vertices: Array<readonly [number, number]> = [];
    for (const vertex of value) {
        if (
            !Array.isArray(vertex) ||
            vertex.length !== 2 ||
            !vertex.every(
                (coordinate) =>
                    typeof coordinate === "number" &&
                    Number.isSafeInteger(coordinate) &&
                    coordinate >= 0 &&
                    coordinate <= 0x3fff,
            )
        ) {
            return undefined;
        }
        vertices.push([vertex[0] as number, vertex[1] as number]);
    }
    return vertices;
}

function areaBlocks(text: string): Array<{
    ordinal: number;
    start: number;
    end: number;
    lines: string[];
    rawText: string;
}> {
    const lineEnding = text.includes("\r\n") ? "\r\n" : "\n";
    const lines = text.split(/\r?\n/);
    const starts: number[] = [];
    for (let index = 0; index < lines.length; index++) {
        const match = ARRAY_HEADER.exec(lines[index]!);
        if (match?.[1]?.trim() === "area") starts.push(index);
    }
    return starts.map((start, ordinal) => {
        const end = starts[ordinal + 1] ?? lines.length;
        return {
            ordinal,
            start,
            end,
            lines: lines.slice(start, end),
            rawText: lines.slice(start, end).join(lineEnding),
        };
    });
}

export function parseOpenRuneAreaToml(
    sourcePath: string,
    text: string,
    gameVals?: GameValRegistry,
): OpenRuneAreaFileIndex {
    const issues: OpenRuneMapSourceIssue[] = [];
    const areas: OpenRuneAreaSource[] = [];

    for (const block of areaBlocks(text)) {
        const polygonStarts: number[] = [];
        for (let index = 1; index < block.lines.length; index++) {
            const match = ARRAY_HEADER.exec(block.lines[index]!);
            if (match?.[1]?.trim() === "area.polygons") polygonStarts.push(index);
        }
        const topEnd = polygonStarts[0] ?? block.lines.length;
        const assignments = collectAssignments(block.lines, 1, topEnd);
        const sourceLine = block.start + 1;

        const nameValue = assignmentValue(assignments, "name");
        const idValue = assignmentValue(assignments, "area_id");
        const levelsValue = assignmentValue(assignments, "levels");
        const includesValue = assignmentValue(assignments, "includes");
        const excludesValue = assignmentValue(assignments, "excludes");

        if (typeof nameValue.value !== "string") {
            issues.push({
                code: "MISSING_FIELD",
                message: `OpenRune area at ${sourcePath}:${sourceLine} requires a quoted "name".`,
                sourcePath,
                line: sourceLine,
                kind: "area",
            });
            continue;
        }
        if (typeof idValue.value !== "string") {
            issues.push({
                code: "MISSING_FIELD",
                message: `OpenRune area at ${sourcePath}:${sourceLine} requires a quoted "area_id".`,
                sourcePath,
                line: sourceLine,
                kind: "area",
            });
            continue;
        }

        const areaId = idValue.value;
        if (!areaId.startsWith("area.")) {
            issues.push({
                code: "INVALID_SYMBOL",
                message: `OpenRune area id "${areaId}" at ${sourcePath}:${idValue.line ?? sourceLine} must use the "area." namespace.`,
                sourcePath,
                line: idValue.line ?? sourceLine,
                kind: "area",
                symbol: areaId,
            });
        }

        const levels = intArray(levelsValue.value);
        if (
            !levels ||
            levels.length === 0 ||
            levels.some((level) => level < 0 || level > 3)
        ) {
            issues.push({
                code: "INVALID_LEVELS",
                message: `OpenRune area levels at ${sourcePath}:${levelsValue.line ?? sourceLine} must be a non-empty integer array using levels 0..3.`,
                sourcePath,
                line: levelsValue.line ?? sourceLine,
                kind: "area",
                symbol: areaId,
            });
            continue;
        }

        const includes =
            includesValue.value === undefined
                ? []
                : stringArray(includesValue.value);
        const excludes =
            excludesValue.value === undefined
                ? []
                : stringArray(excludesValue.value);
        if (!includes || !excludes) {
            issues.push({
                code: "INVALID_AREA_REFERENCE",
                message: `OpenRune area includes/excludes at ${sourcePath}:${sourceLine} must be arrays of quoted area symbols.`,
                sourcePath,
                line: sourceLine,
                kind: "area",
                symbol: areaId,
            });
            continue;
        }

        const resolvedAreaId = resolveSymbol(areaId, "area", gameVals);
        validateResolvedId(
            "area",
            areaId,
            resolvedAreaId,
            sourcePath,
            idValue.line ?? sourceLine,
            gameVals,
            issues,
        );

        const resolvedIncludes: number[] = [];
        const resolvedExcludes: number[] = [];
        for (const [references, target, fieldLine] of [
            [includes, resolvedIncludes, includesValue.line],
            [excludes, resolvedExcludes, excludesValue.line],
        ] as const) {
            for (const reference of references) {
                if (!reference.startsWith("area.")) {
                    issues.push({
                        code: "INVALID_AREA_REFERENCE",
                        message: `OpenRune area reference "${reference}" at ${sourcePath}:${fieldLine ?? sourceLine} must use the "area." namespace.`,
                        sourcePath,
                        line: fieldLine ?? sourceLine,
                        kind: "area",
                        symbol: reference,
                    });
                    continue;
                }
                const resolved = resolveSymbol(reference, "area", gameVals);
                if (gameVals && resolved === undefined) {
                    issues.push({
                        code: "UNRESOLVED_SYMBOL",
                        message: `OpenRune area reference "${reference}" at ${sourcePath}:${fieldLine ?? sourceLine} is not present in the selected GameVal registry.`,
                        sourcePath,
                        line: fieldLine ?? sourceLine,
                        kind: "area",
                        symbol: reference,
                    });
                    continue;
                }
                if (resolved !== undefined) target.push(resolved);
            }
        }

        const polygons: OpenRuneAreaPolygon[] = [];
        for (let polygonIndex = 0; polygonIndex < polygonStarts.length; polygonIndex++) {
            const polygonStart = polygonStarts[polygonIndex]!;
            const polygonEnd = polygonStarts[polygonIndex + 1] ?? block.lines.length;
            const polygonAssignments = collectAssignments(
                block.lines,
                polygonStart + 1,
                polygonEnd,
            );
            const verticesValue = assignmentValue(polygonAssignments, "vertices");
            const vertices = polygonVertices(verticesValue.value);
            if (!vertices || vertices.length < 3) {
                issues.push({
                    code: "INVALID_POLYGON",
                    message: `OpenRune area polygon at ${sourcePath}:${block.start + polygonStart + 1} requires at least three [x, z] world-coordinate vertices in 0..16383.`,
                    sourcePath,
                    line: block.start + polygonStart + 1,
                    kind: "area",
                    symbol: areaId,
                });
                continue;
            }
            polygons.push({
                vertices,
                line: block.start + polygonStart + 1,
            });
        }

        areas.push({
            kind: "area",
            name: nameValue.value,
            areaId,
            resolvedAreaId,
            levels,
            includes,
            resolvedIncludes,
            excludes,
            resolvedExcludes,
            polygons,
            sourcePath,
            line: sourceLine,
            ordinal: block.ordinal,
            rawText: block.rawText,
        });
    }

    return {
        kind: "area",
        sourcePath,
        sourceText: text,
        areas,
        issues,
    };
}

function pushMap<K, T>(map: Map<K, T[]>, key: K, value: T): void {
    const existing = map.get(key);
    if (existing) existing.push(value);
    else map.set(key, [value]);
}

export async function indexProjectOpenRuneMapSources(
    fileSystem: ProjectFileSystem,
    project: Pick<OpenRuneProjectIndex, "rawMapSources">,
    gameVals?: GameValRegistry,
): Promise<OpenRuneMapSourceIndex> {
    const npcFiles: OpenRuneNpcSpawnFileIndex[] = [];
    const objFiles: OpenRuneObjSpawnFileIndex[] = [];
    const areaFiles: OpenRuneAreaFileIndex[] = [];

    for (const sourcePath of [...project.rawMapSources.npcTomlFiles].sort(compareText)) {
        npcFiles.push(
            parseOpenRuneNpcSpawnToml(
                sourcePath,
                await fileSystem.readText(sourcePath),
                gameVals,
            ),
        );
    }
    for (const sourcePath of [...project.rawMapSources.objTomlFiles].sort(compareText)) {
        objFiles.push(
            parseOpenRuneObjSpawnToml(
                sourcePath,
                await fileSystem.readText(sourcePath),
                gameVals,
            ),
        );
    }
    for (const sourcePath of [...project.rawMapSources.areaTomlFiles].sort(compareText)) {
        areaFiles.push(
            parseOpenRuneAreaToml(
                sourcePath,
                await fileSystem.readText(sourcePath),
                gameVals,
            ),
        );
    }

    const npcs = npcFiles.flatMap((file) => file.spawns);
    const objs = objFiles.flatMap((file) => file.spawns);
    const areas = areaFiles.flatMap((file) => file.areas);
    const issues = [
        ...npcFiles.flatMap((file) => file.issues),
        ...objFiles.flatMap((file) => file.issues),
        ...areaFiles.flatMap((file) => file.issues),
    ];

    const npcsByMapSquareMutable = new Map<number, OpenRuneNpcSpawn[]>();
    for (const spawn of npcs) {
        pushMap(npcsByMapSquareMutable, spawn.coords.mapSquareId, spawn);
    }

    const objsByMapSquareMutable = new Map<number, OpenRuneObjSpawn[]>();
    for (const spawn of objs) {
        pushMap(objsByMapSquareMutable, spawn.coords.mapSquareId, spawn);
    }

    const areasBySymbolMutable = new Map<string, OpenRuneAreaSource[]>();
    for (const area of areas) {
        pushMap(areasBySymbolMutable, area.areaId, area);
    }

    for (const [symbol, declarations] of areasBySymbolMutable) {
        if (declarations.length < 2) continue;
        issues.push({
            code: "DUPLICATE_AREA_ID",
            message: `OpenRune area "${symbol}" is declared multiple times.`,
            sourcePath: declarations[0]!.sourcePath,
            line: declarations[0]!.line,
            kind: "area",
            symbol,
            resolvedId: declarations[0]!.resolvedAreaId,
            related: declarations.map((area) => ({
                sourcePath: area.sourcePath,
                line: area.line,
                symbol: area.areaId,
            })),
        });
    }

    issues.sort(
        (a, b) =>
            compareText(a.sourcePath, b.sourcePath) ||
            (a.line ?? 0) - (b.line ?? 0) ||
            compareText(a.code, b.code),
    );

    return {
        npcFiles,
        objFiles,
        areaFiles,
        npcs,
        objs,
        areas,
        issues,
        npcsByMapSquare: new Map(npcsByMapSquareMutable),
        objsByMapSquare: new Map(objsByMapSquareMutable),
        areasBySymbol: new Map(areasBySymbolMutable),
    };
}

function quote(value: string): string {
    return JSON.stringify(value);
}

function coordText(coords: OpenRuneMapCoordGrid | string): string {
    return quote(formatOpenRuneCoordGrid(coords));
}

export function serializeOpenRuneNpcSpawnToml(
    spawns: readonly SerializableOpenRuneNpcSpawn[],
): string {
    return spawns
        .map(
            (spawn) =>
                `[[spawn]]\nnpc = ${quote(spawn.npc)}\ncoords = ${coordText(spawn.coords)}`,
        )
        .join("\n\n")
        .concat(spawns.length ? "\n" : "");
}

export function serializeOpenRuneObjSpawnToml(
    spawns: readonly SerializableOpenRuneObjSpawn[],
): string {
    return spawns
        .map((spawn) => {
            const lines = [
                "[[spawn]]",
                `obj = ${quote(spawn.obj)}`,
            ];
            if (spawn.count !== undefined && spawn.count !== 1) {
                if (
                    !Number.isSafeInteger(spawn.count) ||
                    spawn.count < 0 ||
                    spawn.count > 0xffffffff
                ) {
                    throw new Error("OpenRune obj spawn count must be in 0..4294967295.");
                }
                lines.push(`count = ${spawn.count}`);
            }
            lines.push(`coords = ${coordText(spawn.coords)}`);
            return lines.join("\n");
        })
        .join("\n\n")
        .concat(spawns.length ? "\n" : "");
}

function serializeStringArray(name: string, values: readonly string[]): string[] {
    if (values.length === 0) return [];
    return [
        `${name} = [`,
        ...values.map((value) => `    ${quote(value)},`),
        "]",
    ];
}

export function serializeOpenRuneAreaToml(
    areas: readonly SerializableOpenRuneArea[],
): string {
    const blocks = areas.map((area) => {
        if (
            area.levels.length === 0 ||
            area.levels.some(
                (level) =>
                    !Number.isSafeInteger(level) || level < 0 || level > 3,
            )
        ) {
            throw new Error("OpenRune area levels must be non-empty and within 0..3.");
        }

        const lines = [
            "[[area]]",
            `name = ${quote(area.name)}`,
            `area_id = ${quote(area.areaId)}`,
            `levels = [${area.levels.join(", ")}]`,
            ...serializeStringArray("includes", area.includes ?? []),
            ...serializeStringArray("excludes", area.excludes ?? []),
        ];

        for (const polygon of area.polygons ?? []) {
            if (
                polygon.length < 3 ||
                polygon.some(
                    (vertex) =>
                        vertex.length !== 2 ||
                        vertex.some(
                            (coordinate) =>
                                !Number.isSafeInteger(coordinate) ||
                                coordinate < 0 ||
                                coordinate > 0x3fff,
                        ),
                )
            ) {
                throw new Error(
                    "OpenRune area polygons require at least three [x, z] vertices in 0..16383.",
                );
            }

            lines.push("", "[[area.polygons]]", "vertices = [");
            for (const [x, z] of polygon) {
                lines.push(`    [${x}, ${z}],`);
            }
            lines.push("]");
        }

        return lines.join("\n");
    });

    return blocks.join("\n\n").concat(blocks.length ? "\n" : "");
}

/**
 * Replaces an existing map-source TOML file only if it still matches the text
 * used to build the editor/index view. Passing expectedText undefined creates a
 * new file and refuses to overwrite an existing source.
 */
export async function replaceOpenRuneMapSourceFile(
    fileSystem: ProjectFileSystem,
    sourcePath: string,
    nextText: string,
    expectedText?: string,
): Promise<void> {
    if (!sourcePath.toLowerCase().endsWith(".toml")) {
        throw new OpenRuneMapSourceWriteError(
            "INVALID_PATH",
            "OpenRune map source files must use the .toml extension.",
            sourcePath,
        );
    }

    const exists = await fileSystem.exists(sourcePath);
    if (expectedText === undefined) {
        if (exists) {
            throw new OpenRuneMapSourceWriteError(
                "SOURCE_EXISTS",
                `OpenRune map source "${sourcePath}" already exists.`,
                sourcePath,
            );
        }
    } else {
        if (!exists) {
            throw new OpenRuneMapSourceWriteError(
                "SOURCE_MISSING",
                `OpenRune map source "${sourcePath}" no longer exists.`,
                sourcePath,
            );
        }
        const current = await fileSystem.readText(sourcePath);
        if (current !== expectedText) {
            throw new OpenRuneMapSourceWriteError(
                "STALE_SOURCE",
                `OpenRune map source "${sourcePath}" changed on disk. Re-index before writing.`,
                sourcePath,
            );
        }
    }

    await fileSystem.writeText(sourcePath, nextText);
}
