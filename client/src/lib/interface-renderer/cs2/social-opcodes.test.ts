import { beforeEach, describe, expect, it } from "vitest";

import { Interpreter } from "./Interpreter";
import { handleSocialComparatorOpcode } from "./social-opcodes";
import {
  applyCs2RuntimeFromSim,
  type Cs2SocialComparator,
  type Cs2SocialListKind,
  type Cs2SocialRuntime,
} from "./runtime-context";
import { ScriptOpcodes } from "./ScriptOpcodes";

type Event =
  | { type: "remove"; list: Cs2SocialListKind }
  | { type: "add"; list: Cs2SocialListKind; comparator: Cs2SocialComparator; reversed: boolean }
  | { type: "sort"; list: Cs2SocialListKind };

function installRuntime(events: Event[]): void {
  const runtime: Cs2SocialRuntime = {
    removeComparator(list) {
      events.push({ type: "remove", list });
    },
    addComparator(list, comparator, reversed) {
      events.push({ type: "add", list, comparator, reversed });
    },
    sort(list) {
      events.push({ type: "sort", list });
    },
  };
  applyCs2RuntimeFromSim(null, "test", {}, null, null, null, null, null, null, null, runtime);
}

function pushInt(value: number): void {
  Interpreter.Interpreter_intStackSize = 1;
  Interpreter.Interpreter_intStack[0] = value;
}

beforeEach(() => {
  Interpreter.Interpreter_intStackSize = 0;
  Interpreter.Interpreter_intStack.fill(0);
  applyCs2RuntimeFromSim(null, "test", {}, null);
});

describe("CS2 social comparator opcodes", () => {
  it("handles 3644 as a valid Friends Chat comparator reset with no stack effect", () => {
    const events: Event[] = [];
    installRuntime(events);
    Interpreter.Interpreter_intStackSize = 3;

    expect(handleSocialComparatorOpcode(ScriptOpcodes.FRIENDSCHAT_REMOVE_COMPARATOR)).toBe(1);
    expect(Interpreter.Interpreter_intStackSize).toBe(3);
    expect(events).toEqual([{ type: "remove", list: "friendsChat" }]);
  });

  it("consumes the reverse flag for numbered comparators", () => {
    const events: Event[] = [];
    installRuntime(events);

    pushInt(1);
    expect(handleSocialComparatorOpcode(ScriptOpcodes.FRIENDLIST_ADD_COMPARATOR10)).toBe(1);
    expect(Interpreter.Interpreter_intStackSize).toBe(0);

    pushInt(0);
    expect(handleSocialComparatorOpcode(ScriptOpcodes.IGNORELIST_ADD_COMPARATOR2)).toBe(1);

    pushInt(1);
    expect(handleSocialComparatorOpcode(ScriptOpcodes.FRIENDSCHAT_ADD_COMPARATOR1)).toBe(1);

    expect(events).toEqual([
      {
        type: "add",
        list: "friends",
        comparator: { kind: "user", index: 10 },
        reversed: true,
      },
      {
        type: "add",
        list: "ignores",
        comparator: { kind: "user", index: 2 },
        reversed: false,
      },
      {
        type: "add",
        list: "friendsChat",
        comparator: { kind: "user", index: 1 },
        reversed: true,
      },
    ]);
  });

  it("models friend and Friends Chat rank comparators", () => {
    const events: Event[] = [];
    installRuntime(events);

    pushInt(0);
    expect(handleSocialComparatorOpcode(ScriptOpcodes.FRIENDLIST_ADD_RANK_COMPARATOR)).toBe(1);
    pushInt(1);
    expect(handleSocialComparatorOpcode(ScriptOpcodes.FRIENDSCHAT_ADD_RANK_COMPARATOR)).toBe(1);

    expect(events).toEqual([
      {
        type: "add",
        list: "friends",
        comparator: { kind: "rank" },
        reversed: false,
      },
      {
        type: "add",
        list: "friendsChat",
        comparator: { kind: "rank" },
        reversed: true,
      },
    ]);
  });

  it("executes valid comparator operations even without live social state", () => {
    pushInt(1);
    expect(handleSocialComparatorOpcode(ScriptOpcodes.FRIENDSCHAT_ADD_COMPARATOR5)).toBe(1);
    expect(Interpreter.Interpreter_intStackSize).toBe(0);

    expect(handleSocialComparatorOpcode(ScriptOpcodes.FRIENDSCHAT_SORT)).toBe(1);
    expect(handleSocialComparatorOpcode(ScriptOpcodes.FRIENDSCHAT_REMOVE_COMPARATOR)).toBe(1);
  });

  it("leaves non-comparator social opcodes unsupported", () => {
    Interpreter.Interpreter_intStackSize = 2;
    expect(handleSocialComparatorOpcode(ScriptOpcodes.CLAN_ISIGNORE)).toBe(2);
    expect(Interpreter.Interpreter_intStackSize).toBe(2);
  });
});
