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

export const OPENRUNE_SERVER_TABLES = [
    "object",
    "npc",
    "item",
    "varp",
    "health",
    "anims",
    "mesanim",
    "walktrigger",
    "varn",
    "varnbit",
    "varcon",
    "varobj",
    "varconbit",
    "hunt",
    "stat",
    "projectile",
    "bas",
    "inventory",
] as const;

export type OpenRuneServerTable = (typeof OPENRUNE_SERVER_TABLES)[number];
export type OpenRuneServerSourceKind = "raw-server" | "pack-config";
export type OpenRuneServerScalar = string | number | boolean;

export type OpenRuneServerField = {
    name: string;
    rawValue: string;
    value?: OpenRuneServerScalar;
    line: number;
};

export type OpenRuneServerNestedSection = {
    name: string;
    line: number;
    endLine: number;
    rawText: string;
};

export type OpenRuneServerDefinitionBlock = {
    table: OpenRuneServerTable;
    ordinal: number;
    sourceKind: OpenRuneServerSourceKind;
    sourcePath: string;
    modulePath?: string;
    packRootPath?: string;
    startLine: number;
    endLine: number;
    rawText: string;
    fields: readonly OpenRuneServerField[];
    nestedSections: readonly OpenRuneServerNestedSection[];
    id?: string | number;
    resolvedId?: number;
    inherit?: string | number;
    resolvedInheritId?: number;
    isServerOnly: boolean;
};

export type OpenRuneInventoryStock = {
    obj: string;
    resolvedObjId?: number;
    count: number;
    restockCycles: number;
    sourcePath: string;
    line: number;
    rawText: string;
};

export type OpenRuneInventoryDefinition = {
    block: OpenRuneServerDefinitionBlock;
    name?: string;
    scope?: string;
    stack?: string;
    size?: number;
    stock: readonly OpenRuneInventoryStock[];
};

export type OpenRuneServerTomlIssueCode =
    | "INVALID_ID"
    | "INVALID_INHERIT"
    | "UNRESOLVED_ID"
    | "UNRESOLVED_INHERIT"
    | "DUPLICATE_TARGET"
    | "INVALID_STOCK"
    | "UNRESOLVED_STOCK_OBJ"
    | "TOO_MANY_STOCK_ENTRIES";

export type OpenRuneServerTomlIssue = {
    code: OpenRuneServerTomlIssueCode;
    message: string;
    sourcePath: string;
    line?: number;
    table?: OpenRuneServerTable;
    id?: string | number;
    resolvedId?: number;
    related?: Array<{
        sourceKind: OpenRuneServerSourceKind;
        sourcePath: string;
        line: number;
        table: OpenRuneServerTable;
        ordinal: number;
    }>;
};

export type OpenRuneServerTomlFileIndex = {
    sourceKind: OpenRuneServerSourceKind;
    sourcePath: string;
    sourceText: string;
    modulePath?: string;
    packRootPath?: string;
    blocks: readonly OpenRuneServerDefinitionBlock[];
    inventories: readonly OpenRuneInventoryDefinition[];
    issues: readonly OpenRuneServerTomlIssue[];
};

export type OpenRuneServerTomlIndex = {
    files: readonly OpenRuneServerTomlFileIndex[];
    blocks: readonly OpenRuneServerDefinitionBlock[];
    inventories: readonly OpenRuneInventoryDefinition[];
    issues: readonly OpenRuneServerTomlIssue[];
    byTable: ReadonlyMap<
        OpenRuneServerTable,
        readonly OpenRuneServerDefinitionBlock[]
    >;
    bySymbol: ReadonlyMap<string, readonly OpenRuneServerDefinitionBlock[]>;
    byTarget: ReadonlyMap<string, readonly OpenRuneServerDefinitionBlock[]>;
};

export type ParseOpenRuneServerTomlOptions = {
    sourceKind?: OpenRuneServerSourceKind;
    modulePath?: string;
    packRootPath?: string;
    gameVals?: GameValRegistry;
};

export type SerializableOpenRuneInventoryStock = {
    obj: string;
    count: number;
    restockCycles: number;
};

export type SerializableOpenRuneInventory = {
    id: string | number;
    isServerOnly?: boolean;
    name?: string;
    scope?: string;
    stack?: string;
    sellMultiplier?: number;
    buyMultiplier?: number;
    delta?: number;
    size?: number;
    protect?: boolean;
    runWeight?: boolean;
    restock?: boolean;
    allStock?: boolean;
    dummyInv?: boolean;
    placeholders?: boolean;
    uimBlocked?: boolean;
    stock?: readonly SerializableOpenRuneInventoryStock[];
};

export type OpenRuneServerWriteErrorCode =
    | "INVALID_FIELD"
    | "BLOCK_NOT_FOUND"
    | "STALE_SOURCE"
    | "INVALID_PATH"
    | "SOURCE_MISSING"
    | "SOURCE_EXISTS";

export class OpenRuneServerWriteError extends Error {
    constructor(
        readonly code: OpenRuneServerWriteErrorCode,
        message: string,
        readonly sourcePath: string,
    ) {
        super(message);
        this.name = "OpenRuneServerWriteError";
    }
}

const TABLE_SET = new Set<string>(OPENRUNE_SERVER_TABLES);
const ARRAY_HEADER = /^\s*\[\[\s*([^\[\]]+?)\s*\]\](?:\s*#.*)?\s*$/;
const TABLE_HEADER = /^\s*\[\s*([^\[\]]+?)\s*\](?:\s*#.*)?\s*$/;
const SIMPLE_FIELD = /^[A-Za-z_][A-Za-z0-9_]*$/;

function compareText(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

function targetKey(table: OpenRuneServerTable, id: number): string {
    return `${table}\u0000${id}`;
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

function parseScalar(raw: string): OpenRuneServerScalar | undefined {
    const trimmed = stripInlineComment(raw).trim();
    if (!trimmed) return undefined;

    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        try {
            const value = JSON.parse(trimmed);
            return typeof value === "string" ? value : undefined;
        } catch {
            return undefined;
        }
    }
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
        return trimmed.slice(1, -1);
    }
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    if (/^[+-]?\d+$/.test(trimmed)) {
        const value = Number(trimmed);
        return Number.isSafeInteger(value) ? value : undefined;
    }
    if (/^[+-]?(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) {
        const value = Number(trimmed);
        return Number.isFinite(value) ? value : undefined;
    }
    return undefined;
}

type ParsedAssignment = {
    indent: string;
    name: string;
    rawValue: string;
    value?: OpenRuneServerScalar;
    comment?: string;
};

function splitValueAndComment(raw: string): {
    value: string;
    comment?: string;
} {
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
        if (char === "#") {
            return {
                value: raw.slice(0, index).trimEnd(),
                comment: raw.slice(index),
            };
        }
    }
    return { value: raw.trimEnd() };
}

function parseAssignment(line: string): ParsedAssignment | undefined {
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

    const split = splitValueAndComment(line.slice(equals + 1));
    const rawValue = split.value.trim();
    return {
        indent,
        name,
        rawValue,
        value: parseScalar(rawValue),
        comment: split.comment,
    };
}

function identityValue(
    value: OpenRuneServerScalar | undefined,
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

function resolveIdentity(
    value: string | number | undefined,
    gameVals?: GameValRegistry,
): number | undefined {
    if (typeof value === "number") return value;
    return typeof value === "string" && gameVals
        ? findGameValSymbol(gameVals, value)?.id
        : undefined;
}

function sourceBlocks(text: string): Array<{
    table: OpenRuneServerTable;
    ordinal: number;
    start: number;
    end: number;
}> {
    const lines = text.split(/\r?\n/);
    const headers: Array<{
        table: OpenRuneServerTable;
        start: number;
    }> = [];

    for (let index = 0; index < lines.length; index++) {
        const match = ARRAY_HEADER.exec(lines[index]!);
        const name = match?.[1]?.trim();
        if (name && TABLE_SET.has(name)) {
            headers.push({
                table: name as OpenRuneServerTable,
                start: index,
            });
        }
    }

    const ordinals = new Map<string, number>();
    return headers.map((header, index) => {
        const ordinal = ordinals.get(header.table) ?? 0;
        ordinals.set(header.table, ordinal + 1);
        return {
            ...header,
            ordinal,
            end: headers[index + 1]?.start ?? lines.length,
        };
    });
}

function nestedSections(
    lines: readonly string[],
    sourceStart: number,
    start: number,
    end: number,
    lineEnding: string,
): OpenRuneServerNestedSection[] {
    const headers: Array<{ name: string; start: number }> = [];
    for (let index = start + 1; index < end; index++) {
        const array = ARRAY_HEADER.exec(lines[index]!);
        const table = TABLE_HEADER.exec(lines[index]!);
        const name = array?.[1]?.trim() ?? table?.[1]?.trim();
        if (name) headers.push({ name, start: index });
    }

    return headers.map((header, index) => {
        const sectionEnd = headers[index + 1]?.start ?? end;
        return {
            name: header.name,
            line: sourceStart + header.start + 1,
            endLine: sourceStart + sectionEnd,
            rawText: lines.slice(header.start, sectionEnd).join(lineEnding),
        };
    });
}

function topLevelFields(
    lines: readonly string[],
    sourceStart: number,
    start: number,
    end: number,
): OpenRuneServerField[] {
    const fields: OpenRuneServerField[] = [];
    for (let index = start + 1; index < end; index++) {
        if (ARRAY_HEADER.test(lines[index]!) || TABLE_HEADER.test(lines[index]!)) {
            break;
        }
        const assignment = parseAssignment(lines[index]!);
        if (!assignment) continue;
        fields.push({
            name: assignment.name,
            rawValue: assignment.rawValue,
            value: assignment.value,
            line: sourceStart + index + 1,
        });
    }
    return fields;
}

function field(
    fields: readonly OpenRuneServerField[],
    name: string,
): OpenRuneServerField | undefined {
    return fields.find((entry) => entry.name === name);
}

function issueIdentity(
    block: OpenRuneServerDefinitionBlock,
    which: "id" | "inherit",
    value: string | number | undefined,
    resolved: number | undefined,
    gameVals: GameValRegistry | undefined,
): OpenRuneServerTomlIssue | undefined {
    const source = field(block.fields, which);
    if (source && value === undefined) {
        return {
            code: which === "id" ? "INVALID_ID" : "INVALID_INHERIT",
            message: `OpenRune server ${which} at ${block.sourcePath}:${source.line} must be a quoted GameVal symbol or a 32-bit integer.`,
            sourcePath: block.sourcePath,
            line: source.line,
            table: block.table,
        };
    }
    if (typeof value === "string" && gameVals && resolved === undefined) {
        return {
            code: which === "id" ? "UNRESOLVED_ID" : "UNRESOLVED_INHERIT",
            message: `OpenRune server ${which} "${value}" at ${block.sourcePath}:${source?.line ?? block.startLine} is not present in the selected GameVal registry.`,
            sourcePath: block.sourcePath,
            line: source?.line ?? block.startLine,
            table: block.table,
            id: value,
        };
    }
    return undefined;
}

function parseInventoryStock(
    block: OpenRuneServerDefinitionBlock,
    lines: readonly string[],
    blockStart: number,
    blockEnd: number,
    gameVals: GameValRegistry | undefined,
): {
    stock: OpenRuneInventoryStock[];
    issues: OpenRuneServerTomlIssue[];
} {
    const lineEnding = block.rawText.includes("\r\n") ? "\r\n" : "\n";
    const headers: number[] = [];
    for (let index = blockStart + 1; index < blockEnd; index++) {
        const match = ARRAY_HEADER.exec(lines[index]!);
        if (match?.[1]?.trim() === "inventory.stock") headers.push(index);
    }

    const stock: OpenRuneInventoryStock[] = [];
    const issues: OpenRuneServerTomlIssue[] = [];

    for (let stockIndex = 0; stockIndex < headers.length; stockIndex++) {
        const start = headers[stockIndex]!;
        let end = blockEnd;
        for (let index = start + 1; index < blockEnd; index++) {
            if (ARRAY_HEADER.test(lines[index]!) || TABLE_HEADER.test(lines[index]!)) {
                end = index;
                break;
            }
        }

        const fields = topLevelFields(lines, 0, start, end);
        const obj = field(fields, "obj");
        const count = field(fields, "count");
        const restockCycles = field(fields, "restockCycles");
        const line = start + 1;

        if (
            typeof obj?.value !== "string" ||
            typeof count?.value !== "number" ||
            !Number.isSafeInteger(count.value) ||
            count.value < 0 ||
            count.value > 0xffff ||
            typeof restockCycles?.value !== "number" ||
            !Number.isSafeInteger(restockCycles.value) ||
            restockCycles.value < 0 ||
            restockCycles.value > 0xffff
        ) {
            issues.push({
                code: "INVALID_STOCK",
                message: `OpenRune inventory stock at ${block.sourcePath}:${line} requires obj plus integer count/restockCycles values in 0..65535.`,
                sourcePath: block.sourcePath,
                line,
                table: "inventory",
                id: block.id,
                resolvedId: block.resolvedId,
            });
            continue;
        }

        const resolvedObjId = gameVals
            ? findGameValSymbol(gameVals, obj.value)?.id
            : undefined;
        if (gameVals && resolvedObjId === undefined) {
            issues.push({
                code: "UNRESOLVED_STOCK_OBJ",
                message: `OpenRune inventory stock obj "${obj.value}" at ${block.sourcePath}:${obj.line} is not present in the selected GameVal registry.`,
                sourcePath: block.sourcePath,
                line: obj.line,
                table: "inventory",
                id: obj.value,
            });
        }

        stock.push({
            obj: obj.value,
            resolvedObjId,
            count: count.value,
            restockCycles: restockCycles.value,
            sourcePath: block.sourcePath,
            line,
            rawText: lines.slice(start, end).join(lineEnding),
        });
    }

    if (stock.length > 255) {
        issues.push({
            code: "TOO_MANY_STOCK_ENTRIES",
            message: `OpenRune inventory "${String(block.id ?? "<unresolved>")}" has ${stock.length} stock entries; the server cache format stores the stock length in one byte.`,
            sourcePath: block.sourcePath,
            line: block.startLine,
            table: "inventory",
            id: block.id,
            resolvedId: block.resolvedId,
        });
    }

    return { stock, issues };
}

export function parseOpenRuneServerToml(
    sourcePath: string,
    text: string,
    options: ParseOpenRuneServerTomlOptions = {},
): OpenRuneServerTomlFileIndex {
    const sourceKind = options.sourceKind ?? "raw-server";
    const lineEnding = text.includes("\r\n") ? "\r\n" : "\n";
    const lines = text.split(/\r?\n/);
    const blocks: OpenRuneServerDefinitionBlock[] = [];
    const inventories: OpenRuneInventoryDefinition[] = [];
    const issues: OpenRuneServerTomlIssue[] = [];

    for (const sourceBlock of sourceBlocks(text)) {
        const fields = topLevelFields(
            lines,
            0,
            sourceBlock.start,
            sourceBlock.end,
        );
        const id = identityValue(field(fields, "id")?.value);
        const inherit = identityValue(field(fields, "inherit")?.value);
        const resolvedId = resolveIdentity(id, options.gameVals);
        const resolvedInheritId = resolveIdentity(inherit, options.gameVals);

        const block: OpenRuneServerDefinitionBlock = {
            table: sourceBlock.table,
            ordinal: sourceBlock.ordinal,
            sourceKind,
            sourcePath,
            modulePath: options.modulePath,
            packRootPath: options.packRootPath,
            startLine: sourceBlock.start + 1,
            endLine: sourceBlock.end,
            rawText: lines
                .slice(sourceBlock.start, sourceBlock.end)
                .join(lineEnding),
            fields,
            nestedSections: nestedSections(
                lines,
                0,
                sourceBlock.start,
                sourceBlock.end,
                lineEnding,
            ),
            id,
            resolvedId,
            inherit,
            resolvedInheritId,
            isServerOnly: field(fields, "isServerOnly")?.value === true,
        };
        blocks.push(block);

        const idIssue = issueIdentity(
            block,
            "id",
            id,
            resolvedId,
            options.gameVals,
        );
        if (idIssue) issues.push(idIssue);
        const inheritIssue = issueIdentity(
            block,
            "inherit",
            inherit,
            resolvedInheritId,
            options.gameVals,
        );
        if (inheritIssue) issues.push(inheritIssue);

        if (block.table === "inventory") {
            const parsed = parseInventoryStock(
                block,
                lines,
                sourceBlock.start,
                sourceBlock.end,
                options.gameVals,
            );
            issues.push(...parsed.issues);
            inventories.push({
                block,
                name:
                    typeof field(fields, "name")?.value === "string"
                        ? (field(fields, "name")!.value as string)
                        : undefined,
                scope:
                    typeof field(fields, "scope")?.value === "string"
                        ? (field(fields, "scope")!.value as string)
                        : undefined,
                stack:
                    typeof field(fields, "stack")?.value === "string"
                        ? (field(fields, "stack")!.value as string)
                        : undefined,
                size:
                    typeof field(fields, "size")?.value === "number"
                        ? (field(fields, "size")!.value as number)
                        : undefined,
                stock: parsed.stock,
            });
        }
    }

    return {
        sourceKind,
        sourcePath,
        sourceText: text,
        modulePath: options.modulePath,
        packRootPath: options.packRootPath,
        blocks,
        inventories,
        issues,
    };
}

async function packConfigTomlFiles(
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

function pushMap<K, T>(map: Map<K, T[]>, key: K, value: T): void {
    const existing = map.get(key);
    if (existing) existing.push(value);
    else map.set(key, [value]);
}

export async function indexProjectOpenRuneServerToml(
    fileSystem: ProjectFileSystem,
    project: Pick<OpenRuneProjectIndex, "rawServerSources" | "packRoots">,
    gameVals?: GameValRegistry,
): Promise<OpenRuneServerTomlIndex> {
    const descriptors = new Map<
        string,
        {
            sourceKind: OpenRuneServerSourceKind;
            modulePath?: string;
            packRootPath?: string;
        }
    >();

    for (const sourcePath of project.rawServerSources.tomlFiles) {
        descriptors.set(sourcePath, { sourceKind: "raw-server" });
    }

    for (const packRoot of [...project.packRoots].sort((a, b) =>
        compareText(a.path, b.path),
    )) {
        for (const sourcePath of await packConfigTomlFiles(
            fileSystem,
            packRoot,
        )) {
            descriptors.set(sourcePath, {
                sourceKind: "pack-config",
                modulePath: packRoot.modulePath,
                packRootPath: packRoot.path,
            });
        }
    }

    const files: OpenRuneServerTomlFileIndex[] = [];
    for (const [sourcePath, descriptor] of [...descriptors.entries()].sort(
        (a, b) => compareText(a[0], b[0]),
    )) {
        files.push(
            parseOpenRuneServerToml(
                sourcePath,
                await fileSystem.readText(sourcePath),
                {
                    ...descriptor,
                    gameVals,
                },
            ),
        );
    }

    const blocks = files.flatMap((file) => file.blocks);
    const inventories = files.flatMap((file) => file.inventories);
    const issues = files.flatMap((file) => file.issues);
    const byTableMutable = new Map<
        OpenRuneServerTable,
        OpenRuneServerDefinitionBlock[]
    >();
    const bySymbolMutable = new Map<string, OpenRuneServerDefinitionBlock[]>();
    const byTargetMutable = new Map<string, OpenRuneServerDefinitionBlock[]>();

    for (const block of blocks) {
        pushMap(byTableMutable, block.table, block);
        if (typeof block.id === "string") {
            pushMap(bySymbolMutable, block.id, block);
        }
        if (
            block.resolvedId !== undefined &&
            block.resolvedId >= 0
        ) {
            pushMap(
                byTargetMutable,
                targetKey(block.table, block.resolvedId),
                block,
            );
        }
    }

    for (const declarations of byTargetMutable.values()) {
        if (declarations.length < 2) continue;
        const first = declarations[0]!;
        issues.push({
            code: "DUPLICATE_TARGET",
            message: `OpenRune server target "${first.table}" id ${first.resolvedId} is declared by multiple source blocks. PackServerConfig consumes all matching TOML sources, so Studio should not silently choose one.`,
            sourcePath: first.sourcePath,
            line: first.startLine,
            table: first.table,
            id: first.id,
            resolvedId: first.resolvedId,
            related: declarations.map((block) => ({
                sourceKind: block.sourceKind,
                sourcePath: block.sourcePath,
                line: block.startLine,
                table: block.table,
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

    const byTable = new Map<
        OpenRuneServerTable,
        readonly OpenRuneServerDefinitionBlock[]
    >();
    for (const [table, declarations] of byTableMutable) {
        byTable.set(table, [...declarations]);
    }
    const bySymbol = new Map<
        string,
        readonly OpenRuneServerDefinitionBlock[]
    >();
    for (const [symbol, declarations] of bySymbolMutable) {
        bySymbol.set(symbol, [...declarations]);
    }
    const byTarget = new Map<
        string,
        readonly OpenRuneServerDefinitionBlock[]
    >();
    for (const [key, declarations] of byTargetMutable) {
        byTarget.set(key, [...declarations]);
    }

    return {
        files,
        blocks,
        inventories,
        issues,
        byTable,
        bySymbol,
        byTarget,
    };
}

export function findOpenRuneServerByTable(
    index: OpenRuneServerTomlIndex,
    table: OpenRuneServerTable,
): readonly OpenRuneServerDefinitionBlock[] {
    return index.byTable.get(table) ?? [];
}

export function findOpenRuneServerBySymbol(
    index: OpenRuneServerTomlIndex,
    symbol: string,
): readonly OpenRuneServerDefinitionBlock[] {
    return index.bySymbol.get(symbol) ?? [];
}

export function findOpenRuneServerById(
    index: OpenRuneServerTomlIndex,
    table: OpenRuneServerTable,
    id: number,
): readonly OpenRuneServerDefinitionBlock[] {
    if (!Number.isSafeInteger(id) || id < 0) return [];
    return index.byTarget.get(targetKey(table, id)) ?? [];
}

function serializeScalar(value: OpenRuneServerScalar): string {
    if (typeof value === "string") return JSON.stringify(value);
    if (typeof value === "boolean") return value ? "true" : "false";
    if (!Number.isFinite(value)) {
        throw new Error("OpenRune server TOML numeric values must be finite.");
    }
    return String(value);
}

function locateCurrentBlock(
    sourcePath: string,
    text: string,
    expected: OpenRuneServerDefinitionBlock,
): OpenRuneServerDefinitionBlock {
    const parsed = parseOpenRuneServerToml(sourcePath, text, {
        sourceKind: expected.sourceKind,
        modulePath: expected.modulePath,
        packRootPath: expected.packRootPath,
    });
    const current = parsed.blocks.find(
        (block) =>
            block.table === expected.table &&
            block.ordinal === expected.ordinal,
    );
    if (!current) {
        throw new OpenRuneServerWriteError(
            "BLOCK_NOT_FOUND",
            `OpenRune server block ${expected.table}#${expected.ordinal} no longer exists in "${sourcePath}".`,
            sourcePath,
        );
    }
    if (current.rawText !== expected.rawText) {
        throw new OpenRuneServerWriteError(
            "STALE_SOURCE",
            `OpenRune server block ${expected.table}#${expected.ordinal} changed on disk. Re-index before writing.`,
            sourcePath,
        );
    }
    return current;
}

export async function updateOpenRuneServerField(
    fileSystem: ProjectFileSystem,
    expected: OpenRuneServerDefinitionBlock,
    fieldName: string,
    value: OpenRuneServerScalar | undefined,
): Promise<void> {
    if (!SIMPLE_FIELD.test(fieldName)) {
        throw new OpenRuneServerWriteError(
            "INVALID_FIELD",
            `OpenRune server field "${fieldName}" is not a simple top-level TOML key.`,
            expected.sourcePath,
        );
    }

    const text = await fileSystem.readText(expected.sourcePath);
    const current = locateCurrentBlock(expected.sourcePath, text, expected);
    const lineEnding = text.includes("\r\n") ? "\r\n" : "\n";
    const lines = text.split(/\r?\n/);
    const existing = current.fields.find((entry) => entry.name === fieldName);

    if (existing) {
        const index = existing.line - 1;
        if (value === undefined) {
            lines.splice(index, 1);
        } else {
            const parsed = parseAssignment(lines[index]!);
            const indent = parsed?.indent ?? "";
            const comment = parsed?.comment ? ` ${parsed.comment}` : "";
            lines[index] =
                `${indent}${fieldName} = ${serializeScalar(value)}${comment}`;
        }
    } else if (value !== undefined) {
        let insertion = current.endLine;
        const nested = current.nestedSections[0];
        if (nested) insertion = nested.line - 1;

        while (
            insertion > current.startLine &&
            lines[insertion - 1]?.trim() === ""
        ) {
            insertion--;
        }
        lines.splice(
            insertion,
            0,
            `${fieldName} = ${serializeScalar(value)}`,
        );
    }

    await fileSystem.writeText(expected.sourcePath, lines.join(lineEnding));
}

function requireUnsignedShort(value: number, label: string): void {
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff) {
        throw new Error(`${label} must be an integer in 0..65535.`);
    }
}

function pushOptional<T>(
    lines: string[],
    name: string,
    value: T | undefined,
    serialize: (value: T) => string = (entry) => String(entry),
): void {
    if (value !== undefined) lines.push(`${name} = ${serialize(value)}`);
}

export function serializeOpenRuneInventoryToml(
    inventories: readonly SerializableOpenRuneInventory[],
): string {
    const blocks = inventories.map((inventory) => {
        const lines = [
            "[[inventory]]",
            `isServerOnly = ${inventory.isServerOnly ?? true}`,
            `id = ${serializeScalar(inventory.id)}`,
        ];
        pushOptional(lines, "name", inventory.name, JSON.stringify);
        pushOptional(lines, "scope", inventory.scope, JSON.stringify);
        pushOptional(lines, "stack", inventory.stack, JSON.stringify);
        pushOptional(lines, "sellMultiplier", inventory.sellMultiplier);
        pushOptional(lines, "buyMultiplier", inventory.buyMultiplier);
        pushOptional(lines, "delta", inventory.delta);
        pushOptional(lines, "size", inventory.size);
        pushOptional(lines, "protect", inventory.protect);
        pushOptional(lines, "runWeight", inventory.runWeight);
        pushOptional(lines, "restock", inventory.restock);
        pushOptional(lines, "allStock", inventory.allStock);
        pushOptional(lines, "dummyInv", inventory.dummyInv);
        pushOptional(lines, "placeholders", inventory.placeholders);
        pushOptional(lines, "uimBlocked", inventory.uimBlocked);

        const stock = inventory.stock ?? [];
        if (stock.length > 255) {
            throw new Error(
                "OpenRune inventory stock cannot exceed 255 entries.",
            );
        }
        for (const entry of stock) {
            requireUnsignedShort(entry.count, "OpenRune inventory stock count");
            requireUnsignedShort(
                entry.restockCycles,
                "OpenRune inventory stock restockCycles",
            );
            lines.push(
                "",
                "[[inventory.stock]]",
                `obj = ${JSON.stringify(entry.obj)}`,
                `count = ${entry.count}`,
                `restockCycles = ${entry.restockCycles}`,
            );
        }
        return lines.join("\n");
    });

    return blocks.join("\n\n").concat(blocks.length ? "\n" : "");
}

export async function replaceOpenRuneServerSourceFile(
    fileSystem: ProjectFileSystem,
    sourcePath: string,
    nextText: string,
    expectedText?: string,
): Promise<void> {
    if (!sourcePath.toLowerCase().endsWith(".toml")) {
        throw new OpenRuneServerWriteError(
            "INVALID_PATH",
            "OpenRune server source files must use the .toml extension.",
            sourcePath,
        );
    }

    const exists = await fileSystem.exists(sourcePath);
    if (expectedText === undefined) {
        if (exists) {
            throw new OpenRuneServerWriteError(
                "SOURCE_EXISTS",
                `OpenRune server source "${sourcePath}" already exists.`,
                sourcePath,
            );
        }
    } else {
        if (!exists) {
            throw new OpenRuneServerWriteError(
                "SOURCE_MISSING",
                `OpenRune server source "${sourcePath}" no longer exists.`,
                sourcePath,
            );
        }
        if ((await fileSystem.readText(sourcePath)) !== expectedText) {
            throw new OpenRuneServerWriteError(
                "STALE_SOURCE",
                `OpenRune server source "${sourcePath}" changed on disk. Re-index before writing.`,
                sourcePath,
            );
        }
    }

    await fileSystem.writeText(sourcePath, nextText);
}
