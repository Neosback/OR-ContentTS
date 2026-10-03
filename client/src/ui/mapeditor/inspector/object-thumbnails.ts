import { computeTextureCoords, type Model } from "../../../rs/model/Model";
import { LocModelType } from "../../../rs/config/loctype/LocModelType";
import type { IEditorPluginHost } from "../../../mapeditor/plugins/editor-plugin-host";
import { renderModelPreview, type PreviewModel } from "./model-preview";
import { Rasterizer, type RasterTexture } from "./raster";
import { ThumbnailQueue } from "./thumbnail-queue";

const SIZE = 56;
const YAW = 0.6;
const PITCH = 0.5;

const queues = new WeakMap<object, ThumbnailQueue>();

/**
 * Small pictures of object types for lists (the catalog). They are drawn with the same CPU rasterizer as the Object tab's
 * preview, one at a time in a time-budgeted queue (see `ThumbnailQueue`), and returned as data URLs for plain `<img>` tags.
 */
export function getObjectThumbnails(host: IEditorPluginHost): ThumbnailQueue {
    let queue = queues.get(host.locTypeLoader);
    if (queue) return queue;

    const raster = new Rasterizer(SIZE, SIZE);
    const canvas = typeof document === "undefined" ? undefined : document.createElement("canvas");
    if (canvas) canvas.width = canvas.height = SIZE;
    const textures = new Map<number, RasterTexture | undefined>();
    const texture = (id: number): RasterTexture | undefined => {
        if (textures.has(id)) return textures.get(id);
        let result: RasterTexture | undefined;
        try {
            result = { size: 64, pixels: Int32Array.from(host.textureLoader.getPixelsArgb(id, 64, true, 1.0)) };
        } catch {
            result = undefined;
        }
        textures.set(id, result);
        return result;
    };

    queue = new ThumbnailQueue((locTypeId) => {
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return null;
        const locType = host.locTypeLoader.load(locTypeId);
        // Prefer the ground-standing model; fall back to whatever the type has (walls, decorations).
        const types = locType.types && locType.types.length > 0 ? [LocModelType.NORMAL, ...locType.types] : [LocModelType.NORMAL];
        let model: PreviewModel | undefined;
        for (const type of types) {
            try {
                model = host.locModelLoader.getModel(locType, type, 0) as unknown as PreviewModel | undefined;
            } catch {
                model = undefined;
            }
            if (model && model.faceCount > 0) break;
            model = undefined;
        }
        if (!model) return null;
        let uvs: Float32Array | undefined;
        try {
            uvs = model.uvs ?? computeTextureCoords(model as unknown as Model);
        } catch {
            uvs = undefined;
        }
        renderModelPreview(raster, model, YAW, PITCH, texture, uvs);
        ctx.putImageData(new ImageData(new Uint8ClampedArray(raster.color), SIZE, SIZE), 0, 0);
        return canvas.toDataURL("image/png");
    });
    queues.set(host.locTypeLoader, queue);
    return queue;
}
