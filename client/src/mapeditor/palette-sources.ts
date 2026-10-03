import { executeEditorCommand, getRegisteredEditorCommands, type EditorCommandContext } from "./commands/editor-command-registry";
import { fuzzyScore } from "./fuzzy";
import { parseGoTo } from "./go-to-parser";
import type { CatalogEntry } from "./object-catalog";
import { getObjectActionModel } from "./plugins/builtins/object-action-model";
import { VIEW_CONTROLS } from "./view-controls";

/**
 * What the command palette can run. Items are built from the live editor (enabled commands, panels, saved layouts,
 * rendering toggles) plus what the typed text means (a location, an object name), then ranked by how well they match.
 */
export type PaletteGroup = "Go to" | "Objects" | "Commands" | "Panels" | "Layouts" | "Rendering";

export type PaletteItem = {
    id: string;
    group: PaletteGroup;
    title: string;
    subtitle?: string;
    run: () => void;
};

export type PaletteDeps = {
    commandContext: EditorCommandContext;
    panels: readonly { id: string; title: string; open: boolean }[];
    openPanel: (id: string) => void;
    layouts: readonly { id: string; name: string }[];
    applyLayout: (id: string) => void;
    presets: readonly { id: string; name: string }[];
    applyPreset: (id: string) => void;
    openSettings: (tab?: string) => void;
    searchObjects: (query: string) => readonly CatalogEntry[];
};

/** Objects come last: a name like "grid" should run the Grid toggle, not start placing an object called Grid. */
const GROUP_ORDER: readonly PaletteGroup[] = ["Go to", "Commands", "Rendering", "Panels", "Layouts", "Objects"];
/** Commands that need a payload (a panel id) or are the palette itself have no useful palette entry. */
const HIDDEN_COMMANDS = new Set(["workbench.open-panel", "workbench.command-palette"]);
const OBJECT_RESULTS = 8;

function baseItems(deps: PaletteDeps): PaletteItem[] {
    const { host } = deps.commandContext;
    const items: PaletteItem[] = [];

    for (const command of getRegisteredEditorCommands()) {
        if (HIDDEN_COMMANDS.has(command.id)) continue;
        let enabled = true;
        try {
            enabled = command.isEnabled?.(deps.commandContext, {}) ?? true;
        } catch {
            enabled = false;
        }
        if (!enabled) continue;
        items.push({ id: `command:${command.id}`, group: "Commands", title: command.name, subtitle: command.description, run: () => void executeEditorCommand(command.id, deps.commandContext) });
    }
    for (const panel of deps.panels) {
        items.push({ id: `panel:${panel.id}`, group: "Panels", title: `${panel.open ? "Show" : "Open"} ${panel.title} panel`, run: () => deps.openPanel(panel.id) });
    }
    for (const preset of deps.presets) {
        items.push({ id: `preset:${preset.id}`, group: "Layouts", title: `Layout: ${preset.name}`, subtitle: "Starting point", run: () => deps.applyPreset(preset.id) });
    }
    for (const layout of deps.layouts) {
        items.push({ id: `layout:${layout.id}`, group: "Layouts", title: `Layout: ${layout.name}`, subtitle: "Saved layout", run: () => deps.applyLayout(layout.id) });
    }
    items.push({ id: "layout:manage", group: "Layouts", title: "Manage layouts and settings…", run: () => deps.openSettings("workspace") });
    for (const control of VIEW_CONTROLS) {
        const on = control.get(host);
        items.push({ id: `view:${control.id}`, group: "Rendering", title: `Toggle ${control.label}`, subtitle: `${on ? "On" : "Off"} · ${control.description}`, run: () => control.set(host, !on) });
    }
    return items;
}

/** The items to show for `query` (all of them, grouped, when it is empty). */
export function buildPaletteItems(deps: PaletteDeps, query: string): PaletteItem[] {
    const text = query.trim();
    const { host } = deps.commandContext;
    const out: PaletteItem[] = [];

    const target = parseGoTo(text);
    if (target) {
        out.push({ id: "goto", group: "Go to", title: `Go to ${target.label}`, subtitle: `World tile ${target.worldX}, ${target.worldY}`, run: () => host.goToWorldTile(target.worldX, target.worldY, target.plane) });
    }

    if (text.length >= 2 && !target) {
        for (const entry of deps.searchObjects(text).slice(0, OBJECT_RESULTS)) {
            out.push({
                id: `object:${entry.id}`,
                group: "Objects",
                title: `Place ${entry.name}`,
                subtitle: `Object #${entry.id}: pick it, then click the map`,
                run: () => {
                    host.setEditorTool("object-selector");
                    getObjectActionModel(host).startPlace(entry.id);
                },
            });
        }
    }

    const rest = baseItems(deps);
    if (!text) {
        out.push(...rest);
    } else {
        const scored: { item: PaletteItem; score: number; index: number }[] = [];
        rest.forEach((item, index) => {
            const score = fuzzyScore(text, `${item.title} ${item.group}`);
            if (score !== undefined) scored.push({ item, score, index });
        });
        scored.sort((a, b) => b.score - a.score || a.index - b.index);
        out.push(...scored.map((entry) => entry.item));
    }
    return out;
}

/** Items split into labelled groups, in the palette's display order (a ranked list keeps its order inside a group). */
export function groupPaletteItems(items: readonly PaletteItem[]): { group: PaletteGroup; items: PaletteItem[] }[] {
    return GROUP_ORDER.map((group) => ({ group, items: items.filter((item) => item.group === group) })).filter((entry) => entry.items.length > 0);
}
