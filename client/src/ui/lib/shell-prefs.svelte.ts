import { readStorage, writeStorage } from "./persisted";

const STORAGE_SIDEBAR = "app-shell-sidebar-collapsed";

class ShellPrefs {
    sidebarCollapsed = $state(readStorage(STORAGE_SIDEBAR) === "true");

    setSidebarCollapsed(value: boolean): void {
        this.sidebarCollapsed = value;
        writeStorage(STORAGE_SIDEBAR, String(value));
    }

    toggleSidebar(): void {
        this.setSidebarCollapsed(!this.sidebarCollapsed);
    }
}

export const shellPrefs = new ShellPrefs();
