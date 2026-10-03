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
  } as EnumType;

  return {
    load(id: number): EnumType {
      return id === 12 ? def : ({ ...def, outputCount: 0, keys: [], intValues: [] } as EnumType);
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
