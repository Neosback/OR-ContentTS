import { describe, expect, it } from "vitest";

import { ThumbnailQueue } from "./thumbnail-queue";

const manual = () => {
    const tasks: (() => void)[] = [];
    return { schedule: (task: () => void) => void tasks.push(task), run: () => tasks.shift()?.(), size: () => tasks.length };
};

describe("ThumbnailQueue", () => {
    it("renders newest requests first and caches the result", () => {
        const rendered: number[] = [];
        const clock = manual();
        // A budget of 0 ms means one picture per slice.
        const queue = new ThumbnailQueue((key) => (rendered.push(key), `img${key}`), clock.schedule, 10, 0, () => 0);
        const got: Record<number, string | null> = {};
        queue.request(1, (url) => (got[1] = url));
        queue.request(2, (url) => (got[2] = url));
        queue.request(3, (url) => (got[3] = url));
        clock.run();
        expect(rendered).toEqual([3]);
        clock.run();
        clock.run();
        expect(rendered).toEqual([3, 2, 1]);
        expect(got).toEqual({ 1: "img1", 2: "img2", 3: "img3" });
        let again: string | null = null;
        queue.request(2, (url) => (again = url));
        expect(again).toBe("img2");
        expect(rendered).toHaveLength(3);
    });

    it("drops withdrawn requests, shares duplicates, and evicts the oldest picture", () => {
        const clock = manual();
        const rendered: number[] = [];
        const queue = new ThumbnailQueue((key) => (rendered.push(key), key === 9 ? null : `i${key}`), clock.schedule, 2, 100, () => 0);
        const cancel = queue.request(1, () => undefined);
        cancel();
        expect(queue.pending).toBe(0);
        let a: string | null | undefined;
        let b: string | null | undefined;
        queue.request(5, (url) => (a = url));
        queue.request(5, (url) => (b = url));
        queue.request(9, () => undefined);
        queue.request(6, () => undefined);
        clock.run();
        expect([a, b]).toEqual(["i5", "i5"]);
        expect(rendered.sort()).toEqual([5, 6, 9]);
        // Capacity 2: 6 was the oldest of the three pictures, so asking for it again renders it again; 5 is still cached.
        queue.request(5, () => undefined);
        expect(clock.size()).toBe(0);
        queue.request(6, () => undefined);
        clock.run();
        expect(rendered.filter((key) => key === 6)).toHaveLength(2);
        expect(rendered.filter((key) => key === 5)).toHaveLength(1);
    });
});
