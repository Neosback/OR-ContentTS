import { beforeEach, describe, expect, it } from "vitest";

import { ObjStackability } from "@/rs/config/objtype/ObjStackability";
import type { ObjType } from "@/rs/config/objtype/ObjType";
import type { ObjTypeLoader } from "@/rs/config/objtype/ObjTypeLoader";

import { Interpreter } from "./Interpreter";
import { handleObjectOpcode, resetObjectSearchState } from "./object-opcodes";
import { applyCs2RuntimeFromSim } from "./runtime-context";
import { ScriptOpcodes } from "./ScriptOpcodes";

type TestObject = Pick<
  ObjType,
  | "name"
  | "groundActions"
  | "inventoryActions"
  | "price"
  | "stackability"
  | "note"
  | "noteTemplate"
  | "isMembers"
  | "placeholder"
  | "placeholderTemplate"
  | "isTradable"
>;

function object(overrides: Partial<TestObject> = {}): ObjType {
  return {
    name: "null",
    groundActions: [null, null, "Take", null, null],
    inventoryActions: [null, null, null, null, "Drop"],
    price: 1,
    stackability: ObjStackability.SOMETIMES,
    note: -1,
    noteTemplate: -1,
    isMembers: false,
    placeholder: -1,
    placeholderTemplate: -1,
    isTradable: false,
    ...overrides,
  } as ObjType;
}

function installObjects(objects: ObjType[]): void {
  const loader: ObjTypeLoader = {
    load(id: number): ObjType {
      return objects[id] ?? object();
    },
    getCount(): number {
      return objects.length;
    },
    clearCache(): void {},
  };
  applyCs2RuntimeFromSim(null, "test", {}, null, null, null, null, null, loader);
}

function pushInts(...values: number[]): void {
  Interpreter.Interpreter_intStackSize = values.length;
  for (let i = 0; i < values.length; i++) {
    Interpreter.Interpreter_intStack[i] = values[i]!;
  }
}

function pushStrings(...values: string[]): void {
  Interpreter.Interpreter_stringStackSize = values.length;
  for (let i = 0; i < values.length; i++) {
    Interpreter.Interpreter_stringStack[i] = values[i]!;
  }
}

beforeEach(() => {
  Interpreter.Interpreter_intStackSize = 0;
  Interpreter.Interpreter_stringStackSize = 0;
  Interpreter.Interpreter_intStack.fill(0);
  Interpreter.Interpreter_stringStack.fill(null);
  resetObjectSearchState();
  applyCs2RuntimeFromSim(null, "test", {}, null);
});

describe("CS2 object opcodes", () => {
  it("reads cache-backed name, actions, cost, stackability and membership", () => {
    installObjects([
      object({
        name: "Dragon sword",
        groundActions: ["Grab", null, null, null, null],
        inventoryActions: ["Wield", null, null, null, "Drop"],
        price: 100000,
        stackability: ObjStackability.ALWAYS,
        isMembers: true,
      }),
    ]);

    pushInts(0);
    expect(handleObjectOpcode(ScriptOpcodes.OC_NAME)).toBe(1);
    expect(Interpreter.Interpreter_stringStack[0]).toBe("Dragon sword");

    pushInts(0, 1);
    expect(handleObjectOpcode(ScriptOpcodes.OC_OP)).toBe(1);
    expect(Interpreter.Interpreter_stringStack[1]).toBe("Grab");

    pushInts(0, 1);
    expect(handleObjectOpcode(ScriptOpcodes.OC_IOP)).toBe(1);
    expect(Interpreter.Interpreter_stringStack[2]).toBe("Wield");

    pushInts(0);
    expect(handleObjectOpcode(ScriptOpcodes.OC_COST)).toBe(1);
    expect(Interpreter.Interpreter_intStack[0]).toBe(100000);

    pushInts(0);
    expect(handleObjectOpcode(ScriptOpcodes.OC_STACKABLE)).toBe(1);
    expect(Interpreter.Interpreter_intStack[0]).toBe(1);

    pushInts(0);
    expect(handleObjectOpcode(ScriptOpcodes.OC_MEMBERS)).toBe(1);
    expect(Interpreter.Interpreter_intStack[0]).toBe(1);
  });

  it("matches certificate and placeholder transformations", () => {
    installObjects([
      object({ note: 10 }),
      object({ note: 10, noteTemplate: 20 }),
      object({ placeholder: 30 }),
      object({ placeholder: 30, placeholderTemplate: 40 }),
    ]);

    pushInts(0);
    expect(handleObjectOpcode(ScriptOpcodes.OC_CERT)).toBe(1);
    expect(Interpreter.Interpreter_intStack[0]).toBe(10);

    pushInts(1);
    expect(handleObjectOpcode(ScriptOpcodes.OC_UNCERT)).toBe(1);
    expect(Interpreter.Interpreter_intStack[0]).toBe(10);

    pushInts(2);
    expect(handleObjectOpcode(ScriptOpcodes.OC_PLACEHOLDER)).toBe(1);
    expect(Interpreter.Interpreter_intStack[0]).toBe(30);

    pushInts(3);
    expect(handleObjectOpcode(ScriptOpcodes.OC_UNPLACEHOLDER)).toBe(1);
    expect(Interpreter.Interpreter_intStack[0]).toBe(30);
  });

  it("implements client-style object search, iteration and reset", () => {
    installObjects([
      object({ name: "Rune sword", isTradable: true }),
      object({ name: "Rune platebody" }),
      object({ name: "Rune sword (noted)", noteTemplate: 100, isTradable: true }),
      object({ name: "Bronze sword", isTradable: true }),
    ]);

    pushStrings("rune");
    pushInts(0);
    expect(handleObjectOpcode(ScriptOpcodes.OC_FIND)).toBe(1);
    expect(Interpreter.Interpreter_intStack[0]).toBe(2);

    expect(handleObjectOpcode(ScriptOpcodes.OC_FINDNEXT)).toBe(1);
    expect(Interpreter.Interpreter_intStack[1]).toBe(1);
    expect(handleObjectOpcode(ScriptOpcodes.OC_FINDNEXT)).toBe(1);
    expect(Interpreter.Interpreter_intStack[2]).toBe(0);
    expect(handleObjectOpcode(ScriptOpcodes.OC_FINDNEXT)).toBe(1);
    expect(Interpreter.Interpreter_intStack[3]).toBe(-1);

    expect(handleObjectOpcode(ScriptOpcodes.OC_FINDRESET)).toBe(1);
    expect(handleObjectOpcode(ScriptOpcodes.OC_FINDNEXT)).toBe(1);
    expect(Interpreter.Interpreter_intStack[4]).toBe(1);

    Interpreter.Interpreter_intStackSize = 0;
    Interpreter.Interpreter_stringStackSize = 0;
    pushStrings("rune");
    pushInts(1);
    expect(handleObjectOpcode(ScriptOpcodes.OC_FIND)).toBe(1);
    expect(Interpreter.Interpreter_intStack[0]).toBe(1);
    expect(handleObjectOpcode(ScriptOpcodes.OC_FINDNEXT)).toBe(1);
    expect(Interpreter.Interpreter_intStack[1]).toBe(0);
  });

  it("reports the family unsupported when no object loader is available", () => {
    pushInts(0);
    expect(handleObjectOpcode(ScriptOpcodes.OC_MEMBERS)).toBe(2);
  });
});
