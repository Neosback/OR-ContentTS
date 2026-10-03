import type { VarbitDefinitionLookup } from "@/rs/config/vartype/bit/VarBitTypeLoader";

import { Varps, Varps_masks } from "./varps";
import { Varcs } from "./cs2/varcs";

export type MockClientInventory = {
  itemIds: number[];
  itemQuantities: number[];
};

export type MockClientSocialUser = {
  name: string;
  previousName?: string;
  world?: number;
  rank?: number;
  isOnline?: boolean;
  isFriend?: boolean;
  isIgnored?: boolean;
  isSelf?: boolean;
};

export type MockClientFriendsChatState = {
  displayName: string;
  ownerName: string;
  minKick: number;
  rank: number;
  members: readonly MockClientSocialUser[];
};

export type MockClientSocialState = {
  friends: readonly MockClientSocialUser[];
  ignores: readonly MockClientSocialUser[];
  friendsChat: MockClientFriendsChatState | null;
  localPlayerName?: string;
};

export type MockClientChangeJournal = {
  varps: Set<number>;
  varbits: Set<number>;
  varcInts: Set<number>;
  varcStrings: Set<number>;
  inventories: Set<number>;
  skills: Set<number>;
  social: boolean;
};

export type MockClientState = {
  combatLevel: number;
  runEnergy: number;
  weight: number;
  currentLevels: number[];
  maximumLevels: number[];
  currentExp: number[];
  isMembersWorld: boolean;
  membersOnlyItemIds?: ReadonlySet<number> | null;
  simulatedInventories: Record<number, MockClientInventory>;
  varps: Varps;
  varcs: Varcs;
  social: MockClientSocialState;
  localTileX: number;
  localTileY: number;
  changes: MockClientChangeJournal;
};

export type MockClientChangeSnapshot = {
  varps: readonly number[];
  varbits: readonly number[];
  varcInts: readonly number[];
  varcStrings: readonly number[];
  inventories: readonly number[];
  skills: readonly number[];
  social: boolean;
};

export const MOCK_CLIENT_SKILL_COUNT = 25;
export const DEFAULT_MOCK_COMBAT_LEVEL = 3;
export const DEFAULT_MOCK_RUN_ENERGY = 89;
export const DEFAULT_MOCK_WEIGHT = 30;
export const DEFAULT_MOCK_TILE_X = 0;
export const DEFAULT_MOCK_TILE_Y = 0;

function emptyJournal(): MockClientChangeJournal {
  return {
    varps: new Set(),
    varbits: new Set(),
    varcInts: new Set(),
    varcStrings: new Set(),
    inventories: new Set(),
    skills: new Set(),
    social: false,
  };
}

export function createMockClientState(): MockClientState {
  return {
    combatLevel: DEFAULT_MOCK_COMBAT_LEVEL,
    runEnergy: DEFAULT_MOCK_RUN_ENERGY,
    weight: DEFAULT_MOCK_WEIGHT,
    currentLevels: Array.from({ length: MOCK_CLIENT_SKILL_COUNT }, () => 1),
    maximumLevels: Array.from({ length: MOCK_CLIENT_SKILL_COUNT }, () => 99),
    currentExp: Array.from({ length: MOCK_CLIENT_SKILL_COUNT }, () => 0),
    isMembersWorld: true,
    membersOnlyItemIds: null,
    simulatedInventories: {},
    varps: Varps.createDefault(),
    varcs: new Varcs(),
    social: {
      friends: [],
      ignores: [],
      friendsChat: null,
    },
    localTileX: DEFAULT_MOCK_TILE_X,
    localTileY: DEFAULT_MOCK_TILE_Y,
    changes: emptyJournal(),
  };
}

export function snapshotMockClientChanges(state: MockClientState): MockClientChangeSnapshot {
  const sorted = (values: ReadonlySet<number>): number[] => [...values].sort((a, b) => a - b);
  return {
    varps: sorted(state.changes.varps),
    varbits: sorted(state.changes.varbits),
    varcInts: sorted(state.changes.varcInts),
    varcStrings: sorted(state.changes.varcStrings),
    inventories: sorted(state.changes.inventories),
    skills: sorted(state.changes.skills),
    social: state.changes.social,
  };
}

export function clearMockClientChanges(state: MockClientState): void {
  state.changes.varps.clear();
  state.changes.varbits.clear();
  state.changes.varcInts.clear();
  state.changes.varcStrings.clear();
  state.changes.inventories.clear();
  state.changes.skills.clear();
  state.changes.social = false;
}

export function consumeMockClientChanges(state: MockClientState): MockClientChangeSnapshot {
  const snapshot = snapshotMockClientChanges(state);
  clearMockClientChanges(state);
  return snapshot;
}

export function setMockClientVarp(state: MockClientState, id: number, value: number): void {
  const previous = state.varps.getVarp(id);
  state.varps.setVarp(id, value);
  if (state.varps.getVarp(id) !== previous) state.changes.varps.add(id);
}

export function setMockClientVarbit(
  state: MockClientState,
  id: number,
  value: number,
  lookup: VarbitDefinitionLookup | null | undefined,
): void {
  if (!lookup) return;
  const def = lookup(id);
  if (!def) return;

  const span = def.endBit - def.startBit;
  if (span < 0 || span >= Varps_masks.length) return;

  const mask = Varps_masks[span]! >>> 0;
  let nextValue = Math.trunc(value);
  if (nextValue < 0 || nextValue > mask) nextValue = 0;

  const baseVar = def.baseVar;
  const before = state.varps.getVarp(baseVar);
  const shiftedMask = mask << def.startBit;
  const after = (before & ~shiftedMask) | ((nextValue << def.startBit) & shiftedMask);
  state.varps.setVarp(baseVar, after);

  if (state.varps.getVarp(baseVar) !== before) {
    state.changes.varps.add(baseVar);
    state.changes.varbits.add(id);
  }
}

export function setMockClientVarcInt(state: MockClientState, id: number, value: number): void {
  const before = state.varcs.getInt(id);
  state.varcs.setInt(id, value);
  if (state.varcs.getInt(id) !== before) state.changes.varcInts.add(id);
}

export function setMockClientVarcString(state: MockClientState, id: number, value: string): void {
  const before = state.varcs.getString(id);
  state.varcs.setString(id, value);
  if (state.varcs.getString(id) !== before) state.changes.varcStrings.add(id);
}

export function setMockClientInventory(
  state: MockClientState,
  containerId: number,
  inventory: MockClientInventory,
): void {
  state.simulatedInventories[containerId] = {
    itemIds: [...inventory.itemIds],
    itemQuantities: [...inventory.itemQuantities],
  };
  state.changes.inventories.add(containerId);
}

export function setMockClientSkill(
  state: MockClientState,
  skillId: number,
  values: { currentLevel?: number; maximumLevel?: number; experience?: number },
): void {
  if (!Number.isInteger(skillId) || skillId < 0 || skillId >= MOCK_CLIENT_SKILL_COUNT) return;
  if (values.currentLevel !== undefined) state.currentLevels[skillId] = Math.trunc(values.currentLevel);
  if (values.maximumLevel !== undefined) state.maximumLevels[skillId] = Math.trunc(values.maximumLevel);
  if (values.experience !== undefined) state.currentExp[skillId] = Math.trunc(values.experience);
  state.changes.skills.add(skillId);
}

export function setMockClientSocialState(state: MockClientState, social: MockClientSocialState): void {
  state.social = {
    friends: [...social.friends],
    ignores: [...social.ignores],
    friendsChat: social.friendsChat
      ? { ...social.friendsChat, members: [...social.friendsChat.members] }
      : null,
    localPlayerName: social.localPlayerName,
  };
  state.changes.social = true;
}

/**
 * Preserve the shared runtime stores/change journal while accepting immutable UI updates
 * to the legacy CS1-shaped state object. This lets existing simulator panels migrate
 * incrementally without creating a second source of client truth.
 */
export function mergeMockClientState(previous: MockClientState, next: MockClientState): MockClientState {
  const changes = previous.changes;

  if (previous.varps !== next.varps) {
    const limit = Math.max(previous.varps.Varps_main.length, next.varps.Varps_main.length);
    for (let id = 0; id < limit; id++) {
      if ((previous.varps.Varps_main[id] ?? 0) !== (next.varps.Varps_main[id] ?? 0)) changes.varps.add(id);
    }
  }

  const skillLimit = Math.max(
    previous.currentLevels.length,
    next.currentLevels.length,
    previous.maximumLevels.length,
    next.maximumLevels.length,
    previous.currentExp.length,
    next.currentExp.length,
  );
  for (let id = 0; id < skillLimit; id++) {
    if (
      (previous.currentLevels[id] ?? 0) !== (next.currentLevels[id] ?? 0)
      || (previous.maximumLevels[id] ?? 0) !== (next.maximumLevels[id] ?? 0)
      || (previous.currentExp[id] ?? 0) !== (next.currentExp[id] ?? 0)
    ) {
      changes.skills.add(id);
    }
  }

  const inventoryIds = new Set([
    ...Object.keys(previous.simulatedInventories).map(Number),
    ...Object.keys(next.simulatedInventories).map(Number),
  ]);
  for (const id of inventoryIds) {
    if (previous.simulatedInventories[id] !== next.simulatedInventories[id]) {
      changes.inventories.add(id);
    }
  }

  if (previous.social !== next.social) changes.social = true;

  return {
    ...next,
    varcs: next.varcs ?? previous.varcs,
    social: next.social ?? previous.social,
    changes,
  };
}
