import { IS_PRODUCTION, PUBLIC_PATH } from "./config/env";

// The host caches JS for a year; change the URL when updating the shell worker.
const SERVICE_WORKER_URL = `${PUBLIC_PATH}/service-worker.js?v=4`;

export function registerServiceWorker(): void {
    if (!IS_PRODUCTION) return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    window.addEventListener("load", () => {
        navigator.serviceWorker
            .register(SERVICE_WORKER_URL)
            .then((registration) => registration.update())
            .catch((err) => {
                console.warn("[sw] registration failed", err);
            });
    });
}

export function unregisterServiceWorker(): void {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready.then((registration) => registration.unregister()).catch(() => {});
}
