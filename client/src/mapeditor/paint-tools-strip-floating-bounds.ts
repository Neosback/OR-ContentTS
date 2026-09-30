export type PaintToolsStripPosition = {
    x: number;
    y: number;
};

/** Default undocked position: top-left of workbench floating layer (below sticky nav). */
export const PAINT_TOOLS_STRIP_VIEWPORT_DEFAULT: PaintToolsStripPosition = { x: 8, y: 40 };

export function clampPaintToolsStripPositionInViewport(
    position: PaintToolsStripPosition,
    panelWidth: number,
    panelHeight: number,
    viewportWidth: number,
    viewportHeight: number,
): PaintToolsStripPosition {
    const maxX = Math.max(0, viewportWidth - panelWidth);
    const maxY = Math.max(0, viewportHeight - panelHeight);
    return {
        x: Math.min(Math.max(0, position.x), maxX),
        y: Math.min(Math.max(0, position.y), maxY),
    };
}

export function positionsEqual(a: PaintToolsStripPosition, b: PaintToolsStripPosition): boolean {
    return a.x === b.x && a.y === b.y;
}

export function clampPaintToolsStripPositionToBounds(
    position: PaintToolsStripPosition,
    panelWidth: number,
    panelHeight: number,
): PaintToolsStripPosition {
    return clampPaintToolsStripPositionInViewport(
        position,
        panelWidth,
        panelHeight,
        typeof window !== "undefined" ? window.innerWidth : panelWidth,
        typeof window !== "undefined" ? window.innerHeight : panelHeight,
    );
}

export function getDefaultPaintToolsStripPosition(): PaintToolsStripPosition {
    return { ...PAINT_TOOLS_STRIP_VIEWPORT_DEFAULT };
}
