import type { ComponentType, InterfaceEntry } from "@/lib/interface-renderer/component-types";

import type { TreeNode, TreeRow } from "./interface-editor-workbench-model";
import type { InterfaceMetadataSource } from "./interface-metadata-source";

/** Legacy flag for the interface group, matching index-3 combined ids used in ComponentDecoder.loadLegacyMap. */
export function interfaceRootLegacy(
  legacy: Record<number, boolean>,
  groupId: number,
  componentFileIds: number[],
): boolean | null {
  if (componentFileIds.length === 0) return null;
  const files = [...componentFileIds].sort((a, b) => a - b);
  const tryOrder = files.includes(0) ? [0, ...files.filter((file) => file !== 0)] : files;
  for (const file of tryOrder) {
    const combined = (groupId << 16) | (file & 0xffff);
    if (Object.prototype.hasOwnProperty.call(legacy, combined)) {
      return legacy[combined]!;
    }
  }
  return null;
}

function runtimeId(component: ComponentType): number {
  return typeof component.packedId === "number" ? component.packedId : component.id;
}

export function buildComponentTree(
  entry: InterfaceEntry | null,
  fallbackRootLayer: number,
  metadataSource?: InterfaceMetadataSource,
): TreeNode[] {
  if (!entry) return [];

  const values: ComponentType[] = [];
  const seen = new Set<ComponentType>();
  const visit = (component: ComponentType): void => {
    if (seen.has(component)) return;
    seen.add(component);
    values.push(component);
    if (Array.isArray(component.children)) {
      for (const child of component.children) {
        if (child) visit(child);
      }
    }
  };
  for (const component of Object.values(entry.components)) visit(component);

  const byLayer = new Map<number, ComponentType[]>();
  for (const component of values) {
    const row = byLayer.get(component.layer);
    if (row) row.push(component);
    else byLayer.set(component.layer, [component]);
  }
  for (const row of byLayer.values()) row.sort((a, b) => a.id - b.id);

  const rootLayer = byLayer.has(-1) ? -1 : fallbackRootLayer;
  const visited = new Set<ComponentType>();
  const isDynamicCreated = (component: ComponentType): boolean =>
    Boolean((component as ComponentType & { __dynamicCreated?: boolean }).__dynamicCreated);

  const makeNode = (component: ComponentType, keyPath: string): TreeNode => {
    const rid = runtimeId(component);
    const dynamicCreated = isDynamicCreated(component);
    const componentId = rid >= 0 ? rid & 0xffff : component.id & 0xffff;
    const node: TreeNode = {
      id: component.id,
      runtimeId: rid,
      type: component.type,
      dynamicCreated,
      nodeKey: keyPath,
      component,
      metadata:
        !dynamicCreated && metadataSource
          ? metadataSource.getComponent(fallbackRootLayer, componentId, rid)
          : undefined,
      children: [],
    };
    if (visited.has(component)) return node;
    visited.add(component);
    const children = byLayer.get(rid) ?? [];
    node.children = children.map((child, index) => makeNode(child, `${keyPath}.${index}`));
    return node;
  };

  return (byLayer.get(rootLayer) ?? []).map((root, index) => makeNode(root, `r${index}`));
}

export function getRootWidgetV3(entry: InterfaceEntry, interfaceId: number): boolean | null {
  const byLayer = new Map<number, ComponentType[]>();
  for (const component of Object.values(entry.components)) {
    const row = byLayer.get(component.layer);
    if (row) row.push(component);
    else byLayer.set(component.layer, [component]);
  }
  for (const row of byLayer.values()) row.sort((a, b) => a.id - b.id);
  const rootLayer = byLayer.has(-1) ? -1 : interfaceId;
  const first = byLayer.get(rootLayer)?.[0];
  return first ? first.v3 : null;
}

export function unhideComponentSubtree(component: ComponentType): void {
  component.hide = false;
  for (const child of component.children ?? []) {
    if (child) unhideComponentSubtree(child);
  }
}

/** Pre-order flatten without deep recursion or push(...hugeArray), both of which can exceed the call stack. */
export function flattenTree(nodes: TreeNode[], depth = 0): TreeRow[] {
  const out: TreeRow[] = [];
  const stack: Array<{ node: TreeNode; depth: number }> = [];
  for (let index = nodes.length - 1; index >= 0; index--) {
    stack.push({ node: nodes[index]!, depth });
  }
  while (stack.length > 0) {
    const frame = stack.pop()!;
    out.push({ ...frame.node, depth: frame.depth });
    for (let index = frame.node.children.length - 1; index >= 0; index--) {
      stack.push({ node: frame.node.children[index]!, depth: frame.depth + 1 });
    }
  }
  return out;
}

export function legacyForInterfaceGroup(
  legacy: Record<number, boolean>,
  groupId: number,
): Record<number, boolean> {
  const out: Record<number, boolean> = {};
  for (const key of Object.keys(legacy)) {
    const combined = Number(key);
    if ((combined >>> 16) === groupId) out[combined] = legacy[combined]!;
  }
  return out;
}
