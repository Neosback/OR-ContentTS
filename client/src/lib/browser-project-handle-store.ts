import type {
    BrowserDirectoryHandle,
    BrowserProjectFileSystem,
} from "../project/browser-project-filesystem";

export type BrowserProjectPermissionState = "granted" | "denied" | "prompt";

export type BrowserPermissionCapableDirectoryHandle = BrowserDirectoryHandle & {
    queryPermission?(descriptor?: { mode?: "read" | "readwrite" }): Promise<BrowserProjectPermissionState>;
    requestPermission?(descriptor?: { mode?: "read" | "readwrite" }): Promise<BrowserProjectPermissionState>;
};

const DB_NAME = "openrune-browser-project-handles-v1";
const DB_VERSION = 1;
const HANDLE_STORE = "handles";

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(HANDLE_STORE)) {
                db.createObjectStore(HANDLE_STORE);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
            reject(request.error ?? new Error("Failed to open browser project handle DB"));
    });
}

export async function saveBrowserProjectHandle(
    profileId: string,
    handle: BrowserDirectoryHandle,
): Promise<void> {
    const db = await openDb();
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(HANDLE_STORE, "readwrite");
            tx.objectStore(HANDLE_STORE).put(handle, profileId);
            tx.oncomplete = () => resolve();
            tx.onerror = () =>
                reject(tx.error ?? new Error("Failed to save browser project handle"));
            tx.onabort = () =>
                reject(tx.error ?? new Error("Saving browser project handle was aborted"));
        });
    } finally {
        db.close();
    }
}

export async function loadBrowserProjectHandle(
    profileId: string,
): Promise<BrowserDirectoryHandle | undefined> {
    const db = await openDb();
    try {
        return await new Promise<BrowserDirectoryHandle | undefined>((resolve, reject) => {
            const tx = db.transaction(HANDLE_STORE, "readonly");
            const request = tx.objectStore(HANDLE_STORE).get(profileId);
            request.onsuccess = () =>
                resolve(request.result as BrowserDirectoryHandle | undefined);
            request.onerror = () =>
                reject(request.error ?? new Error("Failed to load browser project handle"));
        });
    } finally {
        db.close();
    }
}

export async function deleteBrowserProjectHandle(profileId: string): Promise<void> {
    const db = await openDb();
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(HANDLE_STORE, "readwrite");
            tx.objectStore(HANDLE_STORE).delete(profileId);
            tx.oncomplete = () => resolve();
            tx.onerror = () =>
                reject(tx.error ?? new Error("Failed to delete browser project handle"));
            tx.onabort = () =>
                reject(tx.error ?? new Error("Deleting browser project handle was aborted"));
        });
    } finally {
        db.close();
    }
}

export async function queryBrowserProjectPermission(
    handle: BrowserDirectoryHandle,
): Promise<BrowserProjectPermissionState> {
    const capable = handle as BrowserPermissionCapableDirectoryHandle;
    if (!capable.queryPermission) {
        // A freshly selected handle from implementations without the permissions
        // methods can still be attempted directly by BrowserProjectFileSystem.
        return "granted";
    }
    return capable.queryPermission({ mode: "readwrite" });
}

export async function ensureBrowserProjectPermission(
    handle: BrowserDirectoryHandle,
    requestIfNeeded: boolean,
): Promise<BrowserProjectPermissionState> {
    const current = await queryBrowserProjectPermission(handle);
    if (current !== "prompt" || !requestIfNeeded) return current;

    const capable = handle as BrowserPermissionCapableDirectoryHandle;
    if (!capable.requestPermission) return current;
    return capable.requestPermission({ mode: "readwrite" });
}

export function browserProjectHandleFromFileSystem(
    fileSystem: BrowserProjectFileSystem,
): BrowserDirectoryHandle {
    return fileSystem.rootHandle;
}
