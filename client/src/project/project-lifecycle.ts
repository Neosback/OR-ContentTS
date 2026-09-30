import type { EditorTransaction } from "../mapeditor/editor-transaction";
import type { MapEditorHistorySnapshot } from "../mapeditor/map-editor-history";
import {
    createEditBatchV1,
    decodeEditBatchV1,
    type EditBatchV1,
} from "./edit-format-v1";
import { encodeProjectV1 } from "./project-format-v1";
import type {
    CreateProjectInput,
    Project,
    ProjectStore,
    ProjectSummary,
} from "./project-store";

export type ProjectLifecycleErrorCode =
    | "NO_PROJECT"
    | "NOT_FOUND"
    | "DIRTY_PROJECT"
    | "INVALID_NAME";

export class ProjectLifecycleError extends Error {
    constructor(
        readonly code: ProjectLifecycleErrorCode,
        message: string,
    ) {
        super(message);
        this.name = "ProjectLifecycleError";
    }
}

export type ProjectLifecycleSnapshot = {
    project?: Project;
    workingEdits?: EditBatchV1;
    dirty: boolean;
};

export type CloseProjectOptions = {
    discardChanges?: boolean;
};

export type SaveProjectAsInput = {
    id?: string;
    name?: string;
};

export function getAppliedHistoryTransactions(
    snapshot: Pick<MapEditorHistorySnapshot, "entries" | "currentIndex">,
): readonly EditorTransaction[] {
    if (snapshot.currentIndex < 0) return [];
    return snapshot.entries.slice(0, snapshot.currentIndex + 1);
}

function cloneProject(project: Project): Project {
    return structuredClone(project);
}

function cloneEdits(edits: EditBatchV1): EditBatchV1 {
    return structuredClone(edits);
}

function stateKey(project: Project, edits: EditBatchV1): string {
    return JSON.stringify({
        name: project.name,
        base: project.base,
        edits,
    });
}

export class ProjectLifecycle {
    private project?: Project;
    private workingEdits?: EditBatchV1;
    private savedStateKey?: string;
    private dirty = false;
    private readonly listeners = new Set<() => void>();

    constructor(
        private readonly store: ProjectStore,
        private readonly now: () => number = Date.now,
    ) {}

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    getSnapshot(): ProjectLifecycleSnapshot {
        return {
            project: this.project ? cloneProject(this.project) : undefined,
            workingEdits: this.workingEdits ? cloneEdits(this.workingEdits) : undefined,
            dirty: this.dirty,
        };
    }

    async listProjects(): Promise<ProjectSummary[]> {
        return this.store.listProjects();
    }

    async createProject(
        input: CreateProjectInput,
        options: CloseProjectOptions = {},
    ): Promise<Project> {
        this.ensureCanReplaceCurrent(options);
        const project = await this.store.createProject(input);
        this.activate(project);
        return cloneProject(project);
    }

    async openProject(
        id: string,
        options: CloseProjectOptions = {},
    ): Promise<Project> {
        const project = await this.store.loadProject(id);
        if (!project) {
            throw new ProjectLifecycleError("NOT_FOUND", `Project "${id}" was not found.`);
        }
        this.ensureCanReplaceCurrent(options);
        this.activate(project);
        return cloneProject(project);
    }

    async importProject(
        serialized: string,
        options: CloseProjectOptions = {},
    ): Promise<Project> {
        this.ensureCanReplaceCurrent(options);
        const project = await this.store.importProject(serialized);
        this.activate(project);
        return cloneProject(project);
    }

    exportCurrentProject(pretty = true): string {
        const project = this.requireProject();
        const edits = this.requireWorkingEdits();
        const exportProject: Project = {
            ...cloneProject(project),
            updatedAt: this.dirty
                ? Math.max(project.createdAt, project.updatedAt, this.now())
                : project.updatedAt,
            edits: cloneEdits(edits),
        };
        return encodeProjectV1(exportProject, pretty);
    }

    renameCurrentProject(name: string): void {
        const project = this.requireProject();
        const normalized = name.trim();
        if (!normalized) {
            throw new ProjectLifecycleError("INVALID_NAME", "Project name must not be empty.");
        }
        if (project.name === normalized) return;
        this.project = { ...project, name: normalized };
        this.refreshDirty();
        this.notify();
    }

    setWorkingEdits(edits: EditBatchV1): void {
        this.requireProject();
        const validated = decodeEditBatchV1(structuredClone(edits));
        this.workingEdits = cloneEdits(validated);
        this.refreshDirty();
        this.notify();
    }

    syncFromHistory(snapshot: Pick<MapEditorHistorySnapshot, "entries" | "currentIndex">): void {
        const project = this.requireProject();
        const anchor = this.requireWorkingEdits();
        const transactions = getAppliedHistoryTransactions(snapshot);
        this.workingEdits = createEditBatchV1(transactions, {
            id: anchor.id,
            createdAt: anchor.createdAt,
        });
        this.refreshDirty();
        this.notify();
    }

    async saveProject(): Promise<Project> {
        const project = this.requireProject();
        const edits = this.requireWorkingEdits();
        const saved: Project = {
            ...cloneProject(project),
            updatedAt: Math.max(project.createdAt, project.updatedAt, this.now()),
            edits: cloneEdits(edits),
        };
        await this.store.saveProject(saved);
        this.activate(saved);
        return cloneProject(saved);
    }

    async saveProjectAs(input: SaveProjectAsInput = {}): Promise<Project> {
        const project = this.requireProject();
        const workingEdits = this.requireWorkingEdits();
        const name = (input.name ?? project.name).trim();
        if (!name) {
            throw new ProjectLifecycleError("INVALID_NAME", "Project name must not be empty.");
        }

        const created = await this.store.createProject({
            id: input.id,
            name,
            base: structuredClone(project.base),
        });
        const copied: Project = {
            ...created,
            edits: {
                ...created.edits,
                transactions: structuredClone(workingEdits.transactions),
            },
        };
        await this.store.saveProject(copied);
        this.activate(copied);
        return cloneProject(copied);
    }

    closeProject(options: CloseProjectOptions = {}): void {
        if (!this.project) return;
        if (this.dirty && !options.discardChanges) {
            throw new ProjectLifecycleError(
                "DIRTY_PROJECT",
                "Project has unsaved changes. Save it or explicitly discard changes before closing.",
            );
        }
        this.project = undefined;
        this.workingEdits = undefined;
        this.savedStateKey = undefined;
        this.dirty = false;
        this.notify();
    }

    async deleteProject(id: string, options: CloseProjectOptions = {}): Promise<void> {
        if (this.project?.id === id) {
            this.closeProject(options);
        }
        await this.store.deleteProject(id);
    }

    private ensureCanReplaceCurrent(options: CloseProjectOptions): void {
        if (this.project && this.dirty && !options.discardChanges) {
            throw new ProjectLifecycleError(
                "DIRTY_PROJECT",
                "Current project has unsaved changes. Save it or explicitly discard changes before switching projects.",
            );
        }
    }

    private activate(project: Project): void {
        const cloned = cloneProject(project);
        this.project = cloned;
        this.workingEdits = cloneEdits(cloned.edits);
        this.savedStateKey = stateKey(cloned, cloned.edits);
        this.dirty = false;
        this.notify();
    }

    private refreshDirty(): void {
        const project = this.requireProject();
        const edits = this.requireWorkingEdits();
        this.dirty = stateKey(project, edits) !== this.savedStateKey;
    }

    private requireProject(): Project {
        if (!this.project) {
            throw new ProjectLifecycleError("NO_PROJECT", "No project is currently open.");
        }
        return this.project;
    }

    private requireWorkingEdits(): EditBatchV1 {
        if (!this.workingEdits) {
            throw new ProjectLifecycleError("NO_PROJECT", "No project is currently open.");
        }
        return this.workingEdits;
    }

    private notify(): void {
        for (const listener of this.listeners) listener();
    }
}
