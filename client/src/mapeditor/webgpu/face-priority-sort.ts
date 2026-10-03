/**
 * CPU reference for the OSRS/RuneLite face-priority ordering rules.
 *
 * RuneLite first visits faces from far to near, buckets them by priority, then interleaves priorities 10/11 at
 * thresholds derived from priorities 1/2, 3/4 and 6/8. The WebGPU compute pass mirrors this function.
 */
export function prioritySortOrder(
    priorities: ArrayLike<number>,
    depths: ArrayLike<number>,
    ordinals?: ArrayLike<number>,
): Uint32Array {
    if (priorities.length !== depths.length || (ordinals && ordinals.length !== priorities.length)) {
        throw new Error("priority/depth/ordinal length mismatch");
    }

    const depthOrder = Array.from({ length: priorities.length }, (_, face) => face);
    depthOrder.sort((a, b) => {
        const delta = depths[b] - depths[a];
        if (delta !== 0) return delta;
        return (ordinals?.[a] ?? a) - (ordinals?.[b] ?? b);
    });

    const buckets: number[][] = Array.from({ length: 12 }, () => []);
    const sums = new Array<number>(10).fill(0);
    const dynamicDepths: number[][] = [[], []];

    for (const face of depthOrder) {
        const priority = priorities[face];
        if (!Number.isInteger(priority) || priority < 0 || priority > 11) {
            throw new RangeError(`face ${face} has invalid render priority ${priority}`);
        }
        buckets[priority].push(face);
        if (priority < 10) {
            sums[priority] += depths[face];
        } else {
            dynamicDepths[priority - 10].push(depths[face]);
        }
    }

    const average = (a: number, b: number): number => {
        const count = buckets[a].length + buckets[b].length;
        return count === 0 ? 0 : Math.trunc((sums[a] + sums[b]) / count);
    };
    const avg12 = average(1, 2);
    const avg34 = average(3, 4);
    const avg68 = average(6, 8);

    const dynamicFaces = [...buckets[10], ...buckets[11]];
    const dynamicFaceDepths = [...dynamicDepths[0], ...dynamicDepths[1]];
    let dynamicCursor = 0;

    const output: number[] = [];
    const emitDynamicAbove = (threshold: number): void => {
        while (
            dynamicCursor < dynamicFaces.length &&
            dynamicFaceDepths[dynamicCursor] > threshold
        ) {
            output.push(dynamicFaces[dynamicCursor++]);
        }
    };

    for (let priority = 0; priority < 10; priority++) {
        if (priority === 0) emitDynamicAbove(avg12);
        else if (priority === 3) emitDynamicAbove(avg34);
        else if (priority === 5) emitDynamicAbove(avg68);
        output.push(...buckets[priority]);
    }
    while (dynamicCursor < dynamicFaces.length) {
        output.push(dynamicFaces[dynamicCursor++]);
    }

    return Uint32Array.from(output);
}
