/**
 * Named places in the Studio workspace where the map editor puts its existing
 * DOM chrome. The editor UI is plain DOM; while it is migrated to real dock
 * panels, the workspace registers elements here and the editor attaches its
 * floating tools to them. Without a workspace (legacy `?edit`) nothing is
 * registered and the editor falls back to floating over the page.
 */

export type EditorSlotName =
    /** The scene panel: floating editor tools are positioned inside it. */
    "overlay";

const slots = new Map<EditorSlotName, HTMLElement>();

export function setEditorSlot(name: EditorSlotName, element: HTMLElement | undefined): void {
    if (element) slots.set(name, element);
    else slots.delete(name);
}

/** True when the editor runs inside the Studio workspace rather than over the bare client. */
export function isEditorDocked(): boolean {
    return slots.has("overlay");
}

/**
 * Where floating editor panels attach. The scene panel is a containing block
 * (`contain: layout`), so their `position: fixed` offsets become relative to it.
 */
export function editorOverlayRoot(): HTMLElement {
    return slots.get("overlay") ?? document.body;
}
