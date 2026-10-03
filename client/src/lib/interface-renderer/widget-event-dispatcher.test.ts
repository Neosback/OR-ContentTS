import { beforeEach, describe, expect, it } from "vitest";

import type { ComponentType, InterfaceEntry } from "./component-types";
import {
  createMockClientState,
  setMockClientItemContainer,
  setMockClientSkill,
  setMockClientVarp,
  snapshotMockClientChanges,
} from "./mock-client-state";
import { Interpreter } from "./cs2/Interpreter";
import { applyCs2RuntimeFromSim } from "./cs2/runtime-context";
import { Script } from "./cs2/Script";
import { ScriptOpcodes } from "./cs2/ScriptOpcodes";
import {
  normalizeWidgetScriptArgs,
  transmitTriggersMatch,
  WidgetEventDispatcher,
} from "./widget-event-dispatcher";

function component(id: number, patch: Partial<ComponentType> = {}): ComponentType {
  return {
    id,
    packedId: id,
    children: null,
    ...patch,
  } as ComponentType;
}

function entry(...components: ComponentType[]): InterfaceEntry {
  return {
    name: "event-test",
    componentCount: components.length,
    hash: 0,
    components: Object.fromEntries(components.map((value) => [String(value.id), value])),
  };
}

function cachedScript(
  id: number,
  opcodes: number[],
  intOperands: number[],
  localIntCount = 0,
): Script {
  const script = new Script();
  script.cacheKey = id;
  script.field974 = `widget-event-${id}`;
  script.opcodes = opcodes;
  script.intOperands = intOperands;
  script.stringOperands = opcodes.map(() => null);
  script.localIntCount = localIntCount;
  Script.cachedScripts.set(id, script);
  return script;
}

function markerScript(id: number, markerVarc: number, value: number): Script {
  return cachedScript(
    id,
    [ScriptOpcodes.ICONST, ScriptOpcodes.SET_VARC_INT, ScriptOpcodes.RETURN],
    [value, markerVarc, 0],
  );
}

beforeEach(() => {
  Script.cachedScripts.clear();
  Interpreter.Interpreter_intStackSize = 0;
  Interpreter.Interpreter_stringStackSize = 0;
  Interpreter.Interpreter_intStack.fill(0);
  Interpreter.Interpreter_stringStack.fill(null);
  applyCs2RuntimeFromSim(null, "test", {}, null);
});

describe("WidgetEventDispatcher", () => {
  it("normalizes listener args and matches trigger lists", () => {
    expect(normalizeWidgetScriptArgs([123, "hello", 4])).toEqual([123, "hello", 4]);
    expect(normalizeWidgetScriptArgs(["123", 7])).toEqual([123, 7]);
    expect(normalizeWidgetScriptArgs([])).toBeNull();
    expect(normalizeWidgetScriptArgs(["nope"])).toBeNull();

    expect(transmitTriggersMatch(null, [5])).toBe(true);
    expect(transmitTriggersMatch([5, 7], [7])).toBe(true);
    expect(transmitTriggersMatch([5], [7])).toBe(false);
    expect(transmitTriggersMatch([], [7])).toBe(false);
    expect(transmitTriggersMatch([7], [])).toBe(false);
  });

  it("dispatches only transmit listeners whose trigger ids changed", async () => {
    const state = createMockClientState();
    applyCs2RuntimeFromSim(state, "test", {}, null);

    markerScript(100, 900, 11);
    markerScript(101, 901, 22);
    markerScript(102, 902, 33);

    const data = entry(
      component(1, { onVarTransmit: [100], onVarTransmitList: [12] }),
      component(2, { onVarTransmit: [101], onVarTransmitList: [99] }),
      component(3, { onVarTransmit: [102], onVarTransmitList: null }),
    );

    setMockClientVarp(state, 12, 44);
    const dispatcher = new WidgetEventDispatcher();
    const changes = await dispatcher.dispatchTransmits(data, state);

    expect(changes.varps).toEqual([12]);
    expect(state.varcs.getInt(900)).toBe(11);
    expect(state.varcs.getInt(901)).toBe(-1);
    expect(state.varcs.getInt(902)).toBe(33);
    expect(snapshotMockClientChanges(state).varps).toEqual([]);
  });

  it("dispatches inventory and stat transmit listeners from the shared change journal", async () => {
    const state = createMockClientState();
    applyCs2RuntimeFromSim(state, "test", {}, null);

    markerScript(110, 910, 1);
    markerScript(111, 911, 1);

    const data = entry(
      component(1, { onInvTransmit: [110], onInvTransmitList: [93] }),
      component(2, { onStatTransmit: [111], onStatTransmitList: [3] }),
    );

    setMockClientItemContainer(state, 93, {
      itemIds: [995],
      itemQuantities: [10],
      capacity: 28,
    });
    setMockClientSkill(state, 3, { currentLevel: 50 });

    const dispatcher = new WidgetEventDispatcher();
    const changes = await dispatcher.dispatchTransmits(data, state);

    expect(changes.inventories).toEqual([93]);
    expect(changes.skills).toEqual([3]);
    expect(state.varcs.getInt(910)).toBe(1);
    expect(state.varcs.getInt(911)).toBe(1);
  });

  it("dispatches timer listeners through the serialized clientscript queue", async () => {
    const state = createMockClientState();
    applyCs2RuntimeFromSim(state, "test", {}, null);
    markerScript(120, 920, 77);

    const dispatcher = new WidgetEventDispatcher();
    await dispatcher.dispatchTimer(entry(component(1, { onTimer: [120] })));

    expect(state.varcs.getInt(920)).toBe(77);
  });

  it("passes pointer coordinates into clientscript event sentinel arguments", async () => {
    const state = createMockClientState();
    applyCs2RuntimeFromSim(state, "test", {}, null);

    cachedScript(
      130,
      [ScriptOpcodes.ILOAD, ScriptOpcodes.SET_VARC_INT, ScriptOpcodes.RETURN],
      [0, 930, 0],
      1,
    );

    const target = component(1, {
      onMouseOver: [130, -2147483647],
    });
    const dispatcher = new WidgetEventDispatcher();

    await dispatcher.dispatchPointer(target, "mouseOver", { mouseX: 321, mouseY: 654 });

    expect(state.varcs.getInt(930)).toBe(321);
  });

  it("dispatches click and release listeners in order", async () => {
    const state = createMockClientState();
    applyCs2RuntimeFromSim(state, "test", {}, null);

    markerScript(140, 940, 1);
    markerScript(141, 940, 2);
    const target = component(1, {
      onClick: [140],
      onRelease: [141],
    });
    const dispatcher = new WidgetEventDispatcher();

    void dispatcher.dispatchPointer(target, "click", { mouseX: 1, mouseY: 2 });
    await dispatcher.dispatchPointer(target, "release", { mouseX: 3, mouseY: 4 });

    expect(state.varcs.getInt(940)).toBe(2);
  });
});
