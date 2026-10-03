import {
    OPENRUNE_SERVER_TABLES,
    type OpenRuneServerDefinitionBlock,
    type OpenRuneServerField,
    type OpenRuneServerScalar,
    type OpenRuneServerTable,
    type OpenRuneServerTomlIndex,
} from "./openrune-server-toml";

/** Fields that say which definition a block is; editing them in place would silently re-target it. */
const IDENTITY_FIELDS = new Set(["id", "inherit"]);

export const SERVER_TABLE_LABELS: Record<OpenRuneServerTable, string> = {
    object: "Objects",
    npc: "NPCs",
    item: "Items",
    varp: "Player vars",
    health: "Health bars",
    anims: "Animations",
    mesanim: "Message animations",
    walktrigger: "Walk triggers",
    varn: "NPC vars",
    varnbit: "NPC var bits",
    varcon: "Client vars",
    varobj: "Object vars",
    varconbit: "Client var bits",
    hunt: "Hunt modes",
    stat: "Stats",
    projectile: "Projectiles",
    bas: "Body animation sets",
    inventory: "Inventories",
};

export function blockKey(block: Pick<OpenRuneServerDefinitionBlock, "sourcePath" | "ordinal" | "table">): string {
    return `${block.table}\u0000${block.sourcePath}\u0000${block.ordinal}`;
}

/** How many definitions each table has, in the order the tables are listed (empty tables included). */
export function tableCounts(index: OpenRuneServerTomlIndex): Array<{ table: OpenRuneServerTable; label: string; count: number }> {
    return OPENRUNE_SERVER_TABLES.map((table) => ({ table, label: SERVER_TABLE_LABELS[table], count: index.byTable.get(table)?.length ?? 0 }));
}

/** The string a block is known by in lists: its symbol (`npc.imp`) or numeric id. */
export function blockTitle(block: OpenRuneServerDefinitionBlock): string {
    if (block.id !== undefined) return String(block.id);
    return `${block.table} #${block.ordinal + 1}`;
}

function textField(block: OpenRuneServerDefinitionBlock, name: string): string | undefined {
    const value = block.fields.find((field) => field.name === name)?.value;
    return typeof value === "string" ? value : undefined;
}

/** A readable name when the block has one (`name = "Imp"`); definitions without one fall back to their symbol. */
export function blockDisplayName(block: OpenRuneServerDefinitionBlock): string | undefined {
    return textField(block, "name");
}

/**
 * The blocks of one table that match `query` (case-insensitive substring of the symbol, name or file, or an exact
 * numeric id), ordered by id then by where they sit in the source.
 */
export function listServerBlocks(index: OpenRuneServerTomlIndex, table: OpenRuneServerTable, query: string): OpenRuneServerDefinitionBlock[] {
    const blocks = [...(index.byTable.get(table) ?? [])];
    const needle = query.trim().toLowerCase();
    const filtered = needle
        ? blocks.filter((block) => {
              if (block.resolvedId !== undefined && String(block.resolvedId) === needle) return true;
              return (
                  String(block.id ?? "").toLowerCase().includes(needle) ||
                  (blockDisplayName(block)?.toLowerCase().includes(needle) ?? false) ||
                  block.sourcePath.toLowerCase().includes(needle)
              );
          })
        : blocks;
    return filtered.sort((a, b) => (a.resolvedId ?? Infinity) - (b.resolvedId ?? Infinity) || a.sourcePath.localeCompare(b.sourcePath) || a.ordinal - b.ordinal);
}

/** Finds the block that now stands where `previous` stood (same table, file and position), if it still exists. */
export function relocateBlock(index: OpenRuneServerTomlIndex, previous: OpenRuneServerDefinitionBlock): OpenRuneServerDefinitionBlock | undefined {
    return index.byTable.get(previous.table)?.find((block) => block.sourcePath === previous.sourcePath && block.ordinal === previous.ordinal);
}

export type EditableServerField = OpenRuneServerField & { value: OpenRuneServerScalar; kind: "string" | "number" | "boolean" };

/** The block's plain top-level fields (text, number, true/false) that the field writer can change. */
export function editableFields(block: OpenRuneServerDefinitionBlock): EditableServerField[] {
    const result: EditableServerField[] = [];
    for (const field of block.fields) {
        if (IDENTITY_FIELDS.has(field.name) || field.value === undefined) continue;
        result.push({ ...field, value: field.value, kind: typeof field.value as EditableServerField["kind"] });
    }
    return result;
}

/** Fields the editor shows but cannot change (arrays, inline tables, anything that is not a single scalar). */
export function readOnlyFields(block: OpenRuneServerDefinitionBlock): OpenRuneServerField[] {
    return block.fields.filter((field) => IDENTITY_FIELDS.has(field.name) || field.value === undefined);
}

export type FieldParse = { ok: true; value: OpenRuneServerScalar } | { ok: false; message: string };

/** Turns what was typed into a value of the same kind the field already has, so a number stays a number. */
export function parseFieldInput(kind: EditableServerField["kind"], text: string): FieldParse {
    if (kind === "string") return { ok: true, value: text };
    if (kind === "boolean") {
        const lowered = text.trim().toLowerCase();
        if (lowered === "true" || lowered === "false") return { ok: true, value: lowered === "true" };
        return { ok: false, message: "Use true or false." };
    }
    const trimmed = text.trim();
    const value = Number(trimmed);
    if (trimmed === "" || !Number.isFinite(value)) return { ok: false, message: "Enter a number." };
    return { ok: true, value };
}
