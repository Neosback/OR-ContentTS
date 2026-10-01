import {
    fetchNpcSpawns,
    fetchObjSpawns,
    getNpcSpawnsUrl,
} from "./bundled-spawn-data";
import type { NpcSpawn, ObjSpawn } from "./world-source";
import type {
    WorldData,
    WorldLoadOptions,
    WorldSource,
    WorldSourceContext,
} from "./world-source";

type NpcSpawnLoader = (
    url: string,
    signal?: AbortSignal,
) => Promise<NpcSpawn[]>;

type ObjSpawnLoader = (
    signal?: AbortSignal,
) => Promise<ObjSpawn[]>;

export type BundledWorldSourceOptions = {
    resolveNpcSpawnsUrl?: typeof getNpcSpawnsUrl;
    loadNpcSpawns?: NpcSpawnLoader;
    loadObjSpawns?: ObjSpawnLoader;
};

/**
 * Offline/local WorldSource backed by the spawn snapshots bundled with Studio.
 *
 * This preserves the existing viewer behavior while moving source selection
 * behind the same seam a future OpenRune implementation can satisfy.
 */
export class BundledWorldSource implements WorldSource {
    readonly id = "bundled-world";

    private readonly resolveNpcSpawnsUrl: typeof getNpcSpawnsUrl;
    private readonly loadNpcSpawns: NpcSpawnLoader;
    private readonly loadObjSpawns: ObjSpawnLoader;

    constructor(options: BundledWorldSourceOptions = {}) {
        this.resolveNpcSpawnsUrl =
            options.resolveNpcSpawnsUrl ?? getNpcSpawnsUrl;
        this.loadNpcSpawns = options.loadNpcSpawns ?? fetchNpcSpawns;
        this.loadObjSpawns = options.loadObjSpawns ?? fetchObjSpawns;
    }

    async loadWorld(
        context: WorldSourceContext,
        options: WorldLoadOptions = {},
    ): Promise<WorldData> {
        if (options.signal?.aborted) {
            throw options.signal.reason ??
                new DOMException("Aborted", "AbortError");
        }

        const npcSpawnsUrl = this.resolveNpcSpawnsUrl(context.cacheInfo);
        const [npcSpawns, objSpawns] = await Promise.all([
            this.loadNpcSpawns(npcSpawnsUrl, options.signal),
            this.loadObjSpawns(options.signal),
        ]);

        if (options.signal?.aborted) {
            throw options.signal.reason ??
                new DOMException("Aborted", "AbortError");
        }

        return {
            npcSpawns,
            objSpawns,
        };
    }
}

export const bundledWorldSource = new BundledWorldSource();
