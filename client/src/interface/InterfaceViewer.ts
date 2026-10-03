import type { LoadedCache } from "../mapviewer/Caches";
import type { InterfaceEntry } from "../lib/interface-renderer/component-types";
import { interfaceEntryFromDecodedCache } from "./interface-entry-from-cache";
import type { CacheIndex } from "../rs/cache/CacheIndex";
import { CacheSystem } from "../rs/cache/CacheSystem";
import { IndexType } from "../rs/cache/IndexType";
import { Dat2CacheLoaderFactory } from "../rs/cache/loader/Dat2CacheLoaderFactory";
import { ComponentDecoder } from "../rs/config/components/ComponentDecoder";
import { InterfaceType } from "../rs/config/components/InterfaceType";
import type { ObjTypeLoader } from "../rs/config/objtype/ObjTypeLoader";
import {
    preloadVarbitDefinitions,
    type VarbitDefinition,
} from "../rs/config/vartype/bit/VarBitTypeLoader";
import { GameVals, GAMEVALS_CACHE_INDEX_ID } from "../rs/config/gameval/GameVals";
import type { Sprite } from "../rs/sprite/InterfaceCanvasSprite";
import { preloadInterfaceSprites } from "../rs/sprite/preloadInterfaceSprites";

function tryCreateGameVals(cacheSystem: CacheSystem): GameVals | null {
    if (!cacheSystem.indexExists(GAMEVALS_CACHE_INDEX_ID)) {
        return null;
    }
    try {
        return new GameVals(cacheSystem);
    } catch {
        return null;
    }
}

function tryGetDat2SpriteIndex(cacheSystem: CacheSystem): CacheIndex | null {
    if (!cacheSystem.indexExists(IndexType.DAT2.sprites)) {
        return null;
    }
    try {
        return cacheSystem.getIndex(IndexType.DAT2.sprites);
    } catch {
        return null;
    }
}

function tryGetDat2ClientScriptIndex(cacheSystem: CacheSystem): CacheIndex | null {
    if (!cacheSystem.indexExists(IndexType.DAT2.clientScript)) {
        return null;
    }
    try {
        return cacheSystem.getIndex(IndexType.DAT2.clientScript);
    } catch {
        return null;
    }
}

function tryGetObjTypeLoader(cache: LoadedCache, cacheSystem: CacheSystem): ObjTypeLoader | null {
    if (cache.type !== "dat2") return null;
    try {
        return new Dat2CacheLoaderFactory(cache.info, cache.type, cacheSystem).getObjTypeLoader();
    } catch {
        return null;
    }
}

function tryPreloadVarbitDefinitions(
    cache: LoadedCache,
    cacheSystem: CacheSystem,
): ReadonlyMap<number, VarbitDefinition> | null {
    if (cache.type !== "dat2") return null;
    try {
        const loader = new Dat2CacheLoaderFactory(cache.info, cache.type, cacheSystem).getVarBitTypeLoader();
        return preloadVarbitDefinitions(loader);
    } catch {
        return null;
    }
}

/** Local cache session for the interface editor: decode index 3, preload sprites/varbits/scripts. */
export class InterfaceViewer {
    loadedCache!: LoadedCache;
    cacheSystem!: CacheSystem;
    /** Present when gameval index (24) exists and parses; used for IF names and inventory search. */
    gamevals!: GameVals | null;

    interfaces!: Record<number, InterfaceType>;
    legacy!: Record<number, boolean>;

    spritesById!: ReadonlyMap<number, Sprite>;
    clientScriptIndex!: CacheIndex | null;
    objTypeLoader!: ObjTypeLoader | null;
    varbitDefinitions!: ReadonlyMap<number, VarbitDefinition> | null;

    constructor(cache: LoadedCache) {
        this.initCache(cache);
        this.load();
    }

    initCache(cache: LoadedCache): void {
        this.loadedCache = cache;
        this.cacheSystem = CacheSystem.fromFiles(cache.type, cache.files);
        this.gamevals = tryCreateGameVals(this.cacheSystem);

        const spriteIndex = tryGetDat2SpriteIndex(this.cacheSystem);
        this.spritesById = spriteIndex ? preloadInterfaceSprites(spriteIndex) : new Map<number, Sprite>();
        this.varbitDefinitions = tryPreloadVarbitDefinitions(cache, this.cacheSystem);
        this.clientScriptIndex = tryGetDat2ClientScriptIndex(this.cacheSystem);
        this.objTypeLoader = tryGetObjTypeLoader(cache, this.cacheSystem);
    }

    load(): void {
        const decodeGameVals = this.gamevals ?? new GameVals(this.cacheSystem);
        const decoder = new ComponentDecoder(this.cacheSystem, decodeGameVals);
        this.interfaces = decoder.load();
        this.legacy = decoder.loadLegacyMap();
    }

    /**
     * Returns a renderer-safe clone of an interface already decoded from the
     * active cache. Selection never needs a cache-server HTTP round trip.
     */
    getInterfaceEntry(id: number, name: string | null = null): InterfaceEntry | undefined {
        const decoded = this.interfaces[id];
        return decoded ? interfaceEntryFromDecodedCache(decoded, name) : undefined;
    }
}
