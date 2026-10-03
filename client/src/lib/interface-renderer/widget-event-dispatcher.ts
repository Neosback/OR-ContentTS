import type { ComponentScriptArg, ComponentType, InterfaceEntry } from "./component-types";
import {
  consumeMockClientChanges,
  type MockClientChangeSnapshot,
  type MockClientState,
} from "./mock-client-state";
import { ScriptEvent } from "./cs2/script-event";
import { runScript } from "./cs2/run-script";

export type WidgetPointerEventKind =
  | "mouseOver"
  | "mouseLeave"
  | "click"
  | "hold"
  | "release"
  | "mouseRepeat"
  | "clickRepeat"
  | "scrollWheel";

export type WidgetEventCoordinates = {
  mouseX?: number;
  mouseY?: number;
  field1063?: number;
};

type RuntimeTransmitWidget = ComponentType & {
  onFriendTransmit?: ComponentScriptArg[] | null;
  onClanTransmit?: ComponentScriptArg[] | null;
};

function componentRuntimeId(component: ComponentType): number {
  return typeof component.packedId === "number" ? component.packedId : component.id;
}

function collectComponents(entry: InterfaceEntry): ComponentType[] {
  const out: ComponentType[] = [];
  const seen = new Set<ComponentType>();

  const visit = (component: ComponentType): void => {
    if (seen.has(component)) return;
    seen.add(component);
    out.push(component);
    for (const child of component.children ?? []) {
      if (child) visit(child);
    }
  };

  for (const component of Object.values(entry.components)) visit(component);
  return out;
}

function collectVisibleComponents(entry: InterfaceEntry): ComponentType[] {
  const all = collectComponents(entry);
  const byRuntimeId = new Map(all.map((component) => [componentRuntimeId(component), component]));

  const isEffectivelyHidden = (component: ComponentType): boolean => {
    const visited = new Set<ComponentType>();
    let current: ComponentType | undefined = component;
    while (current && !visited.has(current)) {
      visited.add(current);
      if (current.hide) return true;
      current = byRuntimeId.get(current.layer);
    }
    return false;
  };

  return all.filter((component) => !isEffectivelyHidden(component));
}

export function normalizeWidgetScriptArgs(raw: unknown): unknown[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const first = raw[0];
  const scriptId = typeof first === "number" ? first : Number(first);
  if (!Number.isFinite(scriptId)) return null;

  const out: unknown[] = [Math.trunc(scriptId)];
  for (let i = 1; i < raw.length; i++) out.push(raw[i]);
  return out;
}

export function transmitTriggersMatch(
  triggers: readonly number[] | null | undefined,
  changedIds: readonly number[],
  changeEventCount = changedIds.length,
): boolean {
  if (changeEventCount <= 0) return false;
  // The client only keeps a 32-entry circular change buffer. Once more than 32
  // writes occurred since a widget last processed transmits, trigger filtering
  // cannot be trusted and the listener fires unconditionally.
  if (changeEventCount > 32 || triggers == null || triggers.length === 0) return true;

  const changed = new Set(changedIds);
  return triggers.some((id) => changed.has(id));
}

function pointerArgs(component: ComponentType, kind: WidgetPointerEventKind): ComponentScriptArg[] | null | undefined {
  switch (kind) {
    case "mouseOver":
      return component.onMouseOver;
    case "mouseLeave":
      return component.onMouseLeave;
    case "click":
      return component.onClick;
    case "hold":
      return component.onHold;
    case "release":
      return component.onRelease;
    case "mouseRepeat":
      return component.onMouseRepeat;
    case "clickRepeat":
      return component.onClickRepeat;
    case "scrollWheel":
      return component.onScrollWheel;
  }
}

/**
 * Serial clientscript event executor for one Interface preview.
 *
 * The CS2 VM uses shared interpreter stacks/frames, so event listeners must never
 * execute concurrently. Every event is queued in client order.
 */
export class WidgetEventDispatcher {
  private tail: Promise<void> = Promise.resolve();
  private active = true;

  private enqueue(
    component: ComponentType,
    rawArgs: unknown,
    coordinates: WidgetEventCoordinates = {},
  ): Promise<void> {
    const args = normalizeWidgetScriptArgs(rawArgs);
    if (!args) return this.tail;

    const execute = async (): Promise<void> => {
      if (!this.active) return;
      const event = new ScriptEvent();
      event.widget = component;
      event.args = args;
      event.mouseX = Math.trunc(coordinates.mouseX ?? 0);
      event.mouseY = Math.trunc(coordinates.mouseY ?? 0);
      event.field1063 = Math.trunc(coordinates.field1063 ?? 0);
      await runScript(event, 5_000_000, 0);
    };

    const next = this.tail.then(execute, execute);
    this.tail = next.catch((error) => {
      console.warn("[WidgetEventDispatcher] listener failed", error);
    });
    return next;
  }

  dispatchPointer(
    component: ComponentType | null | undefined,
    kind: WidgetPointerEventKind,
    coordinates: WidgetEventCoordinates = {},
  ): Promise<void> {
    if (!component) return this.tail;
    return this.enqueue(component, pointerArgs(component, kind), coordinates);
  }

  dispatchOnLoad(entry: InterfaceEntry, interfaceId: number): Promise<void> {
    const groupId = interfaceId & 0xffff;
    const components = collectComponents(entry).sort((a, b) => a.id - b.id);
    for (const component of components) {
      if (
        typeof component.packedId === "number"
        && ((component.packedId >>> 16) & 0xffff) !== groupId
      ) {
        continue;
      }
      if (component.onLoad) void this.enqueue(component, component.onLoad);
    }
    return this.tail;
  }

  dispatchInitialVarTransmit(entry: InterfaceEntry): Promise<void> {
    for (const component of collectVisibleComponents(entry)) {
      if (
        component.onVarTransmit
        && component.onVarTransmitList != null
        && component.onVarTransmitList.length > 0
      ) {
        void this.enqueue(component, component.onVarTransmit);
      }
    }
    return this.tail;
  }

  dispatchTimer(entry: InterfaceEntry): Promise<void> {
    for (const component of collectComponents(entry)) {
      if (component.hide) continue;
      if (component.onTimer) void this.enqueue(component, component.onTimer);
    }
    return this.tail;
  }

  dispatchTransmits(entry: InterfaceEntry, state: MockClientState): Promise<MockClientChangeSnapshot> {
    const changes = consumeMockClientChanges(state);

    for (const component of collectComponents(entry)) {
      if (component.hide) continue;

      if (
        component.onVarTransmit
        && transmitTriggersMatch(component.onVarTransmitList, changes.varps, changes.varpEventCount)
      ) {
        void this.enqueue(component, component.onVarTransmit);
      }

      if (
        component.onInvTransmit
        && transmitTriggersMatch(
          component.onInvTransmitList,
          changes.inventories,
          changes.inventoryEventCount,
        )
      ) {
        void this.enqueue(component, component.onInvTransmit);
      }

      if (
        component.onStatTransmit
        && transmitTriggersMatch(component.onStatTransmitList, changes.skills, changes.skillEventCount)
      ) {
        void this.enqueue(component, component.onStatTransmit);
      }

      if (changes.social) {
        const runtime = component as RuntimeTransmitWidget;
        if (runtime.onFriendTransmit) void this.enqueue(component, runtime.onFriendTransmit);
        if (runtime.onClanTransmit) void this.enqueue(component, runtime.onClanTransmit);
      }
    }

    return this.tail.then(() => changes);
  }

  flush(): Promise<void> {
    return this.tail;
  }

  dispose(): void {
    this.active = false;
  }
}
