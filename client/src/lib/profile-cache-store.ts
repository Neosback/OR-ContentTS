import {
  isCacheStoreFileName,
  validateCacheStoreFileNames,
} from "../cache/cache-store-files";

const DB_NAME = "openrune-cache-files-v1";
const DB_VERSION = 1;
const STORE = "profile-cache-files";

export type StoredProfileCache = {
  files: Record<string, ArrayBuffer>;
  savedAt: string;
};

function profileKey(profileId: string): string {
  return `profile:${profileId}`;
}

async function getStoredProfileCache(
  db: IDBDatabase,
  profileId: string,
): Promise<StoredProfileCache | undefined> {
  // Read namespaced key first; fallback supports older saves.
  const namespaced = await txGet<StoredProfileCache>(db, profileKey(profileId));
  if (namespaced) {
    return namespaced;
  }
  return txGet<StoredProfileCache>(db, profileId);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open cache DB"));
  });
}

function txGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error ?? new Error("IDB read failed"));
  });
}

function txPut(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IDB write failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IDB write aborted"));
  });
}

function txDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IDB delete failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IDB delete aborted"));
  });
}

function normalizeName(file: File): string {
  const rel = file.webkitRelativePath || file.name;
  const parts = rel.split(/[\\/]/g);
  return parts[parts.length - 1];
}

export async function saveProfileCacheFiles(profileId: string, files: FileList | File[]): Promise<void> {
  const fileArray = Array.from(files);
  const record: Record<string, ArrayBuffer> = {};
  for (const file of fileArray) {
    const key = normalizeName(file);
    if (!isCacheStoreFileName(key)) {
      continue;
    }
    record[key] = await file.arrayBuffer();
  }
  if (Object.keys(record).length === 0) {
    throw new Error(
      "No cache files found. Choose the folder that contains main_file_cache.dat2 and main_file_cache.idx* files.",
    );
  }
  validateCacheStoreFileNames(Object.keys(record));
  const db = await openDb();
  try {
    try {
      await txPut(db, profileKey(profileId), {
        files: record,
        savedAt: new Date().toISOString(),
      } satisfies StoredProfileCache);
      // Clean up legacy key if it exists.
      await txDelete(db, profileId);
    } catch (error) {
      if (error instanceof DOMException && error.name === "QuotaExceededError") {
        throw new Error(
          "Browser storage is full. Remove an imported cache or use a smaller cache before importing again.",
        );
      }
      throw error;
    }
  } finally {
    db.close();
  }
}

export async function readImportedProfileCache(
  profileId: string,
): Promise<StoredProfileCache | undefined> {
  const db = await openDb();
  try {
    return await getStoredProfileCache(db, profileId);
  } finally {
    db.close();
  }
}

export async function deleteProfileCache(profileId: string): Promise<void> {
  const db = await openDb();
  try {
    await txDelete(db, profileKey(profileId));
    // Remove legacy key too.
    await txDelete(db, profileId);
  } finally {
    db.close();
  }
}
