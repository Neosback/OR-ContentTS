import { Interpreter } from "./Interpreter";
import { ScriptOpcodes } from "./ScriptOpcodes";
import {
  getCs2RuntimeContext,
  type Cs2SocialListKind,
  type Cs2SocialRuntime,
} from "./runtime-context";

type UserComparatorIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

function pushInt(value: number): void {
  Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = value | 0;
}

function pushString(value: string): void {
  Interpreter.Interpreter_stringStack[++Interpreter.Interpreter_stringStackSize - 1] = value;
}

function popInt(): number {
  return Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize] ?? 0;
}

function popString(): string {
  const value = Interpreter.Interpreter_stringStack[--Interpreter.Interpreter_stringStackSize];
  return value == null ? "" : String(value);
}

function sameName(a: string | undefined, b: string | undefined): boolean {
  return (a ?? "").toLowerCase() === (b ?? "").toLowerCase();
}

function handleSocialStateOpcode(opcode: number, runtime: Cs2SocialRuntime | null): number {
  const state = runtime?.state;
  const friends = state?.friends ?? [];
  const ignores = state?.ignores ?? [];
  const chat = state?.friendsChat ?? null;
  const members = chat?.members ?? [];

  if (opcode === ScriptOpcodes.FRIEND_COUNT) {
    pushInt(friends.length);
    return 1;
  }
  if (opcode === ScriptOpcodes.FRIEND_GETNAME) {
    const friend = friends[popInt()];
    pushString(friend?.name ?? "");
    pushString(friend?.previousName ?? friend?.name ?? "");
    return 1;
  }
  if (opcode === ScriptOpcodes.FRIEND_GETWORLD) {
    const friend = friends[popInt()];
    pushInt(friend?.isOnline === false ? 0 : (friend?.world ?? 0));
    return 1;
  }
  if (opcode === ScriptOpcodes.FRIEND_GETRANK) {
    pushInt(friends[popInt()]?.rank ?? 0);
    return 1;
  }
  if (opcode === ScriptOpcodes.FRIEND_SETRANK) {
    popInt();
    popString();
    return 1;
  }
  if (opcode === ScriptOpcodes.FRIEND_ADD || opcode === ScriptOpcodes.FRIEND_DEL) {
    popString();
    return 1;
  }
  if (opcode === ScriptOpcodes.IGNORE_ADD || opcode === ScriptOpcodes.IGNORE_DEL) {
    popString();
    return 1;
  }
  if (opcode === ScriptOpcodes.FRIEND_TEST) {
    const name = popString();
    pushInt(friends.some((friend) => sameName(friend.name, name)) ? 1 : 0);
    return 1;
  }

  if (opcode === ScriptOpcodes.CLAN_GETCHATDISPLAYNAME) {
    pushString(chat?.displayName ?? "");
    return 1;
  }
  if (opcode === ScriptOpcodes.CLAN_GETCHATCOUNT) {
    pushInt(members.length);
    return 1;
  }
  if (opcode === ScriptOpcodes.CLAN_GETCHATUSERNAME) {
    pushString(members[popInt()]?.name ?? "");
    return 1;
  }
  if (opcode === ScriptOpcodes.CLAN_GETCHATUSERWORLD) {
    pushInt(members[popInt()]?.world ?? 0);
    return 1;
  }
  if (opcode === ScriptOpcodes.CLAN_GETCHATUSERRANK) {
    pushInt(members[popInt()]?.rank ?? 0);
    return 1;
  }
  if (opcode === ScriptOpcodes.CLAN_GETCHATMINKICK) {
    pushInt(chat?.minKick ?? 0);
    return 1;
  }
  if (opcode === ScriptOpcodes.CLAN_KICKUSER) {
    popString();
    return 1;
  }
  if (opcode === ScriptOpcodes.CLAN_GETCHATRANK) {
    pushInt(chat?.rank ?? 0);
    return 1;
  }
  if (opcode === ScriptOpcodes.CLAN_JOINCHAT) {
    popString();
    return 1;
  }
  if (opcode === ScriptOpcodes.CLAN_LEAVECHAT) {
    return 1;
  }

  if (opcode === ScriptOpcodes.IGNORE_COUNT) {
    pushInt(ignores.length);
    return 1;
  }
  if (opcode === ScriptOpcodes.IGNORE_GETNAME) {
    const ignored = ignores[popInt()];
    pushString(ignored?.name ?? "");
    pushString(ignored?.previousName ?? ignored?.name ?? "");
    return 1;
  }
  if (opcode === ScriptOpcodes.IGNORE_TEST) {
    const name = popString();
    pushInt(ignores.some((ignored) => sameName(ignored.name, name)) ? 1 : 0);
    return 1;
  }

  if (opcode === ScriptOpcodes.CLAN_ISSELF) {
    const member = members[popInt()];
    pushInt(
      member?.isSelf === true
      || (member != null && sameName(member.name, state?.localPlayerName))
        ? 1
        : 0,
    );
    return 1;
  }
  if (opcode === ScriptOpcodes.CLAN_GETCHATOWNERNAME) {
    pushString(chat?.ownerName ?? "");
    return 1;
  }
  if (opcode === ScriptOpcodes.CLAN_ISFRIEND) {
    const member = members[popInt()];
    pushInt(
      member?.isFriend === true
      || (member != null && friends.some((friend) => sameName(friend.name, member.name)))
        ? 1
        : 0,
    );
    return 1;
  }
  if (opcode === ScriptOpcodes.CLAN_ISIGNORE) {
    const member = members[popInt()];
    pushInt(
      member?.isIgnored === true
      || (member != null && ignores.some((ignored) => sameName(ignored.name, member.name)))
        ? 1
        : 0,
    );
    return 1;
  }

  return 2;
}

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


/**
 * Handles the client-side social state family (3600-3627) plus the existing
 * comparator family (3628-3657). With no injected social state, Studio uses a
 * deterministic empty-client model instead of treating valid client opcodes as errors.
 */
export function handleSocialOpcode(opcode: number): number {
  const { socialRuntime } = getCs2RuntimeContext();
  const stateResult = handleSocialStateOpcode(opcode, socialRuntime);
  return stateResult === 2 ? handleSocialComparatorOpcode(opcode) : stateResult;
}
