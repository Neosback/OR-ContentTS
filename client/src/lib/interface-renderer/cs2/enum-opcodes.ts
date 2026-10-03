import type { EnumType } from "@/rs/config/enumtype/EnumType";

import { Interpreter } from "./Interpreter";
import { getCs2RuntimeContext } from "./runtime-context";
import { ScriptOpcodes } from "./ScriptOpcodes";

function pushInt(value: number): void {
  Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = value | 0;
}

function pushString(value: string): void {
  Interpreter.Interpreter_stringStack[++Interpreter.Interpreter_stringStackSize - 1] = value;
}

function findKeyIndex(def: EnumType, key: number): number {
  for (let i = 0; i < def.outputCount; i++) {
    if (def.keys[i] === key) return i;
  }
  return -1;
}

function typeCode(value: string): number {
  return value.length > 0 ? value.charCodeAt(0) : 0;
}

/**
 * Handles the cache-backed enum clientscript family.
 *
 * Enum definitions are read from the exact selected cache. There is no HTTP or
 * backend fallback here: if the active cache cannot provide enums, the family
 * remains unsupported and the normal CS2 diagnostic path reports it.
 */
export function handleEnumOpcode(opcode: number): number {
  const { enumTypeLoader } = getCs2RuntimeContext();
  if (!enumTypeLoader) return 2;

  if (opcode === ScriptOpcodes.ENUM_STRING) {
    Interpreter.Interpreter_intStackSize -= 2;
    const enumId = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!;
    const key = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!;
    const def = enumTypeLoader.load(enumId);
    const index = findKeyIndex(def, key);
    pushString(index >= 0 ? (def.stringValues[index] ?? def.defaultString) : def.defaultString);
    return 1;
  }

  if (opcode === ScriptOpcodes.ENUM) {
    Interpreter.Interpreter_intStackSize -= 4;
    const inputType = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!;
    const outputType = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!;
    const enumId = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 2]!;
    const key = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 3]!;
    const def = enumTypeLoader.load(enumId);
    const wantsString = outputType === "s".charCodeAt(0);

    if (inputType !== typeCode(def.inputType) || outputType !== typeCode(def.outputType)) {
      if (wantsString) pushString("null");
      else pushInt(0);
      return 1;
    }

    const index = findKeyIndex(def, key);
    if (wantsString) {
      pushString(index >= 0 ? (def.stringValues[index] ?? def.defaultString) : def.defaultString);
    } else {
      pushInt(index >= 0 ? (def.intValues[index] ?? def.defaultInt) : def.defaultInt);
    }
    return 1;
  }

  if (opcode === ScriptOpcodes.ENUM_GETOUTPUTCOUNT) {
    const enumId = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    pushInt(enumTypeLoader.load(enumId).outputCount);
    return 1;
  }

  return 2;
}
