import { describe, expect, it, vi } from "vitest";

import type { IEditorPluginHost } from "../plugins/editor-plugin-host";
import {
    canExecuteEditorCommand,
    executeEditorCommand,
    getEditorCommand,
    getRegisteredEditorCommands,
} from "./editor-command-registry";

function hostStub(overrides: Partial<IEditorPluginHost> = {}): IEditorPluginHost {
    return {
        adjustBrushSize: vi.fn(),
        toggleObjectsVisible: vi.fn(),
        toggleTerrainSmoothingEnabled: vi.fn(),
        undoHistory: vi.fn(),
        redoHistory: vi.fn(),
        getHistorySnapshot: () => ({
            entries: [],
            currentIndex: -1,
            canUndo: false,
            canRedo: false,
            editedMapIds: [],
        }),
        ...overrides,
    } as unknown as IEditorPluginHost;
}

describe("editor command registry", () => {
    it("registers unique command ids", () => {
        const commands = getRegisteredEditorCommands();
        expect(new Set(commands.map((command) => command.id)).size).toBe(commands.length);
        expect(getEditorCommand("workbench.undo").name).toBe("Undo");
    });

    it("executes shared workbench actions", () => {
        const toggleObjectsVisible = vi.fn();
        const host = hostStub({ toggleObjectsVisible });

        expect(executeEditorCommand("workbench.toggle-objects-visible", { host })).toBe(true);
        expect(toggleObjectsVisible).toHaveBeenCalledOnce();
    });

    it("does not execute disabled history commands", () => {
        const undoHistory = vi.fn();
        const host = hostStub({ undoHistory });

        expect(canExecuteEditorCommand("workbench.undo", { host })).toBe(false);
        expect(executeEditorCommand("workbench.undo", { host })).toBe(false);
        expect(undoHistory).not.toHaveBeenCalled();
    });

    it("executes enabled history commands", () => {
        const redoHistory = vi.fn();
        const host = hostStub({
            redoHistory,
            getHistorySnapshot: () => ({
                entries: [],
                currentIndex: 0,
                canUndo: true,
                canRedo: true,
                editedMapIds: [],
            }),
        });

        expect(canExecuteEditorCommand("workbench.redo", { host })).toBe(true);
        expect(executeEditorCommand("workbench.redo", { host })).toBe(true);
        expect(redoHistory).toHaveBeenCalledOnce();
    });
});
