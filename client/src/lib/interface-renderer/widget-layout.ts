import type { ComponentType } from "./component-types";

export function alignWidgetSize(var0: ComponentType, var1: number, var2: number, _var3: boolean): void {
  if (var0.type === 12) {
    var0.tempWidth = var0.width;
    var0.tempHeight = var0.height;
    return;
  }
  if (var0.clientCode === 1337) {
    var0.tempWidth = var0.width;
    var0.tempHeight = var0.height;
    return;
  }

  if (var0.widthMode === 0) {
    var0.tempWidth = var0.width;
  } else if (var0.widthMode === 1) {
    var0.tempWidth = var1 - var0.width;
  } else if (var0.widthMode === 2) {
    var0.tempWidth = (var0.width * var1) >> 14;
  } else {
    var0.tempWidth = var0.width;
  }

  if (var0.heightMode === 0) {
    var0.tempHeight = var0.height;
  } else if (var0.heightMode === 1) {
    var0.tempHeight = var2 - var0.height;
  } else if (var0.heightMode === 2) {
    var0.tempHeight = (var0.height * var2) >> 14;
  } else {
    var0.tempHeight = var0.height;
  }

  const field3677 = Math.max(1, var0.field3677 ?? 1);
  const field3770 = Math.max(1, var0.field3770 ?? 1);
  if (var0.widthMode === 4) {
    var0.tempWidth = Math.trunc((field3770 * var0.tempHeight) / field3677);
  }
  if (var0.heightMode === 4) {
    var0.tempHeight = Math.trunc((var0.tempWidth * field3677) / field3770);
  }
}

export function alignWidgetPosition(var0: ComponentType, var1: number, var2: number): void {
  const width1 = var0.tempWidth;
  const height1 = var0.tempHeight;

  if (var0.xMode === 0) {
    var0.x1 = var0.x;
  } else if (var0.xMode === 1) {
    var0.x1 = var0.x + ((var1 - width1) >> 1);
  } else if (var0.xMode === 2) {
    var0.x1 = var1 - width1 - var0.x;
  } else if (var0.xMode === 3) {
    var0.x1 = (var0.x * var1) >> 14;
  } else if (var0.xMode === 4) {
    var0.x1 = ((var1 - width1) >> 1) + ((var0.x * var1) >> 14);
  } else {
    var0.x1 = var1 - width1 - ((var0.x * var1) >> 14);
  }

  if (var0.yMode === 0) {
    var0.y1 = var0.y;
  } else if (var0.yMode === 1) {
    var0.y1 = ((var2 - height1) >> 1) + var0.y;
  } else if (var0.yMode === 2) {
    var0.y1 = var2 - height1 - var0.y;
  } else if (var0.yMode === 3) {
    var0.y1 = (var2 * var0.y) >> 14;
  } else if (var0.yMode === 4) {
    var0.y1 = ((var2 - height1) >> 1) + ((var2 * var0.y) >> 14);
  } else {
    var0.y1 = var2 - height1 - ((var2 * var0.y) >> 14);
  }
}

export function alignWidget(var0: ComponentType, parentTempWidth: number, parentTempHeight: number): void {
  alignWidgetSize(var0, parentTempWidth, parentTempHeight, false);
  alignWidgetPosition(var0, parentTempWidth, parentTempHeight);
}


type LayoutWidget = ComponentType;

/**
 * The size and position a widget has once laid out, computed from its raw fields and its parents'. Scripts read these
 * (`if_getwidth`, `cc_getx`, ...): the client keeps the resolved numbers separate from the raw ones a script sets, so a
 * `cc_setsize` in mode "parent minus n" still reads back as an actual pixel size. Works before the first draw.
 */
export function resolveWidgetLayout(
  widget: LayoutWidget,
  findParent: (widget: LayoutWidget) => LayoutWidget | null,
  viewport: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const chain: LayoutWidget[] = [];
  const seen = new Set<LayoutWidget>();
  let current: LayoutWidget | null = widget;
  while (current && !seen.has(current)) {
    seen.add(current);
    chain.unshift(current);
    current = findParent(current);
  }
  let parentWidth = viewport.width;
  let parentHeight = viewport.height;
  let last = chain[chain.length - 1]!;
  for (const node of chain) {
    // A container lays its children out against its scroll area when it has one.
    alignWidget(node, parentWidth, parentHeight);
    last = node;
    parentWidth = node.scrollWidth !== 0 ? node.scrollWidth : node.tempWidth;
    parentHeight = node.scrollHeight !== 0 ? node.scrollHeight : node.tempHeight;
  }
  return { x: last.x1 ?? 0, y: last.y1 ?? 0, width: last.tempWidth, height: last.tempHeight };
}
