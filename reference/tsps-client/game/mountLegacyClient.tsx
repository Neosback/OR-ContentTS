import { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";

const GamePage = lazy(() => import("./GamePage"));

/**
 * Mounts the React game client into `element`. Used for /play and by the
 * Studio map editor's scene panel. Returns the teardown.
 */
export function mountLegacyClient(element: HTMLElement): () => void {
    const root = createRoot(element);
    root.render(
        <Suspense fallback={<div className="page-loading">Loading…</div>}>
            <GamePage />
        </Suspense>,
    );
    return () => root.unmount();
}
