export const WORLD_MAP_SOURCE_PIXELS = 256;
export const DEFAULT_WORLD_MAP_BITMAP_BUDGET_BYTES = 64 * 1024 * 1024;

export type WorldMapBitmapLike = {
    width: number;
    height: number;
    close(): void;
};

type Entry<V extends WorldMapBitmapLike> = {
    value: V;
    bytes: number;
    touched: number;
};

export function worldMapDecodePixels(
    regionCssPixels: number,
    devicePixelRatio: number,
): number {
    const cssPixels = Math.max(1, regionCssPixels);
    const dpr = Math.max(1, devicePixelRatio || 1);
    return Math.max(
        1,
        Math.min(
            WORLD_MAP_SOURCE_PIXELS,
            Math.ceil(cssPixels * dpr),
        ),
    );
}

export class WorldMapBitmapCache<K, V extends WorldMapBitmapLike> {
    private readonly entries = new Map<K, Entry<V>>();
    private clock = 0;
    private usedBytesValue = 0;

    constructor(
        readonly maxBytes = DEFAULT_WORLD_MAP_BITMAP_BUDGET_BYTES,
    ) {}

    get usedBytes(): number {
        return this.usedBytesValue;
    }

    get size(): number {
        return this.entries.size;
    }

    get(key: K): V | undefined {
        const entry = this.entries.get(key);
        if (!entry) return undefined;
        entry.touched = ++this.clock;
        return entry.value;
    }

    set(key: K, value: V, pinned: ReadonlySet<K> = new Set()): void {
        const existing = this.entries.get(key);
        if (existing) {
            this.usedBytesValue -= existing.bytes;
            if (existing.value !== value) existing.value.close();
        }

        const bytes = Math.max(1, value.width) * Math.max(1, value.height) * 4;
        this.entries.set(key, {
            value,
            bytes,
            touched: ++this.clock,
        });
        this.usedBytesValue += bytes;

        this.evict(pinned);
    }

    evict(pinned: ReadonlySet<K> = new Set()): void {
        if (this.usedBytesValue <= this.maxBytes) return;

        const candidates = [...this.entries.entries()]
            .filter(([key]) => !pinned.has(key))
            .sort((a, b) => a[1].touched - b[1].touched);

        for (const [key, entry] of candidates) {
            if (this.usedBytesValue <= this.maxBytes) break;
            this.entries.delete(key);
            this.usedBytesValue -= entry.bytes;
            entry.value.close();
        }
    }

    delete(key: K): boolean {
        const entry = this.entries.get(key);
        if (!entry) return false;
        this.entries.delete(key);
        this.usedBytesValue -= entry.bytes;
        entry.value.close();
        return true;
    }

    clear(): void {
        for (const entry of this.entries.values()) {
            entry.value.close();
        }
        this.entries.clear();
        this.usedBytesValue = 0;
    }
}
