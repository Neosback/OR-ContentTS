/** Number of mip levels of a square texture: size, size/2, ... 1. */
export function mipLevelCount(size: number): number {
    return Math.floor(Math.log2(size)) + 1;
}

/**
 * Box-filtered mip chain for a stack of square RGBA8 layers (`layers * size * size * 4` bytes). Level 0 is the input
 * itself; each following level averages 2x2 blocks per channel, which is what `generateMipmap` does on the GPU.
 */
export function generateLayerMips(base: Uint8Array, size: number, layers: number): Uint8Array[] {
    const levels: Uint8Array[] = [base];
    let previous = base;
    let previousSize = size;
    while (previousSize > 1) {
        const nextSize = previousSize >> 1;
        const next = new Uint8Array(layers * nextSize * nextSize * 4);
        for (let layer = 0; layer < layers; layer++) {
            const sourceLayer = layer * previousSize * previousSize * 4;
            const targetLayer = layer * nextSize * nextSize * 4;
            for (let y = 0; y < nextSize; y++) {
                for (let x = 0; x < nextSize; x++) {
                    const s00 = sourceLayer + ((y * 2) * previousSize + x * 2) * 4;
                    const s01 = s00 + 4;
                    const s10 = s00 + previousSize * 4;
                    const s11 = s10 + 4;
                    const t = targetLayer + (y * nextSize + x) * 4;
                    for (let c = 0; c < 4; c++) {
                        next[t + c] = (previous[s00 + c] + previous[s01 + c] + previous[s10 + c] + previous[s11 + c] + 2) >> 2;
                    }
                }
            }
        }
        levels.push(next);
        previous = next;
        previousSize = nextSize;
    }
    return levels;
}
