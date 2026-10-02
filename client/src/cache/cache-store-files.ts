export function isCacheStoreFileName(name: string): boolean {
    if (name === "keys.json" || name === "xteas.json") return true;
    if (name === "main_file_cache.dat2" || name === "main_file_cache.dat") return true;
    if (name === "main_file_cache.idx255") return true;
    return /^main_file_cache\.idx\d+$/.test(name);
}

export function validateCacheStoreFileNames(names: Iterable<string>): void {
    const set = new Set(names);
    const hasDat2 = set.has("main_file_cache.dat2");
    const hasDat = set.has("main_file_cache.dat");

    if (!hasDat2 && !hasDat) {
        throw new Error(
            "Cache folder must contain main_file_cache.dat2 (OSRS) or main_file_cache.dat.",
        );
    }
    if (hasDat2 && !set.has("main_file_cache.idx255")) {
        throw new Error(
            "Missing main_file_cache.idx255 — choose the full cache directory.",
        );
    }
    const idxCount = [...set].filter((name) => /^main_file_cache\.idx\d+$/.test(name)).length;
    if (hasDat2 && idxCount < 2) {
        throw new Error(
            "Too few index files (main_file_cache.idx*). Choose the complete cache folder.",
        );
    }
}

export function isDat2CacheStore(names: Iterable<string>): boolean {
    for (const name of names) {
        if (name === "main_file_cache.dat2") return true;
    }
    return false;
}
