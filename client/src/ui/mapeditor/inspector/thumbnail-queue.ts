/**
 * Lazy thumbnail rendering for long lists. Rows ask for a picture and get it back later: requests wait in a queue,
 * newest first (the rows the user just scrolled to), and are rendered a few milliseconds at a time so scrolling never
 * stalls. Finished pictures are kept in a small LRU cache. The renderer and the scheduler are injected so the queue
 * can be tested without a canvas.
 */
export type Schedule = (task: () => void) => void;

export class ThumbnailQueue {
    private readonly cache = new Map<number, string | null>();
    private readonly waiting: { key: number; callbacks: Set<(url: string | null) => void> }[] = [];
    private running = false;

    constructor(
        private readonly render: (key: number) => string | null,
        private readonly schedule: Schedule = (task) => void setTimeout(task, 0),
        private readonly capacity = 400,
        private readonly budgetMs = 6,
        private readonly now: () => number = () => performance.now(),
    ) {}

    /** Calls `done` with the picture (or null when there is none). Returns a function that withdraws the request. */
    request(key: number, done: (url: string | null) => void): () => void {
        const cached = this.cache.get(key);
        if (cached !== undefined) {
            // Refresh recency.
            this.cache.delete(key);
            this.cache.set(key, cached);
            done(cached);
            return () => undefined;
        }
        let entry = this.waiting.find((item) => item.key === key);
        if (!entry) {
            entry = { key, callbacks: new Set() };
            this.waiting.push(entry);
        }
        entry.callbacks.add(done);
        this.pump();
        return () => {
            entry.callbacks.delete(done);
            if (entry.callbacks.size === 0) {
                const index = this.waiting.indexOf(entry);
                if (index >= 0) this.waiting.splice(index, 1);
            }
        };
    }

    get pending(): number {
        return this.waiting.length;
    }

    private pump(): void {
        if (this.running || this.waiting.length === 0) return;
        this.running = true;
        this.schedule(() => {
            this.running = false;
            const until = this.now() + this.budgetMs;
            do {
                const entry = this.waiting.pop();
                if (!entry) break;
                let url: string | null = null;
                try {
                    url = this.render(entry.key);
                } catch {
                    url = null;
                }
                this.cache.set(entry.key, url);
                if (this.cache.size > this.capacity) this.cache.delete(this.cache.keys().next().value as number);
                for (const callback of entry.callbacks) callback(url);
            } while (this.waiting.length > 0 && this.now() < until);
            this.pump();
        });
    }
}
