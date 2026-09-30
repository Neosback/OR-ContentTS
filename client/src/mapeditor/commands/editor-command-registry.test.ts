import { describe, expect, it, vi } from "vitest";

import type { IEditorPluginHost } from "../plugins/editor-plugin-host";
import {
    canExecuteEditorCommand,
    editorCommandKeyBinding,
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
        setEditorTool: vi.fn(),
        notifyWorkbenchStateChanged: vi.fn(),
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

    it("executes tool selection through the same command used by keybindings", () => {
        const setEditorTool = vi.fn();
        const host = hostStub({ setEditorTool });
        const binding = editorCommandKeyBinding("tool.select-region-stamp", {
            id: "select-tool",
            defaultChords: [{ code: "Digit6" }],
        });

        expect(binding.name).toBe("Select Region Stamp tool");
        expect(binding.action({ host, input: {} as never })).not.toBe(false);
        expect(setEditorTool).toHaveBeenCalledWith("region-stamp");
    });

    it("executes parameterized workbench layout commands", () => {
        const openPanel = vi.fn();
        const success = vi.fn();
        const host = hostStub();
        const layout = {
            openPanel,
            restoreAllPanels: vi.fn(),
            resetLayout: vi.fn(),
        };

        expect(
            executeEditorCommand(
                "workbench.open-panel",
                { host, layout, notify: { success } },
                { panelId: "editor-history", panelTitle: "History" },
            ),
        ).toBe(true);
        expect(openPanel).toHaveBeenCalledWith("editor-history");
        expect(success).toHaveBeenCalledWith("History opened");
    });

    it("does not execute parameterized panel commands without a panel id", () => {
        const openPanel = vi.fn();
        const host = hostStub();
        const layout = {
            openPanel,
            restoreAllPanels: vi.fn(),
            resetLayout: vi.fn(),
        };

        expect(executeEditorCommand("workbench.open-panel", { host, layout })).toBe(false);
        expect(openPanel).not.toHaveBeenCalled();
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
