import type { SceneTheme } from "./object-scene";

let probe: CanvasRenderingContext2D | null | undefined;

/**
 * Resolves any CSS colour (including oklch()/var() results from the app theme) to 0xRRGGBB. Canvas converts to sRGB
 * for us when we read the pixel back.
 */
export function resolveCssColor(value: string, fallback: number): number {
    if (probe === undefined) {
        probe = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d", { willReadFrequently: true });
        if (probe) probe.canvas.width = probe.canvas.height = 1;
    }
    if (!probe || !value) return fallback;
    try {
        probe.clearRect(0, 0, 1, 1);
        probe.fillStyle = "#000";
        probe.fillStyle = value;
        probe.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
        return a === 0 ? fallback : (r << 16) | (g << 8) | b;
    } catch {
        return fallback;
    }
}

/** Reads a theme token (e.g. "--card") from the element and resolves it to 0xRRGGBB. */
export function themeToken(element: Element, token: string, fallback: number): number {
    return resolveCssColor(getComputedStyle(element).getPropertyValue(token).trim(), fallback);
}

/** The preview scene colours, taken from the active colour theme so the grid follows light/dark and custom themes. */
export function readSceneTheme(element: Element): SceneTheme {
    return {
        background: themeToken(element, "--card", 0x16181d),
        gridFill: themeToken(element, "--muted", 0x2a2d35),
        gridLine: themeToken(element, "--muted-foreground", 0x8a8f9c),
        footprint: themeToken(element, "--primary", 0x4f8cff),
    };
}
