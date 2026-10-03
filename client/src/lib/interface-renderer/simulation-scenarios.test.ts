import { describe, expect, it } from "vitest";

import { createMockClientState } from "./mock-client-state";
import {
  CONTAINER_BANK,
  CONTAINER_INVENTORY,
  SIMULATION_SCENARIOS,
  defaultScenarioFor,
  scenarioById,
  type ScenarioSources,
} from "./simulation-scenarios";

function sources(overrides: Partial<ScenarioSources> = {}): ScenarioSources {
  return { objTypeLoader: null, openRuneStock: null, varbitLookup: null, ...overrides };
}

const loaderWith = (known: ReadonlySet<number>) =>
  ({ load: (id: number) => ({ name: known.has(id) ? `item ${id}` : "null" }) }) as unknown as ScenarioSources["objTypeLoader"];

describe("simulation scenarios", () => {
  it("fills the bank, inventory and levels for the sample account", () => {
    const client = createMockClientState();
    scenarioById("bank-sample")!.apply(client, sources());

    const bank = client.itemContainers[CONTAINER_BANK]!;
    expect(bank.capacity).toBe(1410);
    expect(bank.itemIds[0]).toBe(995);
    expect(bank.itemQuantities[0]).toBe(1_250_000);
    expect(bank.itemIds.filter((id) => id >= 0).length).toBeGreaterThan(100);
    expect(client.itemContainers[CONTAINER_INVENTORY]!.itemIds.filter((id) => id >= 0).length).toBeGreaterThan(10);
    expect(client.maximumLevels[0]).toBeGreaterThan(1);
    // the change journal marks the containers so the interface's inv-transmit listeners fire
    expect(client.changes.inventories.has(CONTAINER_BANK)).toBe(true);
  });

  it("leaves out item ids the cache does not know", () => {
    const client = createMockClientState();
    scenarioById("bank-sample")!.apply(client, sources({ objTypeLoader: loaderWith(new Set([995, 1511])) }));
    expect(client.itemContainers[CONTAINER_BANK]!.itemIds.filter((id) => id >= 0)).toEqual([995, 1511]);
  });

  it("builds the OpenRune bank from shop stock, once per item, and is only offered with a project", () => {
    const scenario = scenarioById("bank-openrune")!;
    expect(scenario.available(sources())).toBe(false);

    const stock = [
      { itemId: 1265, quantity: 5 },
      { itemId: 1267, quantity: 3 },
      { itemId: 1265, quantity: 9 }, // sold by two shops
    ];
    expect(scenario.available(sources({ openRuneStock: stock }))).toBe(true);

    const client = createMockClientState();
    scenario.apply(client, sources({ openRuneStock: stock }));
    const bank = client.itemContainers[CONTAINER_BANK]!;
    expect(bank.itemIds.slice(0, 3)).toEqual([1265, 1267, -1]);
    expect(bank.itemQuantities.slice(0, 2)).toEqual([5, 3]);
  });

  it("picks a default scenario by interface name", () => {
    expect(defaultScenarioFor("bankmain", sources())?.id).toBe("bank-sample");
    expect(defaultScenarioFor("BankSide", sources())?.id).toBe("bank-sample");
    expect(defaultScenarioFor("deathkeep", sources())).toBeUndefined();
    expect(SIMULATION_SCENARIOS.map((s) => s.id)).toEqual(["bank-sample", "bank-openrune", "bank-empty"]);
  });
});
