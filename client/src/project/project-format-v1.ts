import schema from "./project-format-v1.schema.json";

import type { EditBatchV1 } from "./edit-format-v1";
import { validateEditBatchV1 } from "./edit-format-v1";
import { ProjectFormatV1Error, type ProjectFormatV1Issue } from "./project-errors";

export const PROJECT_FORMAT_V1_NAME = "openrune.project" as const;
export const PROJECT_FORMAT_V1_VERSION = 1 as const;
export const PROJECT_FORMAT_V1_SCHEMA = schema;

export type ProjectCacheIdentityV1 = {
    kind: "cache";
    game: string;
    revision: number;
    profileId?: string;
    name?: string;
    fingerprint?: string;
};

export type ProjectV1 = {
    format: typeof PROJECT_FORMAT_V1_NAME;
    version: typeof PROJECT_FORMAT_V1_VERSION;
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    base: ProjectCacheIdentityV1;
    edits: EditBatchV1;
};

export type ProjectFormatV1ValidationResult =
    | { ok: true; value: ProjectV1 }
    | { ok: false; issues: ProjectFormatV1Issue[] };

const PROJECT_KEYS = new Set(["format", "version", "id", "name", "createdAt", "updatedAt", "base", "edits"]);
const BASE_KEYS = new Set(["kind", "game", "revision", "profileId", "name", "fingerprint"]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addIssue(issues: ProjectFormatV1Issue[], path: string, message: string): void {
    issues.push({ path, message });
}

function checkExactKeys(
    value: Record<string, unknown>,
    allowed: ReadonlySet<string>,
    path: string,
    issues: ProjectFormatV1Issue[],
): void {
    for (const key of Object.keys(value)) {
        if (!allowed.has(key)) addIssue(issues, path + "." + key, "Unknown field.");
    }
}

function requireString(
    value: unknown,
    path: string,
    issues: ProjectFormatV1Issue[],
    options: { nonEmpty?: boolean } = {},
): value is string {
    if (typeof value !== "string") {
        addIssue(issues, path, "Expected string.");
        return false;
    }
    if (options.nonEmpty && value.trim().length === 0) {
        addIssue(issues, path, "Expected non-empty string.");
        return false;
    }
    return true;
}

function requireInteger(
    value: unknown,
    path: string,
    issues: ProjectFormatV1Issue[],
    options: { min?: number } = {},
): value is number {
    if (!Number.isSafeInteger(value)) {
        addIssue(issues, path, "Expected safe integer.");
        return false;
    }
    if (options.min !== undefined && (value as number) < options.min) {
        addIssue(issues, path, "Expected value >= " + options.min + ".");
        return false;
    }
    return true;
}

function validateBaseIdentity(
    value: unknown,
    path: string,
    issues: ProjectFormatV1Issue[],
): value is ProjectCacheIdentityV1 {
    if (!isRecord(value)) {
        addIssue(issues, path, "Expected cache identity object.");
        return false;
    }

    checkExactKeys(value, BASE_KEYS, path, issues);
    if (value.kind !== "cache") addIssue(issues, path + ".kind", 'Expected "cache".');
    requireString(value.game, path + ".game", issues, { nonEmpty: true });
    requireInteger(value.revision, path + ".revision", issues, { min: 0 });

    for (const key of ["profileId", "name", "fingerprint"] as const) {
        if (value[key] !== undefined) {
            requireString(value[key], path + "." + key, issues, { nonEmpty: true });
        }
    }
    return true;
}

export function validateProjectV1(value: unknown): ProjectFormatV1ValidationResult {
    const issues: ProjectFormatV1Issue[] = [];
    if (!isRecord(value)) {
        return { ok: false, issues: [{ path: "$", message: "Expected project object." }] };
    }

    checkExactKeys(value, PROJECT_KEYS, "$", issues);
    if (value.format !== PROJECT_FORMAT_V1_NAME) {
        addIssue(issues, "$.format", 'Expected "' + PROJECT_FORMAT_V1_NAME + '".');
    }
    if (value.version !== PROJECT_FORMAT_V1_VERSION) {
        addIssue(issues, "$.version", "Expected version " + PROJECT_FORMAT_V1_VERSION + ".");
    }
    requireString(value.id, "$.id", issues, { nonEmpty: true });
    requireString(value.name, "$.name", issues, { nonEmpty: true });
    const createdAtValid = requireInteger(value.createdAt, "$.createdAt", issues, { min: 0 });
    const updatedAtValid = requireInteger(value.updatedAt, "$.updatedAt", issues, { min: 0 });
    if (
        createdAtValid &&
        updatedAtValid &&
        (value.updatedAt as number) < (value.createdAt as number)
    ) {
        addIssue(issues, "$.updatedAt", "Expected updatedAt >= createdAt.");
    }

    validateBaseIdentity(value.base, "$.base", issues);

    const editValidation = validateEditBatchV1(value.edits);
    if (!editValidation.ok) {
        for (const issue of editValidation.issues) {
            addIssue(issues, "$.edits" + issue.path.slice(1), issue.message);
        }
    }

    return issues.length === 0
        ? { ok: true, value: value as ProjectV1 }
        : { ok: false, issues };
}

export function encodeProjectV1(project: ProjectV1, pretty = true): string {
    const validation = validateProjectV1(project);
    if (!validation.ok) {
        throw new ProjectFormatV1Error("Cannot encode invalid Project v1 document.", validation.issues);
    }
    return JSON.stringify(project, null, pretty ? 2 : undefined);
}

export function decodeProjectV1(input: string | unknown): ProjectV1 {
    let value: unknown = input;
    if (typeof input === "string") {
        try {
            value = JSON.parse(input);
        } catch (error) {
            throw new ProjectFormatV1Error(
                "Invalid Project v1 JSON: " + (error instanceof Error ? error.message : String(error)),
            );
        }
    }

    const validation = validateProjectV1(value);
    if (!validation.ok) {
        throw new ProjectFormatV1Error("Invalid Project v1 document.", validation.issues);
    }
    return validation.value;
}
