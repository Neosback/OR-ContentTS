import type { IEditorPluginHost } from "../../mapeditor/plugins/editor-plugin-host";
import { IndexedDbProjectStore } from "../../project/indexeddb-project-store";
import {
    ProjectLifecycle,
    ProjectLifecycleError,
    type ProjectLifecycleSnapshot,
    type SaveProjectAsInput,
} from "../../project/project-lifecycle";
import type { Project, ProjectSummary } from "../../project/project-store";

export class ProjectSessionController {
    readonly lifecycle = new ProjectLifecycle(new IndexedDbProjectStore());

    snapshot = $state.raw<ProjectLifecycleSnapshot>(this.lifecycle.getSnapshot());
    projects = $state.raw<ProjectSummary[]>([]);
    busy = $state(false);
    errorMessage = $state<string | undefined>();

    private host?: IEditorPluginHost;
    private unsubscribeHistory?: () => void;
    private historySyncEnabled = false;

    constructor() {
        this.lifecycle.subscribe(() => {
            this.snapshot = this.lifecycle.getSnapshot();
        });
    }

    async start(): Promise<void> {
        await this.refreshProjects();
    }

    bindHost(host: IEditorPluginHost): void {
        this.unsubscribeHistory?.();
        this.host = host;
        this.unsubscribeHistory = host.subscribeHistory(() => {
            if (this.historySyncEnabled && this.lifecycle.getSnapshot().project) {
                this.lifecycle.syncFromHistory(host.getHistorySnapshot());
            }
        });
    }

    dispose(): void {
        this.unsubscribeHistory?.();
        this.unsubscribeHistory = undefined;
        this.host = undefined;
        this.historySyncEnabled = false;
    }

    pauseHistorySync(): void {
        this.historySyncEnabled = false;
    }

    resumeHistorySync(syncNow = true): void {
        this.historySyncEnabled = true;
        if (syncNow && this.host && this.lifecycle.getSnapshot().project) {
            this.lifecycle.syncFromHistory(this.host.getHistorySnapshot());
        }
    }

    async refreshProjects(): Promise<void> {
        this.projects = await this.lifecycle.listProjects();
    }

    async createProject(name: string, profileId: string, profileName: string): Promise<Project> {
        const host = this.requireHost();
        return this.run(async () => {
            this.pauseHistorySync();
            this.resetEditorToBase();
            const project = await this.lifecycle.createProject({
                name,
                base: {
                    kind: "cache",
                    game: host.loadedCache.info.game,
                    revision: host.loadedCache.info.revision,
                    profileId,
                    name: profileName,
                },
            });
            await this.refreshProjects();
            return project;
        });
    }

    async openProject(id: string, discardChanges = false): Promise<Project> {
        return this.run(async () => {
            this.pauseHistorySync();
            this.resetEditorToBase();
            const project = await this.lifecycle.openProject(id, { discardChanges });
            this.assertCompatible(project);
            return project;
        });
    }

    async importProject(serialized: string, discardChanges = false): Promise<Project> {
        return this.run(async () => {
            this.pauseHistorySync();
            this.resetEditorToBase();
            const project = await this.lifecycle.importProject(serialized, { discardChanges });
            this.assertCompatible(project);
            await this.refreshProjects();
            return project;
        });
    }

    async saveProject(): Promise<Project> {
        return this.run(async () => {
            this.syncNow();
            const project = await this.lifecycle.saveProject();
            await this.refreshProjects();
            return project;
        });
    }

    async saveProjectAs(input: SaveProjectAsInput): Promise<Project> {
        return this.run(async () => {
            this.syncNow();
            const project = await this.lifecycle.saveProjectAs(input);
            await this.refreshProjects();
            return project;
        });
    }

    exportCurrentProject(pretty = true): string {
        this.syncNow();
        return this.lifecycle.exportCurrentProject(pretty);
    }

    closeProject(discardChanges = false): void {
        this.pauseHistorySync();
        this.lifecycle.closeProject({ discardChanges });
        this.resetEditorToBase();
    }

    isCompatible(project: Pick<Project, "base"> | Pick<ProjectSummary, "base">): boolean {
        const host = this.host;
        if (!host) return false;
        return (
            project.base.game === host.loadedCache.info.game &&
            project.base.revision === host.loadedCache.info.revision
        );
    }

    assertCompatible(project: Pick<Project, "base">): void {
        const host = this.requireHost();
        const actual = host.loadedCache.info;
        if (project.base.game !== actual.game || project.base.revision !== actual.revision) {
            throw new Error(
                `Project requires ${project.base.game} revision ${project.base.revision}, but the active cache is ${actual.game} revision ${actual.revision}.`,
            );
        }
    }

    resetEditorToBase(): void {
        const host = this.host;
        if (!host) return;
        let snapshot = host.getHistorySnapshot();
        while (snapshot.currentIndex >= 0) {
            host.undoHistory();
            snapshot = host.getHistorySnapshot();
        }
        host.clearHistory();
    }

    private syncNow(): void {
        const host = this.host;
        if (host && this.lifecycle.getSnapshot().project) {
            this.lifecycle.syncFromHistory(host.getHistorySnapshot());
        }
    }

    private requireHost(): IEditorPluginHost {
        if (!this.host) {
            throw new Error("Project session is not attached to an editor.");
        }
        return this.host;
    }

    private async run<T>(operation: () => Promise<T>): Promise<T> {
        if (this.busy) {
            throw new Error("Another project operation is already in progress.");
        }
        this.busy = true;
        this.errorMessage = undefined;
        try {
            return await operation();
        } catch (error) {
            this.errorMessage =
                error instanceof ProjectLifecycleError || error instanceof Error
                    ? error.message
                    : String(error);
            throw error;
        } finally {
            this.busy = false;
        }
    }
}
