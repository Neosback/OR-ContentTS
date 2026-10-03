import { Interpreter } from "./Interpreter";
import { ScriptOpcodes } from "./ScriptOpcodes";
import {
  getCs2RuntimeContext,
  type Cs2SocialListKind,
  type Cs2SocialRuntime,
} from "./runtime-context";

type UserComparatorIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

function popReversedFlag(): boolean {
  return Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize] === 1;
}

function remove(runtime: Cs2SocialRuntime | null, list: Cs2SocialListKind): number {
  runtime?.removeComparator(list);
  return 1;
}

function addUser(
  runtime: Cs2SocialRuntime | null,
  list: Cs2SocialListKind,
  index: UserComparatorIndex,
): number {
  const reversed = popReversedFlag();
  runtime?.addComparator(list, { kind: "user", index }, reversed);
  return 1;
}

function addRank(runtime: Cs2SocialRuntime | null, list: Cs2SocialListKind): number {
  const reversed = popReversedFlag();
  runtime?.addComparator(list, { kind: "rank" }, reversed);
  return 1;
}

function sort(runtime: Cs2SocialRuntime | null, list: Cs2SocialListKind): number {
  runtime?.sort(list);
  return 1;
}

/**
 * Handles social-list comparator opcodes 3628-3657.
 *
 * These are client-state operations rather than cache or server data queries.
 * Studio preview can therefore execute their stack semantics without requiring
 * a live friend/ignore/friends-chat model. When a simulated social runtime is
 * installed, the same opcodes mutate it through the adapter.
 */
export function handleSocialComparatorOpcode(opcode: number): number {
  const { socialRuntime } = getCs2RuntimeContext();

  if (opcode === ScriptOpcodes.FRIENDLIST_REMOVE_COMPARATOR) {
    return remove(socialRuntime, "friends");
  }
  if (
    opcode >= ScriptOpcodes.FRIENDLIST_ADD_COMPARATOR1 &&
    opcode <= ScriptOpcodes.FRIENDLIST_ADD_COMPARATOR10
  ) {
    return addUser(
      socialRuntime,
      "friends",
      (opcode - ScriptOpcodes.FRIENDLIST_REMOVE_COMPARATOR) as UserComparatorIndex,
    );
  }
  if (opcode === ScriptOpcodes.FRIENDLIST_SORT) {
    return sort(socialRuntime, "friends");
  }

  if (opcode === ScriptOpcodes.IGNORELIST_REMOVE_COMPARATOR) {
    return remove(socialRuntime, "ignores");
  }
  if (
    opcode >= ScriptOpcodes.IGNORELIST_ADD_COMPARATOR1 &&
    opcode <= ScriptOpcodes.IGNORELIST_ADD_COMPARATOR2
  ) {
    return addUser(
      socialRuntime,
      "ignores",
      (opcode - ScriptOpcodes.IGNORELIST_REMOVE_COMPARATOR) as UserComparatorIndex,
    );
  }
  if (opcode === ScriptOpcodes.IGNORELIST_SORT) {
    return sort(socialRuntime, "ignores");
  }

  if (opcode === ScriptOpcodes.FRIENDSCHAT_REMOVE_COMPARATOR) {
    return remove(socialRuntime, "friendsChat");
  }
  if (
    opcode >= ScriptOpcodes.FRIENDSCHAT_ADD_COMPARATOR1 &&
    opcode <= ScriptOpcodes.FRIENDSCHAT_ADD_COMPARATOR10
  ) {
    return addUser(
      socialRuntime,
      "friendsChat",
      (opcode - ScriptOpcodes.FRIENDSCHAT_REMOVE_COMPARATOR) as UserComparatorIndex,
    );
  }
  if (opcode === ScriptOpcodes.FRIENDSCHAT_SORT) {
    return sort(socialRuntime, "friendsChat");
  }
  if (opcode === ScriptOpcodes.FRIENDLIST_ADD_RANK_COMPARATOR) {
    return addRank(socialRuntime, "friends");
  }
  if (opcode === ScriptOpcodes.FRIENDSCHAT_ADD_RANK_COMPARATOR) {
    return addRank(socialRuntime, "friendsChat");
  }

  return 2;
}
