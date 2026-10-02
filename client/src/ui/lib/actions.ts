import { perfLog } from "../../perf/gl-memory";
import type { Renderer } from "../../components/renderer/Renderer";

/**
 * Hosts a renderer's canvas (and overlay canvas) in the element and runs its frame loop for the
 * element's lifetime. Replaces `RendererCanvas.tsx`.
 */
export function rendererCanvas(host: HTMLElement, renderer: Renderer): { update(next: Renderer): void; destroy(): void } {
    let current: Renderer | undefined;
    let observer: ResizeObserver | undefined;
    let disposed = false;

    const attach = (next: Renderer): void => {
        current = next;
        host.appendChild(next.canvas);
        if (next.overlayCanvas) host.appendChild(next.overlayCanvas);

        perfLog("phase: renderer init start");
        void next.init().then(() => {
            perfLog("phase: renderer init done");
            if (!disposed && current === next) next.start();
        });

        // The frame loop resizes the backing canvas; this nudges an immediate pass on layout changes.
        observer = new ResizeObserver(() => next.onResize(next.canvas.width, next.canvas.height));
        observer.observe(host);
    };

    const detach = (): void => {
        observer?.disconnect();
        observer = undefined;
        if (!current) return;
        current.stop();
        current.canvas.remove();
        current.overlayCanvas?.remove();
        current = undefined;
    };

    attach(renderer);

    return {
        update(next) {
            if (next === current) return;
            detach();
            attach(next);
        },
        destroy() {
            disposed = true;
            detach();
        },
    };
}

export interface ElementSize {
    width: number;
    height: number;
}

/** Reports an element's content size on every resize. Replaces `usehooks-ts` `useElementSize`. */
export function elementSize(node: HTMLElement, onSize: (size: ElementSize) => void): { destroy(): void } {
    const observer = new ResizeObserver(([entry]) => {
        if (entry) onSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
}

/** Moves the element to `document.body` (or another target) so it escapes clipping/stacking contexts. */
export function portal(node: HTMLElement, target: HTMLElement = document.body): { destroy(): void } {
    target.appendChild(node);
    return { destroy: () => node.remove() };
}

/** Calls `onClose` when Escape is pressed anywhere while the element is mounted. */
export function escapeClose(_node: HTMLElement, onClose: () => void): { update(next: () => void): void; destroy(): void } {
    let handler = onClose;
    const listener = (event: KeyboardEvent): void => {
        if (event.key === "Escape") handler();
    };
    window.addEventListener("keydown", listener);
    return {
        update: (next) => {
            handler = next;
        },
        destroy: () => window.removeEventListener("keydown", listener),
    };
}

/** Closes when a pointer goes down outside the element. */
export function clickOutside(node: HTMLElement, onOutside: () => void): { update(next: () => void): void; destroy(): void } {
    let handler = onOutside;
    const listener = (event: PointerEvent): void => {
        if (!node.contains(event.target as Node)) handler();
    };
    document.addEventListener("pointerdown", listener, true);
    return {
        update: (next) => {
            handler = next;
        },
        destroy: () => document.removeEventListener("pointerdown", listener, true),
    };
}
