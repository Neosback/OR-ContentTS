import type { EditBatchV1 } from "./edit-format-v1";
import type { ProjectCacheIdentityV1, ProjectV1 } from "./project-format-v1";

export type Project = ProjectV1;

export type ProjectSummary = {
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    base: ProjectCacheIdentityV1;
};

export type CreateProjectInput = {
    id?: string;
    name: string;
    base: ProjectCacheIdentityV1;
    edits?: EditBatchV1;
};

export interface ProjectStore {
    listProjects(): Promise<ProjectSummary[]>;
    createProject(input: CreateProjectInput): Promise<Project>;
    loadProject(id: string): Promise<Project | undefined>;
    saveProject(project: Project): Promise<void>;
    deleteProject(id: string): Promise<void>;
    exportProject(id: string): Promise<string>;
    importProject(serialized: string): Promise<Project>;
}

export function toProjectSummary(project: Project): ProjectSummary {
    return {
        id: project.id,
        name: project.name,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        base: structuredClone(project.base),
    };
}
