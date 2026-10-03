import { beforeEach, describe, expect, it } from "vitest";

import type { VarbitDefinitionLookup } from "@/rs/config/vartype/bit/VarBitTypeLoader";

import type { ComponentType } from "./component-types";
import { Cs1Interpreter } from "./cs1-interpreter";
import {
  clearMockClientChanges,
  createMockClientState,
  setMockClientInventory,
  setMockClientSocialState,
  setMockClientVarbit,
  snapshotMockClientChanges,
} from "./mock-client-state";
import { Interpreter } from "./cs2/Interpreter";
import { applyCs2RuntimeFromSim, getCs2RuntimeContext } from "./cs2/runtime-context";
import { runScript } from "./cs2/run-script";
import { Script } from "./cs2/Script";
import { ScriptEvent } from "./cs2/script-event";
import { ScriptOpcodes } from "./cs2/ScriptOpcodes";

function cachedScript(id: number, opcodes: number[], intOperands: number[], stringOperands: (string | null)[] = []): Script {
  const script = new Script();
  script.cacheKey = id;
  script.field974 = `mock-client-${id}`;
  script.opcodes = opcodes;
  script.intOperands = intOperands;
  script.stringOperands = stringOperands;
  Script.cachedScripts.set(id, script);
  return script;
}

async function runCachedScript(id: number): Promise<void> {
  const event = new ScriptEvent();
  event.args = [id];
  await runScript(event, 1000, 0);
}

beforeEach(() => {
  Script.cachedScripts.clear();
  Interpreter.Interpreter_intStackSize = 0;
  Interpreter.Interpreter_stringStackSize = 0;
  Interpreter.Interpreter_intStack.fill(0);
  Interpreter.Interpreter_stringStack.fill(null);
  applyCs2RuntimeFromSim(null, "test", {}, null);
});

describe("Mock client state harness", () => {
  it("shares one varp source between CS2 mutations and CS1 reads", async () => {
    const state = createMockClientState();
    applyCs2RuntimeFromSim(state, "test", {}, null);

    cachedScript(
      100,
      [ScriptOpcodes.ICONST, ScriptOpcodes.SET_VARP, ScriptOpcodes.RETURN],
      [77, 321, 0],
    );

    await runCachedScript(100);

    const widget = {
      cs1Instructions: [[Cs1Interpreter.Op.VARP, 321, Cs1Interpreter.Op.RETURN]],
    } as unknown as ComponentType;

    expect(getCs2RuntimeContext().clientState).toBe(state);
    expect(state.varps.getVarp(321)).toBe(77);
    expect(Cs1Interpreter.evaluate(widget, 0, state)).toBe(77);
    expect(snapshotMockClientChanges(state).varps).toEqual([321]);
  });

  it("tracks varbit mutations against their backing varp", () => {
    const state = createMockClientState();
    const lookup: VarbitDefinitionLookup = (id) =>
      id === 12
        ? ({ baseVar: 9, startBit: 2, endBit: 4 } as ReturnType<VarbitDefinitionLookup>)
        : null;

    setMockClientVarbit(state, 12, 5, lookup);

    expect(state.varps.getVarbit(12, lookup)).toBe(5);
    expect(snapshotMockClientChanges(state)).toMatchObject({
      varps: [9],
      varbits: [12],
    });
  });

  it("stores Varcs in the same state used by CS2", async () => {
    const state = createMockClientState();
    applyCs2RuntimeFromSim(state, "test", {}, null);

    cachedScript(
      101,
      [ScriptOpcodes.ICONST, ScriptOpcodes.SET_VARC_INT, ScriptOpcodes.RETURN],
      [456, 88, 0],
    );

    await runCachedScript(101);

    expect(getCs2RuntimeContext().varcs).toBe(state.varcs);
    expect(state.varcs.getInt(88)).toBe(456);
    expect(snapshotMockClientChanges(state).varcInts).toEqual([88]);
  });

  it("tracks inventory and social mutations for future transmit dispatch", () => {
    const state = createMockClientState();

    setMockClientInventory(state, 93, {
      itemIds: [4162, 0],
      itemQuantities: [1, 0],
    });
    setMockClientSocialState(state, {
      localPlayerName: "Local",
      friends: [{ name: "Friend", world: 302 }],
      ignores: [],
      friendsChat: null,
    });

    expect(state.simulatedInventories[93]).toEqual({
      itemIds: [4162, 0],
      itemQuantities: [1, 0],
    });
    expect(state.social.friends[0]?.name).toBe("Friend");
    expect(snapshotMockClientChanges(state)).toMatchObject({
      inventories: [93],
      social: true,
    });

    clearMockClientChanges(state);
    expect(snapshotMockClientChanges(state)).toEqual({
      varps: [],
      varbits: [],
      varcInts: [],
      varcStrings: [],
      inventories: [],
      skills: [],
      social: false,
    });
  });
});
