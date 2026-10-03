import { beforeEach, describe, expect, it } from "vitest";

import { Interpreter } from "./Interpreter";
import { handleSocialComparatorOpcode, handleSocialOpcode } from "./social-opcodes";
import {
  applyCs2RuntimeFromSim,
  type Cs2SocialComparator,
  type Cs2SocialListKind,
  type Cs2SocialRuntime,
  type Cs2SocialState,
} from "./runtime-context";
import { ScriptOpcodes } from "./ScriptOpcodes";

type Event =
  | { type: "remove"; list: Cs2SocialListKind }
  | { type: "add"; list: Cs2SocialListKind; comparator: Cs2SocialComparator; reversed: boolean }
  | { type: "sort"; list: Cs2SocialListKind };

function installRuntime(events: Event[], state?: Cs2SocialState): void {
  const runtime: Cs2SocialRuntime = {
    state,
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
  Interpreter.Interpreter_stringStackSize = 0;
  Interpreter.Interpreter_stringStack.fill(null);
  applyCs2RuntimeFromSim(null, "test", {}, null);
});

describe("CS2 social state opcodes", () => {
  it("treats Friends Chat count as valid empty mock client state", () => {
    expect(handleSocialOpcode(ScriptOpcodes.CLAN_GETCHATCOUNT)).toBe(1);
    expect(Interpreter.Interpreter_intStackSize).toBe(1);
    expect(Interpreter.Interpreter_intStack[0]).toBe(0);
  });

  it("reads Friends Chat and friend data from an injected mock client state", () => {
    const events: Event[] = [];
    installRuntime(events, {
      localPlayerName: "Local",
      friends: [
        { name: "Friend", previousName: "OldFriend", world: 302, rank: 5, isOnline: true },
      ],
      ignores: [{ name: "Ignored" }],
      friendsChat: {
        displayName: "Studio Chat",
        ownerName: "Owner",
        minKick: 2,
        rank: 4,
        members: [
          { name: "Local", world: 301, rank: 7, isSelf: true },
          { name: "Friend", world: 302, rank: 5, isFriend: true },
        ],
      },
    });

    expect(handleSocialOpcode(ScriptOpcodes.CLAN_GETCHATCOUNT)).toBe(1);
    expect(Interpreter.Interpreter_intStack[0]).toBe(2);

    Interpreter.Interpreter_intStackSize = 1;
    Interpreter.Interpreter_intStack[0] = 1;
    expect(handleSocialOpcode(ScriptOpcodes.CLAN_GETCHATUSERNAME)).toBe(1);
    expect(Interpreter.Interpreter_stringStack[0]).toBe("Friend");

    Interpreter.Interpreter_intStackSize = 1;
    Interpreter.Interpreter_intStack[0] = 0;
    Interpreter.Interpreter_stringStackSize = 0;
    expect(handleSocialOpcode(ScriptOpcodes.FRIEND_GETNAME)).toBe(1);
    expect(Interpreter.Interpreter_stringStack.slice(0, 2)).toEqual(["Friend", "OldFriend"]);
  });

  it("consumes query operands with client-compatible stack effects", () => {
    Interpreter.Interpreter_stringStackSize = 1;
    Interpreter.Interpreter_stringStack[0] = "Nobody";
    expect(handleSocialOpcode(ScriptOpcodes.FRIEND_TEST)).toBe(1);
    expect(Interpreter.Interpreter_stringStackSize).toBe(0);
    expect(Interpreter.Interpreter_intStackSize).toBe(1);
    expect(Interpreter.Interpreter_intStack[0]).toBe(0);
  });
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
