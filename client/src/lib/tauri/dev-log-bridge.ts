import { isTauriRuntime } from "./is-tauri";

/**
 * Dev builds of the desktop app: forwards `console.error`/`console.warn` and uncaught errors to the terminal running
 * `tauri dev` (see src-tauri/src/devlog.rs), because the web view's console is not visible there. No-op in the browser
 * and in release builds.
 */
let installed = false;

function describe(value: unknown): string {
    if (value instanceof Error) return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ""}`;
    if (typeof value === "string") return value;
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

export function installDevLogBridge(): void {
    if (installed || !import.meta.env.DEV || !isTauriRuntime()) return;
    installed = true;

    let sending = false;
    const send = (level: "error" | "warn", parts: unknown[]): void => {
        if (sending) return;
        sending = true;
        void import("@tauri-apps/api/core")
            .then(({ invoke }) => invoke("dev_log", { level, message: parts.map(describe).join(" ") }))
            .catch(() => undefined)
            .finally(() => {
                sending = false;
            });
    };

    for (const level of ["error", "warn"] as const) {
        const original = console[level].bind(console);
        console[level] = (...args: unknown[]) => {
            original(...args);
            send(level, args);
        };
    }
    window.addEventListener("error", (event) => send("error", [`Uncaught ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`, event.error]));
    window.addEventListener("unhandledrejection", (event) => send("error", ["Unhandled rejection:", event.reason]));
    console.info("Dev log bridge on: web view errors are printed in the terminal running tauri dev.");
}
