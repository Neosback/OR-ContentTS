import { ObjStackability } from "@/rs/config/objtype/ObjStackability";
import type { ObjType } from "@/rs/config/objtype/ObjType";
import type { ObjTypeLoader } from "@/rs/config/objtype/ObjTypeLoader";

import { Interpreter } from "./Interpreter";
import { ScriptOpcodes } from "./ScriptOpcodes";
import { getCs2RuntimeContext } from "./runtime-context";

type ObjectSearchState = {
  ids: number[] | null;
  count: number;
  index: number;
};

const searchState: ObjectSearchState = {
  ids: null,
  count: 0,
  index: 0,
};

function pushInt(value: number): void {
  Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = value | 0;
}

function pushString(value: string): void {
  Interpreter.Interpreter_stringStack[++Interpreter.Interpreter_stringStackSize - 1] = value;
}

function popInt(): number {
  return Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
}

function popString(): string {
  const value = Interpreter.Interpreter_stringStack[--Interpreter.Interpreter_stringStackSize];
  return value == null ? "" : String(value);
}

function objectById(loader: ObjTypeLoader, id: number): ObjType {
  return loader.load(id);
}

function findObjectDefinitions(loader: ObjTypeLoader, query: string, tradableOnly: boolean): number {
  const needle = query.toLowerCase();
  const matches: Array<{ id: number; name: string }> = [];

  for (let id = 0; id < loader.getCount(); id++) {
    const obj = loader.load(id);
    if (tradableOnly && !obj.isTradable) continue;
    if (obj.noteTemplate !== -1) continue;
    if (!obj.name.toLowerCase().includes(needle)) continue;

    if (matches.length >= 250) {
      searchState.ids = null;
      searchState.count = -1;
      searchState.index = 0;
      return -1;
    }

    matches.push({ id, name: obj.name });
  }

  matches.sort((a, b) => {
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return a.id - b.id;
  });

  searchState.ids = matches.map((match) => match.id);
  searchState.count = matches.length;
  searchState.index = 0;
  return matches.length;
}

/**
 * Handles the cache-backed object-definition CS2 family (4200-4212).
 *
 * The selected cache is authoritative here. OpenRune source metadata may enrich
 * labels elsewhere, but client scripts must observe the ObjType definitions in
 * the exact cache being previewed.
 */
export function handleObjectOpcode(opcode: number): number {
  const { objTypeLoader } = getCs2RuntimeContext();
  if (!objTypeLoader) return 2;

  if (opcode === ScriptOpcodes.OC_NAME) {
    pushString(objectById(objTypeLoader, popInt()).name);
    return 1;
  }

  if (opcode === ScriptOpcodes.OC_OP || opcode === ScriptOpcodes.OC_IOP) {
    Interpreter.Interpreter_intStackSize -= 2;
    const id = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!;
    const action = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!;
    const obj = objectById(objTypeLoader, id);
    const actions = opcode === ScriptOpcodes.OC_OP ? obj.groundActions : obj.inventoryActions;
    pushString(action >= 1 && action <= 5 ? (actions[action - 1] ?? "") : "");
    return 1;
  }

  if (opcode === ScriptOpcodes.OC_COST) {
    pushInt(objectById(objTypeLoader, popInt()).price);
    return 1;
  }

  if (opcode === ScriptOpcodes.OC_STACKABLE) {
    pushInt(objectById(objTypeLoader, popInt()).stackability === ObjStackability.ALWAYS ? 1 : 0);
    return 1;
  }

  if (opcode === ScriptOpcodes.OC_CERT) {
    const id = popInt();
    const obj = objectById(objTypeLoader, id);
    pushInt(obj.noteTemplate === -1 && obj.note >= 0 ? obj.note : id);
    return 1;
  }

  if (opcode === ScriptOpcodes.OC_UNCERT) {
    const id = popInt();
    const obj = objectById(objTypeLoader, id);
    pushInt(obj.noteTemplate >= 0 && obj.note >= 0 ? obj.note : id);
    return 1;
  }

  if (opcode === ScriptOpcodes.OC_MEMBERS) {
    pushInt(objectById(objTypeLoader, popInt()).isMembers ? 1 : 0);
    return 1;
  }

  if (opcode === ScriptOpcodes.OC_PLACEHOLDER) {
    const id = popInt();
    const obj = objectById(objTypeLoader, id);
    pushInt(obj.placeholderTemplate === -1 && obj.placeholder >= 0 ? obj.placeholder : id);
    return 1;
  }

  if (opcode === ScriptOpcodes.OC_UNPLACEHOLDER) {
    const id = popInt();
    const obj = objectById(objTypeLoader, id);
    pushInt(obj.placeholderTemplate >= 0 && obj.placeholder >= 0 ? obj.placeholder : id);
    return 1;
  }

  if (opcode === ScriptOpcodes.OC_FIND) {
    const query = popString();
    const tradableOnly = popInt() === 1;
    pushInt(findObjectDefinitions(objTypeLoader, query, tradableOnly));
    return 1;
  }

  if (opcode === ScriptOpcodes.OC_FINDNEXT) {
    if (searchState.ids && searchState.index < searchState.count) {
      pushInt(searchState.ids[searchState.index++]!);
    } else {
      pushInt(-1);
    }
    return 1;
  }

  if (opcode === ScriptOpcodes.OC_FINDRESET) {
    searchState.index = 0;
    return 1;
  }

  return 2;
}

/** Resets the client-style OC_FIND cursor. Useful when replacing the active cache and in tests. */
export function resetObjectSearchState(): void {
  searchState.ids = null;
  searchState.count = 0;
  searchState.index = 0;
}
