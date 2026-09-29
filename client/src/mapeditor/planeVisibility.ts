import type { Scene } from "../rs/scene/Scene";

/** Viewport plane options; mirrors the uniforms read by plane-visibility.glsl. */
export type PlaneViewOptions = {
    /** Plane being viewed/edited (0–3). */
    plane: number;
    /** Hide tiles on planes below {@link plane} (an editor aid, not an RS behaviour). */
    hideBelow: boolean;
    /** Draw planes above {@link plane}, as RS does with roofs shown. */
    showRoofs: boolean;
    /** Plane-1 bridge flags lower their column one plane, as in RS. */
    bridgeLinkBelow: boolean;
};

/** Highest plane drawn: 3 with roofs shown, otherwise the viewed plane (clientPreferences.isRoofsHidden). */
export function getMaxDrawnPlane(view: PlaneViewOptions): number {
    return view.showRoofs ? 3 : view.plane;
}

/** Scene.draw rule: a tile draws when its minPlane is at or below the max drawn plane. */
export function isSceneTileVisible(
    scene: Scene,
    level: number,
    sceneX: number,
    sceneY: number,
    view: PlaneViewOptions,
): boolean {
    if (view.hideBelow && level < view.plane) {
        return false;
    }
    return scene.getTileMinLevel(level, sceneX, sceneY, view.bridgeLinkBelow) <= getMaxDrawnPlane(view);
}
