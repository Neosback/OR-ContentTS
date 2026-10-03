import type { ObjTypeLoader } from "@/rs/config/objtype/ObjTypeLoader";
import type { VarbitDefinitionLookup } from "@/rs/config/vartype/bit/VarBitTypeLoader";

import {
  setMockClientItemContainer,
  setMockClientSkill,
  setMockClientVarbit,
  type MockClientItemContainer,
  type MockClientState,
} from "./mock-client-state";

/** Client item-container ids the game uses for the player's own containers. */
export const CONTAINER_INVENTORY = 93;
export const CONTAINER_EQUIPMENT = 94;
export const CONTAINER_BANK = 95;
const BANK_CAPACITY = 1410;
const INVENTORY_CAPACITY = 28;

/** What a scenario can draw on: the cache's item definitions and, when a project is open, its server data. */
export type ScenarioSources = {
  objTypeLoader: ObjTypeLoader | null;
  /** Item ids (from the OpenRune project's server data) with a quantity each, in project order. */
  openRuneStock: ReadonlyArray<{ itemId: number; quantity: number }> | null;
  varbitLookup: VarbitDefinitionLookup | null;
};

export type SimulationScenario = {
  id: string;
  label: string;
  description: string;
  /** Interface names (lower case) this scenario is the natural default for. */
  forInterfaces: readonly string[];
  available(sources: ScenarioSources): boolean;
  apply(client: MockClientState, sources: ScenarioSources): void;
};

type ItemSpec = readonly [itemId: number, quantity: number];

/** A varied, recognisable bank: coins, logs, ores and bars, runes, food, potions, gear. Ids are stable across revisions. */
const SAMPLE_BANK: readonly ItemSpec[] = [
  [995, 1_250_000], [1511, 842], [1521, 410], [1519, 96], [1517, 215], [1515, 64], [1513, 33],
  [436, 120], [438, 120], [440, 305], [453, 1_480], [444, 92], [447, 160], [449, 48], [451, 12],
  [2349, 90], [2351, 210], [2353, 175], [2359, 80], [2361, 45], [2363, 7],
  [554, 25_000], [555, 25_000], [556, 25_000], [557, 25_000], [558, 12_000], [560, 4_200], [565, 3_100], [566, 900], [562, 8_800], [561, 2_050], [563, 1_950], [564, 700], [9075, 500],
  [361, 400], [373, 360], [385, 1_200], [391, 640], [7946, 880], [3144, 215], [379, 90],
  [3024, 25], [2434, 18], [12695, 12], [6685, 40], [3040, 14], [2436, 6],
  [1215, 1], [1305, 1], [1377, 1], [4151, 1], [4587, 1], [11840, 1], [11802, 1], [1127, 1], [1079, 1], [1163, 1], [1201, 1], [4131, 1],
  [1265, 1], [1267, 1], [1269, 1], [1271, 1], [1273, 1], [1275, 1], [590, 1], [2347, 1], [1351, 1], [1349, 1], [1353, 1], [1355, 1], [1357, 1], [1359, 1], [1361, 1],
  [1205, 1], [1203, 1], [1207, 1], [1209, 1], [1211, 1], [1213, 1], [1277, 1], [1279, 1], [1281, 1], [1283, 1], [1285, 1], [1287, 1], [1289, 1], [1291, 1], [1293, 1], [1295, 1],
  [314, 5_000], [313, 3_000], [221, 480], [225, 410], [231, 305], [239, 150], [245, 66], [247, 92], [2481, 280], [199, 140], [201, 126], [203, 98], [205, 77], [207, 60], [209, 41], [211, 32], [213, 24], [215, 19],
  [1739, 130], [1741, 188], [1743, 76], [1745, 52], [6287, 26], [6289, 14], [1777, 600], [1779, 220], [1759, 780], [1761, 390],
];

const SAMPLE_INVENTORY: readonly ItemSpec[] = [
  [4587, 1], [1215, 1], [995, 25_000], [379, 12], [379, 12], [3144, 6], [3024, 1], [3024, 1], [3024, 1], [2434, 1],
  [558, 400], [554, 600], [555, 600], [556, 600], [1351, 1], [590, 1], [2347, 1], [1265, 1], [1511, 27], [1521, 27],
];

/** Skill levels that look like a mid-game account instead of the all-1s default. */
const SAMPLE_LEVELS = [78, 80, 77, 82, 75, 71, 68, 60, 64, 70, 62, 58, 66, 54, 61, 73, 59, 52, 49, 44, 63, 40, 57, 50, 45];

function isRealItem(loader: ObjTypeLoader | null, itemId: number): boolean {
  if (!loader) return true;
  try {
    const type = loader.load(itemId);
    return !!type && !!type.name && type.name.toLowerCase() !== "null";
  } catch {
    return false;
  }
}

function container(specs: ReadonlyArray<{ itemId: number; quantity: number }>, capacity: number): MockClientItemContainer {
  const itemIds = Array.from({ length: capacity }, () => -1);
  const itemQuantities = Array.from({ length: capacity }, () => 0);
  specs.slice(0, capacity).forEach((spec, slot) => {
    itemIds[slot] = spec.itemId;
    itemQuantities[slot] = spec.quantity;
  });
  return { itemIds, itemQuantities, capacity };
}

function toSpecs(list: readonly ItemSpec[], loader: ObjTypeLoader | null): Array<{ itemId: number; quantity: number }> {
  return list.filter(([id]) => isRealItem(loader, id)).map(([itemId, quantity]) => ({ itemId, quantity }));
}

function applyPlayer(client: MockClientState): void {
  SAMPLE_LEVELS.forEach((level, skill) =>
    setMockClientSkill(client, skill, { currentLevel: level, maximumLevel: level, experience: level * level * 90 }),
  );
  client.combatLevel = 87;
  client.weight = 12;
}

/** Bank tab varbits: no tabs in use, the first ("all items") view selected. */
function applyBankState(client: MockClientState, lookup: VarbitDefinitionLookup | null): void {
  for (const id of [4171, 4172, 4173, 4174, 4175, 4176, 4177, 4178, 4179]) setMockClientVarbit(client, id, 0, lookup);
  setMockClientVarbit(client, 4150, 0, lookup); // current tab
}

function applyBank(client: MockClientState, bank: ReadonlyArray<{ itemId: number; quantity: number }>, sources: ScenarioSources): void {
  applyPlayer(client);
  applyBankState(client, sources.varbitLookup);
  setMockClientItemContainer(client, CONTAINER_BANK, container(bank, BANK_CAPACITY));
  setMockClientItemContainer(client, CONTAINER_INVENTORY, container(toSpecs(SAMPLE_INVENTORY, sources.objTypeLoader), INVENTORY_CAPACITY));
  setMockClientItemContainer(client, CONTAINER_EQUIPMENT, container([], 14));
}

export const SIMULATION_SCENARIOS: readonly SimulationScenario[] = [
  {
    id: "bank-sample",
    label: "Bank: sample account",
    description: "About 130 varied items in the bank, a stocked inventory and mid-game skill levels.",
    forInterfaces: ["bankmain", "bankside"],
    available: () => true,
    apply: (client, sources) => applyBank(client, toSpecs(SAMPLE_BANK, sources.objTypeLoader), sources),
  },
  {
    id: "bank-openrune",
    label: "Bank: OpenRune shop stock",
    description: "Fills the bank with every item the open OpenRune project's shops sell, with their stock counts.",
    forInterfaces: [],
    available: (sources) => (sources.openRuneStock?.length ?? 0) > 0,
    apply: (client, sources) => {
      const seen = new Set<number>();
      const bank = (sources.openRuneStock ?? []).filter(({ itemId }) => {
        if (seen.has(itemId) || !isRealItem(sources.objTypeLoader, itemId)) return false;
        seen.add(itemId);
        return true;
      });
      applyBank(client, bank, sources);
    },
  },
  {
    id: "bank-empty",
    label: "Bank: empty",
    description: "Nothing banked, the empty-bank state.",
    forInterfaces: [],
    available: () => true,
    apply: (client, sources) => applyBank(client, [], sources),
  },
];

export function scenarioById(id: string): SimulationScenario | undefined {
  return SIMULATION_SCENARIOS.find((scenario) => scenario.id === id);
}

/** The scenario that suits an interface by name, if one does (and its sources are there). */
export function defaultScenarioFor(interfaceName: string, sources: ScenarioSources): SimulationScenario | undefined {
  const name = interfaceName.toLowerCase();
  return SIMULATION_SCENARIOS.find((scenario) => scenario.forInterfaces.includes(name) && scenario.available(sources));
}
