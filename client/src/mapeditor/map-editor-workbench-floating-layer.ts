/** Minimal top padding for floating panels in the workbench layer. */
export const MAP_EDITOR_WORKBENCH_FLOATING_TOP_INSET = 8;

export type MapEditorFloatingLayerSize = {
    width: number;
    height: number;
};

export type MapEditorFloatingLayerPosition = {
    x: number;
    y: number;
};

export function clampPositionInWorkbenchFloatingLayer(
    position: MapEditorFloatingLayerPosition,
    panelWidth: number,
    panelHeight: number,
    layerWidth: number,
    layerHeight: number,
    topInset = MAP_EDITOR_WORKBENCH_FLOATING_TOP_INSET,
): MapEditorFloatingLayerPosition {
    if (layerWidth <= 0 || layerHeight <= 0) {
        return {
            x: Math.max(0, position.x),
            y: Math.max(topInset, position.y),
        };
    }
    const maxX = Math.max(0, layerWidth - panelWidth);
    const maxY = Math.max(topInset, layerHeight - panelHeight);
    return {
        x: Math.min(Math.max(0, position.x), maxX),
        y: Math.min(Math.max(topInset, position.y), maxY),
    };
}

export function floatingLayerPositionsEqual(
    a: MapEditorFloatingLayerPosition,
    b: MapEditorFloatingLayerPosition,
): boolean {
    return a.x === b.x && a.y === b.y;
}


/** Default floating position anchored toward bottom-left of the workbench layer. */
export function getWorkbenchFloatingFallbackPosition(
    layerHeight: number,
    panelHeight: number,
    topInset = MAP_EDITOR_WORKBENCH_FLOATING_TOP_INSET,
): MapEditorFloatingLayerPosition {
    return {
        x: 12,
        y: Math.max(topInset, layerHeight - panelHeight - 12),
    };
}
