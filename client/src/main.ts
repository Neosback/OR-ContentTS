/**
 * Picks the UI implementation. During the Svelte migration both live in one Vite project and share
 * every URL: `?ui=svelte` (remembered) loads the Svelte app, `?ui=react` switches back. Removed at cut-over.
 */
const UI_STORAGE_KEY = "openrune.ui";

function resolveUi(): "svelte" | "react" {
    const requested = new URLSearchParams(window.location.search).get("ui");
    try {
        if (requested === "svelte" || requested === "react") {
            window.localStorage.setItem(UI_STORAGE_KEY, requested);
            return requested;
        }
        return window.localStorage.getItem(UI_STORAGE_KEY) === "svelte" ? "svelte" : "react";
    } catch {
        return requested === "svelte" ? "svelte" : "react";
    }
}

if (resolveUi() === "svelte") {
    void import("./ui/main");
} else {
    void import("./react-main");
}
