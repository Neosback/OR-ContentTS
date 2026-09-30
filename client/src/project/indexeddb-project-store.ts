import { createEditBatchV1 } from "./edit-format-v1";
import {
    PROJECT_FORMAT_V1_NAME,
    PROJECT_FORMAT_V1_VERSION,
    decodeProjectV1,
    encodeProjectV1,
    validateProjectV1,
    type ProjectV1,
} from "./project-format-v1";
import { ProjectFormatV1Error, ProjectStoreError } from "./project-errors";
import { toProjectSummary, type CreateProjectInput, type Project, type ProjectStore, type ProjectSummary } from "./project-store";

export const DEFAULT_PROJECT_DB_NAME = "openrune-studio-projects-v1";
export const PROJECT_STORE_OBJECT_STORE = "projects";
const DB_VERSION = 1;

export type IndexedDbProjectStoreOptions = {
    dbName?: string;
    indexedDB?: IDBFactory;
    now?: () => number;
    idFactory?: () => string;
};

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
    });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
        transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    });
}

function hasErrorName(error: unknown, name: string): boolean {
    return typeof error === "object" && error !== null && "name" in error && (error as { name?: unknown }).name === name;
}

function defaultIdFactory(): string {
    if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
    return "project-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
}

function cloneProject(project: ProjectV1): ProjectV1 {
    return structuredClone(project);
}

export class IndexedDbProjectStore implements ProjectStore {
    private readonly dbName: string;
    private readonly indexedDBOverride?: IDBFactory;
    private readonly now: () => number;
    private readonly idFactory: () => string;

    constructor(options: IndexedDbProjectStoreOptions = {}) {
        this.dbName = options.dbName ?? DEFAULT_PROJECT_DB_NAME;
        this.indexedDBOverride = options.indexedDB;
        this.now = options.now ?? Date.now;
        this.idFactory = options.idFactory ?? defaultIdFactory;
    }

    private getFactory(): IDBFactory {
        const factory = this.indexedDBOverride ?? globalThis.indexedDB;
        if (!factory) {
            throw new ProjectStoreError(
                "STORAGE_UNAVAILABLE",
                "IndexedDB is unavailable in this environment.",
            );
        }
        return factory;
    }

    private async openDb(): Promise<IDBDatabase> {
        const factory = this.getFactory();
        return new Promise((resolve, reject) => {
            const request = factory.open(this.dbName, DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(PROJECT_STORE_OBJECT_STORE)) {
                    db.createObjectStore(PROJECT_STORE_OBJECT_STORE, { keyPath: "id" });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () =>
                reject(
                    new ProjectStoreError(
                        "STORAGE_FAILED",
                        "Failed to open local project storage.",
                        { cause: request.error },
                    ),
                );
            request.onblocked = () =>
                reject(
                    new ProjectStoreError(
                        "STORAGE_FAILED",
                        "Local project storage is blocked by another open Studio session.",
                    ),
                );
        });
    }

    private async readRaw(id: string): Promise<unknown | undefined> {
        const db = await this.openDb();
        try {
            const transaction = db.transaction(PROJECT_STORE_OBJECT_STORE, "readonly");
            const done = transactionDone(transaction);
            const value = await requestResult(transaction.objectStore(PROJECT_STORE_OBJECT_STORE).get(id));
            await done;
            return value;
        } catch (error) {
            if (error instanceof ProjectStoreError) throw error;
            throw new ProjectStoreError("STORAGE_FAILED", "Failed to read local project.", { cause: error });
        } finally {
            db.close();
        }
    }

    private async addNew(project: ProjectV1): Promise<void> {
        const db = await this.openDb();
        try {
            const transaction = db.transaction(PROJECT_STORE_OBJECT_STORE, "readwrite");
            const done = transactionDone(transaction);
            const request = transaction.objectStore(PROJECT_STORE_OBJECT_STORE).add(cloneProject(project));
            try {
                await requestResult(request);
                await done;
            } catch (error) {
                await done.catch(() => undefined);
                if (hasErrorName(error, "ConstraintError") || hasErrorName(request.error, "ConstraintError")) {
                    throw new ProjectStoreError(
                        "CONFLICT",
                        'A project with id "' + project.id + '" already exists.',
                        { cause: request.error ?? error },
                    );
                }
                throw error;
            }
        } catch (error) {
            if (error instanceof ProjectStoreError) throw error;
            if (hasErrorName(error, "ConstraintError")) {
                throw new ProjectStoreError(
                    "CONFLICT",
                    'A project with id "' + project.id + '" already exists.',
                    { cause: error },
                );
            }
            if (error instanceof ProjectStoreError) throw error;
            throw new ProjectStoreError("STORAGE_FAILED", "Failed to create local project.", { cause: error });
        } finally {
            db.close();
        }
    }

    async listProjects(): Promise<ProjectSummary[]> {
        const db = await this.openDb();
        try {
            const transaction = db.transaction(PROJECT_STORE_OBJECT_STORE, "readonly");
            const done = transactionDone(transaction);
            const values = await requestResult(transaction.objectStore(PROJECT_STORE_OBJECT_STORE).getAll());
            await done;

            const projects: ProjectSummary[] = [];
            for (const value of values) {
                const validation = validateProjectV1(value);
                if (validation.ok) projects.push(toProjectSummary(validation.value));
            }
            return projects.sort(
                (a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
            );
        } catch (error) {
            if (error instanceof ProjectStoreError) throw error;
            throw new ProjectStoreError("STORAGE_FAILED", "Failed to list local projects.", { cause: error });
        } finally {
            db.close();
        }
    }

    async createProject(input: CreateProjectInput): Promise<Project> {
        const name = input.name.trim();
        if (!name) {
            throw new ProjectStoreError("INVALID_PROJECT", "Project name must not be empty.");
        }

        const id = input.id?.trim() || this.idFactory();
        const timestamp = this.now();
        const project: ProjectV1 = {
            format: PROJECT_FORMAT_V1_NAME,
            version: PROJECT_FORMAT_V1_VERSION,
            id,
            name,
            createdAt: timestamp,
            updatedAt: timestamp,
            base: structuredClone(input.base),
            edits: input.edits
                ? structuredClone(input.edits)
                : createEditBatchV1([], { id: id + ":edits", createdAt: timestamp }),
        };

        const validation = validateProjectV1(project);
        if (!validation.ok) {
            throw new ProjectStoreError(
                "INVALID_PROJECT",
                "Cannot create an invalid project: " +
                    validation.issues.map((issue) => issue.path + " " + issue.message).join("; "),
                { cause: new ProjectFormatV1Error("Invalid project.", validation.issues) },
            );
        }

        await this.addNew(validation.value);
        return cloneProject(validation.value);
    }

    async loadProject(id: string): Promise<Project | undefined> {
        const value = await this.readRaw(id);
        if (value === undefined) return undefined;

        const validation = validateProjectV1(value);
        if (!validation.ok) {
            throw new ProjectStoreError(
                "INVALID_PROJECT",
                'Stored project "' + id + '" is corrupt or uses an unsupported version.',
                { cause: new ProjectFormatV1Error("Invalid stored project.", validation.issues) },
            );
        }
        return cloneProject(validation.value);
    }

    async saveProject(project: Project): Promise<void> {
        const validation = validateProjectV1(project);
        if (!validation.ok) {
            throw new ProjectStoreError(
                "INVALID_PROJECT",
                "Cannot save an invalid project.",
                { cause: new ProjectFormatV1Error("Invalid project.", validation.issues) },
            );
        }

        const db = await this.openDb();
        try {
            const transaction = db.transaction(PROJECT_STORE_OBJECT_STORE, "readwrite");
            const done = transactionDone(transaction);
            transaction.objectStore(PROJECT_STORE_OBJECT_STORE).put(cloneProject(validation.value));
            await done;
        } catch (error) {
            if (error instanceof ProjectStoreError) throw error;
            throw new ProjectStoreError("STORAGE_FAILED", "Failed to save local project.", { cause: error });
        } finally {
            db.close();
        }
    }

    async deleteProject(id: string): Promise<void> {
        const db = await this.openDb();
        try {
            const transaction = db.transaction(PROJECT_STORE_OBJECT_STORE, "readwrite");
            const done = transactionDone(transaction);
            transaction.objectStore(PROJECT_STORE_OBJECT_STORE).delete(id);
            await done;
        } catch (error) {
            if (error instanceof ProjectStoreError) throw error;
            throw new ProjectStoreError("STORAGE_FAILED", "Failed to delete local project.", { cause: error });
        } finally {
            db.close();
        }
    }

    async exportProject(id: string): Promise<string> {
        const project = await this.loadProject(id);
        if (!project) {
            throw new ProjectStoreError("NOT_FOUND", 'Project "' + id + '" was not found.');
        }
        return encodeProjectV1(project);
    }

    async importProject(serialized: string): Promise<Project> {
        let project: ProjectV1;
        try {
            project = decodeProjectV1(serialized);
        } catch (error) {
            if (error instanceof ProjectFormatV1Error) {
                throw new ProjectStoreError("INVALID_PROJECT", error.message, { cause: error });
            }
            throw error;
        }

        await this.addNew(project);
        return cloneProject(project);
    }
}
