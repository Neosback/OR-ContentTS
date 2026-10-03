/**
 * Which rows of a fixed-row-height list to render: the ones in view plus a few either side so fast scrolling does not
 * show gaps. `offset` is the pixel position of the first rendered row.
 */
export type VirtualWindow = { start: number; end: number; offset: number; total: number };

export function computeVirtualWindow(scrollTop: number, viewportHeight: number, rowHeight: number, count: number, overscan = 4): VirtualWindow {
    const total = count * rowHeight;
    if (count <= 0 || rowHeight <= 0) return { start: 0, end: 0, offset: 0, total: 0 };
    const first = Math.floor(Math.max(0, scrollTop) / rowHeight);
    const visible = Math.ceil(Math.max(0, viewportHeight) / rowHeight) + 1;
    const start = Math.max(0, Math.min(count - 1, first - overscan));
    const end = Math.min(count, first + visible + overscan);
    return { start, end, offset: start * rowHeight, total };
}

/** The scrollTop that brings row `index` fully into view with the least movement. */
export function scrollTopToReveal(index: number, scrollTop: number, viewportHeight: number, rowHeight: number): number {
    const top = index * rowHeight;
    const bottom = top + rowHeight;
    if (top < scrollTop) return top;
    if (bottom > scrollTop + viewportHeight) return bottom - viewportHeight;
    return scrollTop;
}
