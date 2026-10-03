import type { IEditorPluginHost } from "./plugins/editor-plugin-host";

/**
 * A searchable list of the cache's object types (name and id) for Place and Replace. The cache can hold tens of
 * thousands of types and each one has to be decoded to read its name, so the list is built in small time slices in the
 * background the first time it is needed, and searches run against whatever has been read so far.
 */
export type CatalogEntry = { id: number; name: string };

const SLICE_MS = 6;
/** A search returns every match up to this many (the list is virtualized, so thousands are fine). */
const MAX_RESULTS = 5000;

export class ObjectCatalog {
    readonly entries: CatalogEntry[] = [];
    scanned = 0;
    total = 0;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private readonly listeners = new Set<() => void>();

    constructor(private readonly host: Pick<IEditorPluginHost, "locTypeLoader">) {
        this.total = host.locTypeLoader.getCount();
    }

    get done(): boolean {
        return this.scanned >= this.total;
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    start(): void {
        if (this.timer !== undefined || this.done) return;
        const step = (): void => {
            this.timer = undefined;
            const until = performance.now() + SLICE_MS;
            while (this.scanned < this.total && performance.now() < until) {
                const id = this.scanned++;
                try {
                    const name = this.host.locTypeLoader.load(id).name;
                    if (name && name !== "null") this.entries.push({ id, name });
                } catch {
                    /* an id with no definition */
                }
            }
            for (const listener of this.listeners) listener();
            if (!this.done) this.timer = setTimeout(step, 0);
        };
        this.timer = setTimeout(step, 0);
    }

    dispose(): void {
        if (this.timer !== undefined) clearTimeout(this.timer);
        this.timer = undefined;
        this.listeners.clear();
    }

    /** A number finds that id; text finds names containing it (names starting with it first). */
    search(query: string): CatalogEntry[] {
        const text = query.trim().toLowerCase();
        if (!text) return [];
        const out: CatalogEntry[] = [];
        if (/^\d+$/.test(text)) {
            const id = Number(text);
            if (id < this.total) {
                try {
                    const name = this.host.locTypeLoader.load(id).name;
                    out.push({ id, name: name && name !== "null" ? name : `Loc #${id}` });
                } catch {
                    /* no such type */
                }
            }
        }
        const starts: CatalogEntry[] = [];
        const contains: CatalogEntry[] = [];
        for (const entry of this.entries) {
            const lower = entry.name.toLowerCase();
            if (lower.startsWith(text)) starts.push(entry);
            else if (lower.includes(text)) contains.push(entry);
        }
        for (const entry of [...starts, ...contains]) {
            if (out.length >= MAX_RESULTS) break;
            if (!out.some((existing) => existing.id === entry.id)) out.push(entry);
        }
        return out;
    }
}

const catalogs = new WeakMap<object, ObjectCatalog>();

export function getObjectCatalog(host: IEditorPluginHost): ObjectCatalog {
    let catalog = catalogs.get(host.locTypeLoader);
    if (!catalog) catalogs.set(host.locTypeLoader, (catalog = new ObjectCatalog(host)));
    return catalog;
}
