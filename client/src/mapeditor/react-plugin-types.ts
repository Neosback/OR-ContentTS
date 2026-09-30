import type { ComponentType } from "react";
import type { DockviewApi } from "dockview-core";

import type { IEditorPluginHost } from "./plugins/editor-plugin-host";

/** React-only plugin UI contracts. Removed at the Svelte cut-over. */
export interface EditorViewNavPlugin {
    id: string;
    name: string;
    order?: number;
    component: ComponentType<{ pluginHost: IEditorPluginHost }>;
}

export type EditorViewFloatingNavPlugin = EditorViewNavPlugin;
export type EditorViewStickyNavPlugin = EditorViewNavPlugin;

export interface EditorHeaderPlugin {
    id: string;
    name: string;
    order?: number;
    component: ComponentType<{ pluginHost: IEditorPluginHost; dockApi: DockviewApi | null }>;
}
