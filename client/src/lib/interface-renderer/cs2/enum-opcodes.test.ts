import { beforeEach, describe, expect, it } from "vitest";

import type { EnumType } from "@/rs/config/enumtype/EnumType";
import type { EnumTypeLoader } from "@/rs/config/enumtype/EnumTypeLoader";

import { handleEnumOpcode } from "./enum-opcodes";
import { Interpreter } from "./Interpreter";
import { applyCs2RuntimeFromSim } from "./runtime-context";
import { ScriptOpcodes } from "./ScriptOpcodes";

type TestEnum = Pick<
  EnumType,
  "inputType" | "outputType" | "defaultString" | "defaultInt" | "outputCount" | "keys" | "intValues" | "stringValues"
>;

function enumDef(overrides: Partial<TestEnum> = {}): EnumType {
  return {
    inputType: "i",
    outputType: "i",
    defaultString: "null",
    defaultInt: 0,
    outputCount: 0,
    keys: [],
    intValues: [],
    stringValues: [],
    ...overrides,
  } as EnumType;
}

function installEnums(defs: Record<number, EnumType>): void {
  const loader: EnumTypeLoader = {
    load(id: number): EnumType {
      return defs[id] ?? enumDef();
    },
    getCount(): number {
      return Object.keys(defs).length;
    },
    clearCache(): void {},
  };

  applyCs2RuntimeFromSim(null, "test", {}, null, null, null, null, null, null, loader);
}

function pushInts(...values: number[]): void {
  Interpreter.Interpreter_intStackSize = values.length;
  for (let i = 0; i < values.length; i++) {
    Interpreter.Interpreter_intStack[i] = values[i]!;
  }
}

beforeEach(() => {
  Interpreter.Interpreter_intStackSize = 0;
  Interpreter.Interpreter_stringStackSize = 0;
  Interpreter.Interpreter_intStack.fill(0);
  Interpreter.Interpreter_stringStack.fill(null);
  applyCs2RuntimeFromSim(null, "test", {}, null);
});

describe("CS2 enum opcodes", () => {
  it("reads string enum values and client defaults from the selected cache", () => {
    installEnums({
      10: enumDef({
        inputType: "i",
        outputType: "s",
        defaultString: "fallback",
        outputCount: 2,
        keys: [1, 2],
        stringValues: ["one", "two"],
      }),
    });

    pushInts(10, 2);
    expect(handleEnumOpcode(ScriptOpcodes.ENUM_STRING)).toBe(1);
    expect(Interpreter.Interpreter_stringStack[0]).toBe("two");

    pushInts(10, 99);
    expect(handleEnumOpcode(ScriptOpcodes.ENUM_STRING)).toBe(1);
    expect(Interpreter.Interpreter_stringStack[1]).toBe("fallback");
  });

  it("matches ENUM input/output types and integer values", () => {
    installEnums({
      20: enumDef({
        inputType: "i",
        outputType: "i",
        defaultInt: 77,
        outputCount: 2,
        keys: [5, 6],
        intValues: [500, 600],
      }),
    });

    pushInts("i".charCodeAt(0), "i".charCodeAt(0), 20, 6);
    expect(handleEnumOpcode(ScriptOpcodes.ENUM)).toBe(1);
    expect(Interpreter.Interpreter_intStack[0]).toBe(600);

    pushInts("i".charCodeAt(0), "i".charCodeAt(0), 20, 99);
    expect(handleEnumOpcode(ScriptOpcodes.ENUM)).toBe(1);
    expect(Interpreter.Interpreter_intStack[0]).toBe(77);
  });

  it("returns client mismatch defaults when ENUM types do not match", () => {
    installEnums({
      30: enumDef({ inputType: "i", outputType: "s", defaultString: "fallback" }),
    });

    pushInts("s".charCodeAt(0), "s".charCodeAt(0), 30, 1);
    expect(handleEnumOpcode(ScriptOpcodes.ENUM)).toBe(1);
    expect(Interpreter.Interpreter_stringStack[0]).toBe("null");

    pushInts("s".charCodeAt(0), "i".charCodeAt(0), 30, 1);
    expect(handleEnumOpcode(ScriptOpcodes.ENUM)).toBe(1);
    expect(Interpreter.Interpreter_intStack[0]).toBe(0);
  });

  it("reports the enum output count", () => {
    installEnums({
      40: enumDef({
        outputCount: 3,
        keys: [1, 2, 3],
        intValues: [10, 20, 30],
      }),
    });

    pushInts(40);
    expect(handleEnumOpcode(ScriptOpcodes.ENUM_GETOUTPUTCOUNT)).toBe(1);
    expect(Interpreter.Interpreter_intStack[0]).toBe(3);
  });

  it("uses the newly installed cache loader instead of retaining stale enum data", () => {
    installEnums({
      50: enumDef({
        inputType: "i",
        outputType: "s",
        outputCount: 1,
        keys: [1],
        stringValues: ["cache-a"],
      }),
    });
    pushInts(50, 1);
    expect(handleEnumOpcode(ScriptOpcodes.ENUM_STRING)).toBe(1);
    expect(Interpreter.Interpreter_stringStack[0]).toBe("cache-a");

    installEnums({
      50: enumDef({
        inputType: "i",
        outputType: "s",
        outputCount: 1,
        keys: [1],
        stringValues: ["cache-b"],
      }),
    });
    pushInts(50, 1);
    expect(handleEnumOpcode(ScriptOpcodes.ENUM_STRING)).toBe(1);
    expect(Interpreter.Interpreter_stringStack[1]).toBe("cache-b");
  });

  it("leaves the enum family unsupported when no local enum loader exists", () => {
    pushInts(1);
    expect(handleEnumOpcode(ScriptOpcodes.ENUM_GETOUTPUTCOUNT)).toBe(2);
    expect(Interpreter.Interpreter_intStackSize).toBe(1);
  });
});
