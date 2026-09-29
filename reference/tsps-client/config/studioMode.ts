/**
 * OpenRune Content Studio routing. The client is booted either as a studio
 * tool (map editor) or as the legacy game client, decided once from the URL.
 */

export const STUDIO_HOME_PATH = "/";
export const MAP_EDITOR_PATH = "/map-editor";
/** Legacy game client, kept for later tooling (player updating, etc.). */
export const GAME_CLIENT_PATH = "/play";

/**
 * True when the client should open straight into the map editor and never
 * show the login screen. `?edit` is the pre-studio opt-in and still works.
 */
export function isMapEditorMode(): boolean {
    if (typeof window === "undefined") return false;
    return (
        isMapEditorPath(window.location?.pathname ?? "") ||
        new URLSearchParams(window.location?.search ?? "").has("edit")
    );
}

/** True for /map-editor and anything below it. */
export function isMapEditorPath(pathname: string): boolean {
    return pathname === MAP_EDITOR_PATH || pathname.startsWith(`${MAP_EDITOR_PATH}/`);
}
