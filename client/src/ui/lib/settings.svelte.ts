import { readJson, writeStorage } from "./persisted";

const STORAGE_SETTINGS = "app-shell-settings";

export const THEME_PRESETS = [
    { name: "Default", value: "default" },
    { name: "Blue", value: "blue" },
    { name: "Green", value: "green" },
    { name: "Amber", value: "amber" },
    { name: "Default Scaled", value: "default-scaled" },
    { name: "Blue Scaled", value: "blue-scaled" },
    { name: "Mono", value: "mono-scaled" },
] as const;

export type ThemePreset = (typeof THEME_PRESETS)[number]["value"];
export type ThemeMode = "dark" | "light";

export interface AppSettings {
    themePreset: ThemePreset;
    fullWidthContent: boolean;
    themeMode: ThemeMode;
}

const defaults: AppSettings = { themePreset: "default", fullWidthContent: true, themeMode: "dark" };

function coerce(raw: unknown): AppSettings {
    if (!raw || typeof raw !== "object") return { ...defaults };
    const value = raw as Partial<AppSettings>;
    return {
        themePreset: THEME_PRESETS.some((t) => t.value === value.themePreset)
            ? (value.themePreset as ThemePreset)
            : defaults.themePreset,
        fullWidthContent: typeof value.fullWidthContent === "boolean" ? value.fullWidthContent : defaults.fullWidthContent,
        // The React shell forced dark on load, which made the light toggle a no-op. Honor the saved mode.
        themeMode: value.themeMode === "light" ? "light" : "dark",
    };
}

class Settings {
    value = $state<AppSettings>(coerce(readJson(STORAGE_SETTINGS)));

    update(next: Partial<AppSettings>): void {
        this.value = { ...this.value, ...next };
        writeStorage(STORAGE_SETTINGS, JSON.stringify(this.value));
    }

    /** Mirrors the settings onto <html>/<body> classes (the theme CSS keys off them). */
    apply(): void {
        const root = document.documentElement;
        root.classList.remove("light", "dark");
        root.classList.add(this.value.themeMode);

        const body = document.body;
        for (const name of Array.from(body.classList)) {
            if (name.startsWith("theme-")) body.classList.remove(name);
        }
        body.classList.add(`theme-${this.value.themePreset}`);
        body.classList.toggle("theme-scaled", this.value.themePreset.endsWith("-scaled"));
        body.classList.toggle("full-width-content", this.value.fullWidthContent);
    }
}

export const settings = new Settings();
