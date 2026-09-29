import { setEditorSlot } from "../bridge/editorSlots";
import type { StudioPanel } from "../workspace/panel";

/**
 * Hosts the game client (and so the single WebGL2 context) inside a dock
 * panel. The client sizes itself from --app-vw/--app-vh, which it normally
 * sets on <html> from the window size; overriding them on this element makes
 * it fill the panel instead. The renderer's own ResizeObserver resizes the canvas.
 */
export const scenePanel: StudioPanel = {
    id: "scene",
    title: "Scene",
    keepAlive: true,
    fixed: true,
    isolateInput: false,
    mount(element) {
        element.classList.add("studio-scene");
        const clientHost = document.createElement("div");
        clientHost.className = "studio-scene__client";
        element.appendChild(clientHost);
        // Registered before the client loads, so the editor chrome mounts docked.
        setEditorSlot("overlay", element);

        const resize = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            element.style.setProperty("--app-vw", `${Math.max(1, width)}px`);
            element.style.setProperty("--app-vh", `${Math.max(1, height)}px`);
        });
        resize.observe(element);

        let disposed = false;
        let unmountClient: (() => void) | undefined;
        void import("../../game/mountLegacyClient").then(({ mountLegacyClient }) => {
            if (!disposed) unmountClient = mountLegacyClient(clientHost);
        });

        return () => {
            disposed = true;
            resize.disconnect();
            unmountClient?.();
            setEditorSlot("overlay", undefined);
        };
    },
};
