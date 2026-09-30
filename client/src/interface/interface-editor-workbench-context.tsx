import * as React from "react";

import type { InterfaceEditorWorkbench } from "./interface-editor-workbench-model";

export type {
  InterfaceContextMenuEvent,
  InterfaceEditorWorkbench,
  InterfaceLegacyFilter,
  InterfaceListEntry,
  RsInterfaceMode,
  StateSetter,
  TreeNode,
  TreeRow,
} from "./interface-editor-workbench-model";

const InterfaceEditorWorkbenchContext = React.createContext<InterfaceEditorWorkbench | null>(null);

export function InterfaceEditorWorkbenchProvider({
  value,
  children,
}: {
  value: InterfaceEditorWorkbench;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <InterfaceEditorWorkbenchContext.Provider value={value}>
      {children}
    </InterfaceEditorWorkbenchContext.Provider>
  );
}

export function useInterfaceEditorWorkbench(): InterfaceEditorWorkbench {
  const ctx = React.useContext(InterfaceEditorWorkbenchContext);
  if (!ctx) {
    throw new Error("useInterfaceEditorWorkbench must be used within InterfaceEditorWorkbenchProvider");
  }
  return ctx;
}
