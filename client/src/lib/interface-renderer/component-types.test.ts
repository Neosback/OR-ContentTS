import { describe, expect, it } from "vitest";

import {
  cloneInterfaceEntryForSimulation,
  type ComponentType,
  type InterfaceEntry,
} from "./component-types";

function widget(id: number): ComponentType {
  return {
    id,
    packedId: id,
    children: null,
    text: "",
  } as ComponentType;
}

describe("cloneInterfaceEntryForSimulation", () => {
  it("isolates runtime widget mutations from the authoring graph", () => {
    const child = widget(2);
    const parent = {
      ...widget(1),
      children: [child],
    } as ComponentType;

    const source: InterfaceEntry = {
      name: "test",
      componentCount: 2,
      hash: 1,
      components: {
        "1": parent,
        "2": child,
      },
    };

    const runtime = cloneInterfaceEntryForSimulation(source);
    const runtimeParent = runtime.components["1"]!;
    const runtimeChild = runtime.components["2"]!;

    expect(runtime).not.toBe(source);
    expect(runtimeParent).not.toBe(parent);
    expect(runtimeChild).not.toBe(child);
    expect(runtimeParent.children?.[0]).toBe(runtimeChild);

    runtimeChild.text = "runtime-only";
    runtimeParent.children!.push(widget(3));

    expect(source.components["2"]!.text).toBe("");
    expect(source.components["1"]!.children).toHaveLength(1);
    expect(runtime.components["2"]!.text).toBe("runtime-only");
    expect(runtime.components["1"]!.children).toHaveLength(2);
  });

  it("clones nested script/listener arrays instead of sharing authoring arrays", () => {
    const sourceWidget = {
      ...widget(1),
      onVarTransmit: [123, "arg"],
      onVarTransmitList: [7, 8],
      itemIds: [1, 2],
      itemQuantities: [3, 4],
    } as ComponentType;

    const source: InterfaceEntry = {
      name: null,
      componentCount: 1,
      hash: 0,
      components: { "1": sourceWidget },
    };

    const runtime = cloneInterfaceEntryForSimulation(source);
    const cloned = runtime.components["1"]!;

    cloned.onVarTransmitList![0] = 99;
    cloned.itemIds![0] = 500;

    expect(sourceWidget.onVarTransmitList).toEqual([7, 8]);
    expect(sourceWidget.itemIds).toEqual([1, 2]);
  });
});
