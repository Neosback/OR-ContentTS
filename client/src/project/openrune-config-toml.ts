import {
    findGameValSymbol,
    type GameValRegistry,
} from "./gameval-registry";
import type {
    OpenRunePackRoot,
    OpenRuneProjectIndex,
} from "./openrune-project-index";
import {
    walkProjectDirectory,
    type ProjectFileSystem,
} from "./project-filesystem";

export const OPENRUNE_CONFIG_BLOCK_TYPES = [
    "item",
    "texture",
    "object",
    "enum",
    "graphics",
    "graphic",
    "animation",
    "npc",
    "varbit",
    "mapelement",
    "health",
    "ambience",
    "hitsplat",
    "idk",
    "inventory",
    "overlay",
    "underlay",
    "params",
    "varp",
    "varclient",
] as const;

export type OpenRuneConfigBlockType =
    (typeof OPENRUNE_CONFIG_BLOCK_TYPES)[number];

export type OpenRuneTomlScalar = string | number | boolean;

export type OpenRuneConfigField = {
    name: string;
    rawValue: string;
    value?: OpenRuneTomlScalar;
    line: number;
};

export type OpenRuneConfigIssueCode =
    | "INVALID_ID"
    | "INVALID_INHERIT"
    | "UNRESOLVED_ID"
    | "UNRESOLVED_INHERIT"
    | "DUPLICATE_TARGET";

export type OpenRuneConfigIssue = {
    code: OpenRuneConfigIssueCode;
    message: string;
    sourcePath: string;
    line?: number;
    type?: OpenRuneConfigBlockType;
    id?: string | number;
    resolvedId?: number;
    related?: Array<{
        sourcePath: string;
        line: number;
        type: OpenRuneConfigBlockType;
        ordinal: number;
    }>;
};

export type OpenRuneConfigDefinitionBlock = {
    type: OpenRuneConfigBlockType;
    ordinal: number;
    sourcePath: string;
    modulePath?: string;
    packRootPath?: string;
    startLine: number;
    endLine: number;
    rawText: string;
    fields: readonly OpenRuneConfigField[];
    id?: string | number;
    resolvedId?: number;
    inherit?: string | number;
    resolvedInheritId?: number;
    isServerOnly: boolean;
};

export type OpenRuneConfigTomlFileIndex = {
    sourcePath: string;
    modulePath?: string;
    packRootPath?: string;
    blocks: readonly OpenRuneConfigDefinitionBlock[];
    issues: readonly OpenRuneConfigIssue[];
};

export type OpenRuneConfigTomlIndex = {
    files: readonly OpenRuneConfigTomlFileIndex[];
    blocks: readonly OpenRuneConfigDefinitionBlock[];
    issues: readonly OpenRuneConfigIssue[];
    byType: ReadonlyMap<
        OpenRuneConfigBlockType,
        readonly OpenRuneConfigDefinitionBlock[]
    >;
    byTarget: ReadonlyMap<string, readonly OpenRuneConfigDefinitionBlock[]>;
};

export type ParseOpenRuneConfigTomlOptions = {
    modulePath?: string;
    packRootPath?: string;
    gameVals?: GameValRegistry;
};

export type OpenRuneConfigWriteErrorCode =
    | "INVALID_FIELD"
    | "BLOCK_NOT_FOUND"
    | "STALE_SOURCE";

export class OpenRuneConfigWriteError extends Error {
    constructor(
        readonly code: OpenRuneConfigWriteErrorCode,
        message: string,
        readonly sourcePath: string,
    ) {
        super(message);
        this.name = "OpenRuneConfigWriteError";
    }
}

const PACK_TYPE_SET = new Set<string>(OPENRUNE_CONFIG_BLOCK_TYPES);
const BLOCK_HEADER = /^\s*\[\[\s*([^\[\]]+?)\s*\]\](?:\s*#.*)?\s*$/;
const SUB_TABLE_HEADER = /^\s*\[(?!\[)/;
const SIMPLE_FIELD = /^[A-Za-z_][A-Za-z0-9_]*$/;

function compareText(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

function canonicalTargetType(
    type: OpenRuneConfigBlockType,
): OpenRuneConfigBlockType {
    return type === "graphic" ? "graphics" : type;
}

function targetKey(type: OpenRuneConfigBlockType, id: number): string {
    return `${canonicalTargetType(type)}\u0000${id}`;
}

function splitInlineComment(raw: string): {
    value: string;
    comment?: string;
} {
    let singleQuoted = false;
    let doubleQuoted = false;
    let escaped = false;

    for (let index = 0; index < raw.length; index++) {
        const char = raw[index]!;
        if (doubleQuoted) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (char === "\\") {
                escaped = true;
                continue;
            }
            if (char === '"') doubleQuoted = false;
            continue;
        }
        if (singleQuoted) {
            if (char === "'") singleQuoted = false;
            continue;
        }
        if (char === '"') {
            doubleQuoted = true;
            continue;
        }
        if (char === "'") {
            singleQuoted = true;
            continue;
        }
        if (char === "#") {
            return {
                value: raw.slice(0, index).trimEnd(),
                comment: raw.slice(index),
            };
        }
    }

    return { value: raw.trimEnd() };
}

function parseTomlScalar(raw: string): OpenRuneTomlScalar | undefined {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;

    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        try {
            const decoded = JSON.parse(trimmed);
            return typeof decoded === "string" ? decoded : undefined;
        } catch {
            return undefined;
        }
    }

    if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
        return trimmed.slice(1, -1);
    }

    if (trimmed === "true") return true;
    if (trimmed === "false") return false;

    if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) {
        const value = Number(trimmed);
        return Number.isFinite(value) ? value : undefined;
    }

    return undefined;
}

type ParsedAssignment = {
    indent: string;
    name: string;
    rawValue: string;
    value?: OpenRuneTomlScalar;
    comment?: string;
};

function parseAssignmentLine(line: string): ParsedAssignment | undefined {
    const equals = line.indexOf("=");
    if (equals <= 0) return undefined;

    const left = line.slice(0, equals);
    const indent = /^\s*/.exec(left)?.[0] ?? "";
    const rawName = left.trim();
    const name =
        rawName.startsWith('"') && rawName.endsWith('"')
            ? rawName.slice(1, -1)
            : rawName;
    if (!SIMPLE_FIELD.test(name)) return undefined;

    const right = splitInlineComment(line.slice(equals + 1));
    const rawValue = right.value.trim();

    return {
        indent,
        name,
        rawValue,
        value: parseTomlScalar(rawValue),
        comment: right.comment,
    };
}

function numericOrSymbolicId(
    value: OpenRuneTomlScalar | undefined,
): string | number | undefined {
    if (typeof value === "string") return value;
    if (
        typeof value === "number" &&
        Number.isSafeInteger(value) &&
        value >= -1 &&
        value <= 0x7fffffff
    ) {
        return value;
    }
    return undefined;
}

function resolveConfigId(
    id: string | number | undefined,
    gameVals?: GameValRegistry,
): number | undefined {
    if (typeof id === "number") return id;
    if (typeof id === "string" && gameVals) {
        return findGameValSymbol(gameVals, id)?.id;
    }
    return undefined;
}

function fieldNamed(
    fields: readonly OpenRuneConfigField[],
    name: string,
): OpenRuneConfigField | undefined {
    return fields.find((field) => field.name === name);
}

function parseDefinitionBlock(
    sourcePath: string,
    lines: readonly string[],
    start: number,
    end: number,
    type: OpenRuneConfigBlockType,
    ordinal: number,
    lineEnding: string,
    options: ParseOpenRuneConfigTomlOptions,
): {
    block: OpenRuneConfigDefinitionBlock;
    issues: OpenRuneConfigIssue[];
} {
    const fields: OpenRuneConfigField[] = [];
    const issues: OpenRuneConfigIssue[] = [];

    for (let index = start + 1; index < end; index++) {
        const line = lines[index]!;
        if (SUB_TABLE_HEADER.test(line)) break;

        const parsed = parseAssignmentLine(line);
        if (!parsed) continue;

        fields.push({
            name: parsed.name,
            rawValue: parsed.rawValue,
            value: parsed.value,
            line: index + 1,
        });
    }

    const idField = fieldNamed(fields, "id");
    const inheritField = fieldNamed(fields, "inherit");
    const serverOnlyField = fieldNamed(fields, "isServerOnly");

    const id = numericOrSymbolicId(idField?.value);
    const inherit = numericOrSymbolicId(inheritField?.value);
    const resolvedId = resolveConfigId(id, options.gameVals);
    const resolvedInheritId = resolveConfigId(inherit, options.gameVals);

    if (idField && id === undefined) {
        issues.push({
            code: "INVALID_ID",
            message: `OpenRune config id at ${sourcePath}:${idField.line} must be a quoted GameVal symbol or a 32-bit integer.`,
            sourcePath,
            line: idField.line,
            type,
        });
    } else if (
        typeof id === "string" &&
        options.gameVals &&
        resolvedId === undefined
    ) {
        issues.push({
            code: "UNRESOLVED_ID",
            message: `OpenRune config id "${id}" at ${sourcePath}:${idField!.line} is not present in the selected GameVal registry.`,
            sourcePath,
            line: idField!.line,
            type,
            id,
        });
    }

    if (inheritField && inherit === undefined) {
        issues.push({
            code: "INVALID_INHERIT",
            message: `OpenRune config inherit value at ${sourcePath}:${inheritField.line} must be a quoted GameVal symbol or a 32-bit integer.`,
            sourcePath,
            line: inheritField.line,
            type,
        });
    } else if (
        typeof inherit === "string" &&
        options.gameVals &&
        resolvedInheritId === undefined
    ) {
        issues.push({
            code: "UNRESOLVED_INHERIT",
            message: `OpenRune config inherit symbol "${inherit}" at ${sourcePath}:${inheritField!.line} is not present in the selected GameVal registry.`,
            sourcePath,
            line: inheritField!.line,
            type,
            id: inherit,
        });
    }

    return {
        block: {
            type,
            ordinal,
            sourcePath,
            modulePath: options.modulePath,
            packRootPath: options.packRootPath,
            startLine: start + 1,
            endLine: end,
            rawText: lines.slice(start, end).join(lineEnding),
            fields,
            id,
            resolvedId,
            inherit,
            resolvedInheritId,
            isServerOnly: serverOnlyField?.value === true,
        },
        issues,
    };
}

/**
 * Scans the same top-level [[block]] shape used by OpenRune PackConfig while
 * leaving nested TOML and unknown definition fields untouched.
 *
 * This is intentionally not a general TOML decoder. It extracts source
 * identity/provenance and safe top-level scalar fields while preserving the
 * original block text for source-aware writes.
 */
export function parseOpenRuneConfigToml(
    sourcePath: string,
    text: string,
    options: ParseOpenRuneConfigTomlOptions = {},
): OpenRuneConfigTomlFileIndex {
    const lineEnding = text.includes("\r\n") ? "\r\n" : "\n";
    const lines = text.split(/\r?\n/);
    const headers: Array<{ index: number; name: string }> = [];

    for (let index = 0; index < lines.length; index++) {
        const match = BLOCK_HEADER.exec(lines[index]!);
        if (match) headers.push({ index, name: match[1]!.trim() });
    }

    const ordinals = new Map<string, number>();
    const blocks: OpenRuneConfigDefinitionBlock[] = [];
    const issues: OpenRuneConfigIssue[] = [];

    for (let headerIndex = 0; headerIndex < headers.length; headerIndex++) {
        const header = headers[headerIndex]!;
        const end = headers[headerIndex + 1]?.index ?? lines.length;
        const ordinal = ordinals.get(header.name) ?? 0;
        ordinals.set(header.name, ordinal + 1);

        if (!PACK_TYPE_SET.has(header.name)) continue;

        const parsed = parseDefinitionBlock(
            sourcePath,
            lines,
            header.index,
            end,
            header.name as OpenRuneConfigBlockType,
            ordinal,
            lineEnding,
            options,
        );
        blocks.push(parsed.block);
        issues.push(...parsed.issues);
    }

    return {
        sourcePath,
        modulePath: options.modulePath,
        packRootPath: options.packRootPath,
        blocks,
        issues,
    };
}

async function configFilesForPackRoot(
    fileSystem: ProjectFileSystem,
    packRoot: OpenRunePackRoot,
): Promise<string[]> {
    if (!packRoot.configsPath) return [];

    const entries = await walkProjectDirectory(fileSystem, packRoot.configsPath);
    return entries
        .filter(
            (entry) =>
                entry.kind === "file" &&
                entry.path.toLowerCase().endsWith(".toml"),
        )
        .map((entry) => entry.path)
        .sort(compareText);
}

export async function indexProjectOpenRuneConfigToml(
    fileSystem: ProjectFileSystem,
    project: Pick<OpenRuneProjectIndex, "packRoots">,
    gameVals?: GameValRegistry,
): Promise<OpenRuneConfigTomlIndex> {
    const sourceOwners = new Map<
        string,
        { modulePath: string; packRootPath: string }
    >();

    for (const packRoot of [...project.packRoots].sort((a, b) =>
        compareText(a.path, b.path),
    )) {
        for (const sourcePath of await configFilesForPackRoot(
            fileSystem,
            packRoot,
        )) {
            sourceOwners.set(sourcePath, {
                modulePath: packRoot.modulePath,
                packRootPath: packRoot.path,
            });
        }
    }

    const files: OpenRuneConfigTomlFileIndex[] = [];
    for (const [sourcePath, owner] of [...sourceOwners.entries()].sort((a, b) =>
        compareText(a[0], b[0]),
    )) {
        files.push(
            parseOpenRuneConfigToml(
                sourcePath,
                await fileSystem.readText(sourcePath),
                {
                    ...owner,
                    gameVals,
                },
            ),
        );
    }

    const blocks = files.flatMap((file) => file.blocks);
    const issues = files.flatMap((file) => file.issues);
    const byTypeMutable = new Map<
        OpenRuneConfigBlockType,
        OpenRuneConfigDefinitionBlock[]
    >();
    const byTargetMutable = new Map<string, OpenRuneConfigDefinitionBlock[]>();

    for (const block of blocks) {
        const typed = byTypeMutable.get(block.type);
        if (typed) typed.push(block);
        else byTypeMutable.set(block.type, [block]);

        if (block.resolvedId === undefined || block.resolvedId < 0) continue;
        const key = targetKey(block.type, block.resolvedId);
        const targeted = byTargetMutable.get(key);
        if (targeted) targeted.push(block);
        else byTargetMutable.set(key, [block]);
    }

    for (const declarations of byTargetMutable.values()) {
        if (declarations.length < 2) continue;
        const first = declarations[0]!;
        issues.push({
            code: "DUPLICATE_TARGET",
            message: `OpenRune config target "${canonicalTargetType(first.type)}" id ${first.resolvedId} is declared by multiple source blocks.`,
            sourcePath: first.sourcePath,
            line: first.startLine,
            type: first.type,
            id: first.id,
            resolvedId: first.resolvedId,
            related: declarations.map((block) => ({
                sourcePath: block.sourcePath,
                line: block.startLine,
                type: block.type,
                ordinal: block.ordinal,
            })),
        });
    }

    issues.sort(
        (a, b) =>
            compareText(a.sourcePath, b.sourcePath) ||
            (a.line ?? 0) - (b.line ?? 0) ||
            compareText(a.code, b.code),
    );

    const byType = new Map<
        OpenRuneConfigBlockType,
        readonly OpenRuneConfigDefinitionBlock[]
    >();
    for (const [type, declarations] of byTypeMutable) {
        byType.set(type, [...declarations]);
    }

    const byTarget = new Map<
        string,
        readonly OpenRuneConfigDefinitionBlock[]
    >();
    for (const [key, declarations] of byTargetMutable) {
        byTarget.set(key, [...declarations]);
    }

    return {
        files,
        blocks,
        issues,
        byType,
        byTarget,
    };
}

export function findOpenRuneConfigById(
    index: OpenRuneConfigTomlIndex,
    type: OpenRuneConfigBlockType,
    id: number,
): readonly OpenRuneConfigDefinitionBlock[] {
    if (!Number.isSafeInteger(id) || id < 0) return [];
    return index.byTarget.get(targetKey(type, id)) ?? [];
}

export function findOpenRuneConfigByType(
    index: OpenRuneConfigTomlIndex,
    type: OpenRuneConfigBlockType,
): readonly OpenRuneConfigDefinitionBlock[] {
    return index.byType.get(type) ?? [];
}

function serializeTomlScalar(value: OpenRuneTomlScalar): string {
    if (typeof value === "string") {
        return JSON.stringify(value);
    }
    if (typeof value === "boolean") {
        return value ? "true" : "false";
    }
    if (!Number.isFinite(value)) {
        throw new Error("TOML numeric values must be finite.");
    }
    return String(value);
}

function locateCurrentBlock(
    sourcePath: string,
    text: string,
    expected: OpenRuneConfigDefinitionBlock,
): OpenRuneConfigDefinitionBlock {
    const parsed = parseOpenRuneConfigToml(sourcePath, text);
    const current = parsed.blocks.find(
        (block) =>
            block.type === expected.type && block.ordinal === expected.ordinal,
    );

    if (!current) {
        throw new OpenRuneConfigWriteError(
            "BLOCK_NOT_FOUND",
            `OpenRune config block ${expected.type}#${expected.ordinal} no longer exists in "${sourcePath}".`,
            sourcePath,
        );
    }

    if (current.rawText !== expected.rawText) {
        throw new OpenRuneConfigWriteError(
            "STALE_SOURCE",
            `OpenRune config block ${expected.type}#${expected.ordinal} changed on disk. Re-index the project before writing.`,
            sourcePath,
        );
    }

    return current;
}

/**
 * Updates, inserts, or removes one top-level scalar property while preserving
 * the rest of the OpenRune source block byte-for-byte at the line level.
 *
 * Nested tables such as [item.params] are never rewritten by this helper.
 * Callers must re-index after a successful write before applying another edit.
 */
export async function updateOpenRuneConfigField(
    fileSystem: ProjectFileSystem,
    expected: OpenRuneConfigDefinitionBlock,
    field: string,
    value: OpenRuneTomlScalar | undefined,
): Promise<void> {
    if (!SIMPLE_FIELD.test(field)) {
        throw new OpenRuneConfigWriteError(
            "INVALID_FIELD",
            `OpenRune config field "${field}" is not a simple top-level TOML key.`,
            expected.sourcePath,
        );
    }

    const text = await fileSystem.readText(expected.sourcePath);
    const current = locateCurrentBlock(expected.sourcePath, text, expected);
    const lineEnding = text.includes("\r\n") ? "\r\n" : "\n";
    const lines = text.split(/\r?\n/);

    const existing = current.fields.find((candidate) => candidate.name === field);
    if (existing) {
        const lineIndex = existing.line - 1;
        if (value === undefined) {
            lines.splice(lineIndex, 1);
        } else {
            const parsed = parseAssignmentLine(lines[lineIndex]!);
            const indent = parsed?.indent ?? "";
            const comment = parsed?.comment ? ` ${parsed.comment}` : "";
            lines[lineIndex] =
                `${indent}${field} = ${serializeTomlScalar(value)}${comment}`;
        }
    } else if (value !== undefined) {
        let insertion = current.endLine;
        for (
            let index = current.startLine;
            index < current.endLine;
            index++
        ) {
            if (SUB_TABLE_HEADER.test(lines[index]!)) {
                insertion = index;
                break;
            }
        }

        while (
            insertion > current.startLine &&
            lines[insertion - 1]?.trim() === ""
        ) {
            insertion--;
        }

        lines.splice(
            insertion,
            0,
            `${field} = ${serializeTomlScalar(value)}`,
        );
    }

    await fileSystem.writeText(expected.sourcePath, lines.join(lineEnding));
}
