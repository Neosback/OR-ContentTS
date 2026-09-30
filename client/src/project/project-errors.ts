export type ProjectFormatV1Issue = {
    path: string;
    message: string;
};

export class ProjectFormatV1Error extends Error {
    constructor(
        message: string,
        readonly issues: readonly ProjectFormatV1Issue[] = [],
    ) {
        super(message);
        this.name = "ProjectFormatV1Error";
    }
}

export type ProjectStoreErrorCode =
    | "NOT_FOUND"
    | "CONFLICT"
    | "INVALID_PROJECT"
    | "STORAGE_UNAVAILABLE"
    | "STORAGE_FAILED";

export class ProjectStoreError extends Error {
    constructor(
        readonly code: ProjectStoreErrorCode,
        message: string,
        options?: ErrorOptions,
    ) {
        super(message, options);
        this.name = "ProjectStoreError";
    }
}
