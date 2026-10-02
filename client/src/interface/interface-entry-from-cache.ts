import {
    adaptInterfaceEntryFromApi,
    type ComponentType as RendererComponentType,
    type InterfaceEntry,
} from "../lib/interface-renderer/component-types";
import type { InterfaceType as DecodedInterfaceType } from "../rs/config/components/InterfaceType";

/**
 * Adapts the InterfaceViewer's already-decoded cache interface into the
 * renderer/workbench contract.
 *
 * The local cache decoder uses `internalId` for packed component ids while
 * the renderer uses `packedId`. `adaptInterfaceEntryFromApi` already owns
 * that compatibility conversion, so local and legacy API payloads share one
 * normalization path.
 *
 * Components are cloned by the adapter. Runtime CS1/CS2 mutations therefore do
 * not mutate InterfaceViewer's decoded cache index.
 */
export function interfaceEntryFromDecodedCache(
    decoded: DecodedInterfaceType,
    name: string | null = null,
): InterfaceEntry {
    return adaptInterfaceEntryFromApi({
        name,
        componentCount: Object.keys(decoded.components).length,
        hash: decoded.id,
        components: decoded.components as unknown as Record<string, RendererComponentType>,
        interfaceParents: decoded.interfaceParents as unknown,
    });
}
