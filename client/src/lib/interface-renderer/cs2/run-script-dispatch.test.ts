import { beforeEach, describe, expect, it } from "vitest";

import type { EnumType } from "@/rs/config/enumtype/EnumType";
import type { EnumTypeLoader } from "@/rs/config/enumtype/EnumTypeLoader";

import { Interpreter } from "./Interpreter";
import { method3270 } from "./run-script";
import { applyCs2RuntimeFromSim } from "./runtime-context";
import { Script } from "./Script";
import { ScriptOpcodes } from "./ScriptOpcodes";

function script(): Script {
  const value = new Script();
  value.cacheKey = 9001;
  value.field974 = "interface-preview-dispatch";
  return value;
}

function enumLoader(): EnumTypeLoader {
  const def = {
    inputType: "i",
    outputType: "i",
    defaultString: "null",
    defaultInt: 0,
    outputCount: 1,
    keys: [7],
    intValues: [42],
    stringValues: [],
  } as unknown as EnumType;

  return {
    load(id: number): EnumType {
      return id === 12
        ? def
        : ({ ...def, outputCount: 0, keys: [], intValues: [] } as unknown as EnumType);
    },
    getCount(): number {
      return 1;
    },
    clearCache(): void {},
  };
}

beforeEach(() => {
  Interpreter.Interpreter_intStackSize = 0;
  Interpreter.Interpreter_stringStackSize = 0;
  Interpreter.Interpreter_intStack.fill(0);
  Interpreter.Interpreter_stringStack.fill(null);
  applyCs2RuntimeFromSim(null, "test", {}, null);
});

describe("CS2 method3270 preview dispatch", () => {
  it("handles Friends Chat count through deterministic mock client state", async () => {
    expect(await method3270(ScriptOpcodes.CLAN_GETCHATCOUNT, script(), false)).toBe(1);
    expect(Interpreter.Interpreter_intStackSize).toBe(1);
    expect(Interpreter.Interpreter_intStack[0]).toBe(0);
  });

  it("routes ENUM 3408 through the selected-cache enum loader", async () => {
    applyCs2RuntimeFromSim(
      null,
      "test",
      {},
      null,
      null,
      null,
      null,
      null,
      null,
      enumLoader(),
    );

    Interpreter.Interpreter_intStackSize = 4;
    Interpreter.Interpreter_intStack[0] = "i".charCodeAt(0);
    Interpreter.Interpreter_intStack[1] = "i".charCodeAt(0);
    Interpreter.Interpreter_intStack[2] = 12;
    Interpreter.Interpreter_intStack[3] = 7;

    expect(await method3270(ScriptOpcodes.ENUM, script(), false)).toBe(1);
    expect(Interpreter.Interpreter_intStackSize).toBe(1);
    expect(Interpreter.Interpreter_intStack[0]).toBe(42);
  });
});

describe("CS2 CC_CLONE (105)", () => {
  it("copies a child widget into a new child slot of the same layer and makes it active", async () => {
    const { createDynamicWidget } = await import("./runtime-widget");
    const layer = createDynamicWidget(0, 0, 0);
    layer.id = 7;
    layer.packedId = 7;
    const tab = createDynamicWidget(7, 5, 0);
    tab.width = 41;
    tab.height = 40;
    tab.graphic = 897;
    layer.children = [tab];
    applyCs2RuntimeFromSim(null, "test", {}, null, { components: { "7": layer } } as never);

    Interpreter.Interpreter_intStackSize = 3;
    Interpreter.Interpreter_intStack[0] = 7;
    Interpreter.Interpreter_intStack[1] = 0;
    Interpreter.Interpreter_intStack[2] = 1;
    expect(await method3270(ScriptOpcodes.CC_CLONE, script(), false)).toBe(1);

    // children are filled in order, like cc_create: skipping a slot creates nothing
    Interpreter.Interpreter_intStackSize = 3;
    Interpreter.Interpreter_intStack.splice(0, 3, 7, 0, 5);
    expect(await method3270(ScriptOpcodes.CC_CLONE, script(), false)).toBe(1);
    expect(layer.children![5]).toBeUndefined();

    const copy = layer.children![1] as typeof tab;
    expect(Interpreter.Interpreter_intStackSize).toBe(0);
    expect(copy).not.toBe(tab);
    expect(copy).toMatchObject({ type: 5, width: 41, height: 40, graphic: 897, childIndex: 1 });
  });
});

describe("CS2 widget size getters", () => {
  it("read back laid-out sizes, not the raw 'parent minus n' fields", async () => {
    const { createDynamicWidget } = await import("./runtime-widget");
    const root = createDynamicWidget(0, 0, 0);
    root.id = 0;
    root.packedId = 0;
    root.layer = -1;
    root.widthMode = 1; // parent width minus 0
    root.heightMode = 1;
    const frame = createDynamicWidget(0, 0, 0);
    frame.id = 5;
    frame.packedId = 5;
    frame.layer = 0;
    frame.width = 24; // 24 less than the root
    frame.height = 10;
    frame.widthMode = 1;
    frame.heightMode = 1;
    applyCs2RuntimeFromSim(null, "test", {}, null, { components: { "0": root, "5": frame } } as never, 765, 503, null, null, null, null, 512, 334);

    Interpreter.Interpreter_intStackSize = 1;
    Interpreter.Interpreter_intStack[0] = 5;
    expect(await method3270(ScriptOpcodes.IF_GETWIDTH, script(), false)).toBe(1);
    expect(Interpreter.Interpreter_intStack[0]).toBe(512 - 24);

    Interpreter.Interpreter_intStackSize = 1;
    Interpreter.Interpreter_intStack[0] = 5;
    expect(await method3270(ScriptOpcodes.IF_GETHEIGHT, script(), false)).toBe(1);
    expect(Interpreter.Interpreter_intStack[0]).toBe(334 - 10);
  });
});
