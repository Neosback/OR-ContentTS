import type { EnumTypeLoader } from "@/rs/config/enumtype/EnumTypeLoader";
import type { ObjTypeLoader } from "@/rs/config/objtype/ObjTypeLoader";
import type { VarbitDefinitionLookup } from "@/rs/config/vartype/bit/VarBitTypeLoader";
import type { Cs1SimState } from "../cs1-interpreter";
import { Varps } from "../varps";
import type { InterfaceEntry } from "../component-types";
import type { CacheIndex } from "@/rs/cache/CacheIndex";

export type Cs2SocialListKind = "friends" | "ignores" | "friendsChat";

export type Cs2SocialComparator =
  | { kind: "user"; index: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 }
  | { kind: "rank" };

export type Cs2SocialRuntime = {
  removeComparator(list: Cs2SocialListKind): void;
  addComparator(list: Cs2SocialListKind, comparator: Cs2SocialComparator, reversed: boolean): void;
  sort(list: Cs2SocialListKind): void;
};

export type Cs2RuntimeContext = {
  scriptRev: string | number;
  cacheHeaders: HeadersInit;
  /** DAT2 client script index (`IndexType.DAT2.clientScript` = 12): archive id = script id, file 0. */
  clientScriptIndex: CacheIndex | null;
  /** Object definitions from the exact cache being previewed; used by OC_* clientscript opcodes. */
  objTypeLoader: ObjTypeLoader | null;
  /** Enum definitions from the exact cache being previewed; used by ENUM_* clientscript opcodes. */
  enumTypeLoader: EnumTypeLoader | null;
  /** Optional live/simulated social-list state for stateful 3628-3657 opcodes. */
  socialRuntime: Cs2SocialRuntime | null;
  varps: Varps;
  varbitLookup: VarbitDefinitionLookup | null;
  interfaceEntry: InterfaceEntry | null;
  canvasWidth: number | null;
  canvasHeight: number | null;
};

const defaultVarps = Varps.createDefault();

let ctx: Cs2RuntimeContext = {
  scriptRev: "latest",
  cacheHeaders: {},
  clientScriptIndex: null,
  objTypeLoader: null,
  enumTypeLoader: null,
  socialRuntime: null,
  varps: defaultVarps,
  varbitLookup: null,
  interfaceEntry: null,
  canvasWidth: null,
  canvasHeight: null,
};

export function getCs2RuntimeContext(): Cs2RuntimeContext {
  return ctx;
}

export function applyCs2RuntimeFromSim(
  sim: Cs1SimState | null | undefined,
  scriptRev: string | number,
  cacheHeaders: HeadersInit,
  varbitLookup: VarbitDefinitionLookup | null | undefined,
  interfaceEntry: InterfaceEntry | null | undefined = null,
  canvasWidth: number | null | undefined = null,
  canvasHeight: number | null | undefined = null,
  clientScriptIndex: CacheIndex | null | undefined = null,
  objTypeLoader: ObjTypeLoader | null | undefined = null,
  enumTypeLoader: EnumTypeLoader | null | undefined = null,
  socialRuntime: Cs2SocialRuntime | null | undefined = null,
): void {
  ctx = {
    scriptRev,
    cacheHeaders,
    clientScriptIndex: clientScriptIndex ?? null,
    objTypeLoader: objTypeLoader ?? null,
    enumTypeLoader: enumTypeLoader ?? null,
    socialRuntime: socialRuntime ?? null,
    varps: sim?.varps ?? defaultVarps,
    varbitLookup: varbitLookup ?? null,
    interfaceEntry: interfaceEntry ?? null,
    canvasWidth: typeof canvasWidth === "number" ? canvasWidth : null,
    canvasHeight: typeof canvasHeight === "number" ? canvasHeight : null,
  };
}
