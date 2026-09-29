import { mount } from "svelte";

import "../index.css";
import "./theme.css";
import { isMapEditorPath, STUDIO_HOME_PATH } from "../config/studioMode";
import { registerServiceWorker } from "../serviceWorkerRegistration";

/**
 * Studio entry. Each route loads only what it needs: the home page never
 * touches the game client; the map editor hosts it in a dock panel; any other
 * path (/play, legacy world links) is the bare legacy client.
 */
async function boot(target: HTMLElement): Promise<void> {
    const path = window.location.pathname.replace(/\/+$/, "") || STUDIO_HOME_PATH;
    if (path === STUDIO_HOME_PATH) {
        const { default: Home } = await import("./Home.svelte");
        mount(Home, { target });
    } else if (isMapEditorPath(path)) {
        const { default: MapEditorWorkspace } = await import("./mapEditor/MapEditorWorkspace.svelte");
        mount(MapEditorWorkspace, { target });
    } else {
        const { mountLegacyClient } = await import("../game/mountLegacyClient");
        mountLegacyClient(target);
    }
}

void boot(document.getElementById("root") as HTMLElement);
registerServiceWorker();
