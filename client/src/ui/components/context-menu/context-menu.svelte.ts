import type { Component } from "svelte";

export interface ContextMenuItem {
    id: string;
    label: string;
    icon?: Component<any>;
    disabled?: boolean;
    onSelect: () => void;
}

export interface ContextMenuRequest {
    x: number;
    y: number;
    title?: string;
    items: readonly ContextMenuItem[];
    onClose?: () => void;
}

class ContextMenuState {
    request = $state<ContextMenuRequest | null>(null);

    /** Opens the shared menu at the pointer position. Items are read once, at open time. */
    open(event: MouseEvent, title: string | undefined, items: readonly ContextMenuItem[], onClose?: () => void): void {
        if (items.length === 0) return;
        event.preventDefault();
        event.stopPropagation();
        this.request?.onClose?.();
        this.request = { x: event.clientX, y: event.clientY, title, items, onClose };
    }

    close(): void {
        const onClose = this.request?.onClose;
        this.request = null;
        onClose?.();
    }
}

export const contextMenu = new ContextMenuState();

const VIEWPORT_MARGIN = 8;

/** Places a menu at the anchor, flipping/clamping so it stays inside the viewport. */
export function clampMenuPosition(
    anchor: { x: number; y: number },
    size: { width: number; height: number },
    viewport: { width: number; height: number } = { width: window.innerWidth, height: window.innerHeight },
): { x: number; y: number } {
    let { x, y } = anchor;
    if (y + size.height + VIEWPORT_MARGIN > viewport.height) y = anchor.y - size.height;
    if (x + size.width + VIEWPORT_MARGIN > viewport.width) x = anchor.x - size.width;
    const maxX = Math.max(VIEWPORT_MARGIN, viewport.width - size.width - VIEWPORT_MARGIN);
    const maxY = Math.max(VIEWPORT_MARGIN, viewport.height - size.height - VIEWPORT_MARGIN);
    return { x: Math.min(Math.max(VIEWPORT_MARGIN, x), maxX), y: Math.min(Math.max(VIEWPORT_MARGIN, y), maxY) };
}
