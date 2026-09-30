import { describe, expect, it, vi } from "vitest";

import { runEditTransaction, type EditorTransactionHost } from "./editor-transaction";

function transactionHost() {
    return {
        isHistoryApplying: () => false,
        beginEditTransaction: vi.fn((_source, _label?: string) => {}),
        commitEditTransaction: vi.fn(() => {}),
        cancelEditTransaction: vi.fn(() => {}),
    } satisfies EditorTransactionHost;
}

describe("runEditTransaction", () => {
    it("commits successful operations", () => {
        const host = transactionHost();

        const result = runEditTransaction(host, { source: "region-stamp", label: "Paste region" }, () => 42);

        expect(result).toBe(42);
        expect(host.beginEditTransaction).toHaveBeenCalledWith("region-stamp", "Paste region");
        expect(host.commitEditTransaction).toHaveBeenCalledOnce();
        expect(host.cancelEditTransaction).not.toHaveBeenCalled();
    });

    it("cancels operations that return false", () => {
        const host = transactionHost();

        expect(runEditTransaction(host, { source: "object-selector", label: "Rotate object" }, () => false)).toBe(false);
        expect(host.commitEditTransaction).not.toHaveBeenCalled();
        expect(host.cancelEditTransaction).toHaveBeenCalledOnce();
    });

    it("cancels and rethrows when a mutation throws", () => {
        const host = transactionHost();
        const failure = new Error("boom");

        expect(() =>
            runEditTransaction(host, { source: "bulk", label: "Bulk edit" }, () => {
                throw failure;
            }),
        ).toThrow(failure);
        expect(host.commitEditTransaction).not.toHaveBeenCalled();
        expect(host.cancelEditTransaction).toHaveBeenCalledOnce();
    });

    it("does not nest history transactions during replay", () => {
        const host = transactionHost();
        host.isHistoryApplying = () => true;

        const result = runEditTransaction(host, { source: "height", label: "Replay" }, () => "replayed");

        expect(result).toBe("replayed");
        expect(host.beginEditTransaction).not.toHaveBeenCalled();
        expect(host.commitEditTransaction).not.toHaveBeenCalled();
        expect(host.cancelEditTransaction).not.toHaveBeenCalled();
    });
});
