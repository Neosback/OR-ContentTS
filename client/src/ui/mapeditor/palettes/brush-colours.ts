import type { IEditorPluginHost } from "../../../mapeditor/plugins/editor-plugin-host";

/** The brush's current underlay and overlay colours (0xRRGGBB), with neutral fallbacks, for thumbnails and the preview. */
export function brushFloorColours(host: IEditorPluginHost): { underlay: number; overlay: number } {
    let underlay = 0x2a2a2a;
    let overlay = 0x6a6a6a;
    try {
        if (host.selectedUnderlayId >= 0) underlay = host.underlayTypeLoader.load(host.selectedUnderlayId).getRgb();
    } catch {
        /* unknown id */
    }
    try {
        if (host.selectedOverlayId >= 0) overlay = host.overlayTypeLoader.load(host.selectedOverlayId).getRgb();
    } catch {
        /* unknown id */
    }
    return { underlay, overlay };
}
