/**
 * Lets framework-free editor code ask the Studio workspace to show one of its
 * dock panels (for example the toolbar's search button opening Search).
 * Returns false when no workspace is listening, so callers can fall back to
 * their floating UI.
 */

type PanelOpener = (panelId: string) => boolean;

let opener: PanelOpener | undefined;

export function setStudioPanelOpener(next: PanelOpener | undefined): void {
    opener = next;
}

export function openStudioPanel(panelId: string): boolean {
    return opener?.(panelId) ?? false;
}
