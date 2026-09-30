/** Compatibility typings for threads.js under TypeScript bundler resolution. */
declare module "threads" {
    export interface TransferDescriptor<T = unknown> {
        payload: T;
        transferables?: Transferable[];
    }

    export interface SerializerImplementation {
        serialize(value: any, defaultHandler: (value: any) => any): any;
        deserialize(value: any, defaultHandler: (value: any) => any): any;
    }

    export type ModuleThread<T> = T;

    export interface QueuedTask<ThreadType, Return> extends PromiseLike<Return> {
        id: number;
        run(thread: ThreadType): Return | PromiseLike<Return>;
        cancel(): void;
    }

    export interface Pool<ThreadType> {
        queue<Return>(task: (thread: ThreadType) => Return | PromiseLike<Return>): QueuedTask<ThreadType, Return>;
        terminate(force?: boolean): Promise<void>;
    }

    export function Pool<ThreadType>(
        spawnWorker: () => Promise<ThreadType>,
        optionsOrSize?: number | { size?: number; concurrency?: number; maxQueuedJobs?: number; name?: string },
    ): Pool<ThreadType>;

    export function spawn<T>(worker: Worker): Promise<ModuleThread<T>>;
    export function registerSerializer(serializer: SerializerImplementation): void;
}

declare module "threads/dist/master/pool" {
    export interface QueuedTask<ThreadType, Return> extends PromiseLike<Return> {
        id: number;
        run(thread: ThreadType): Return | PromiseLike<Return>;
        cancel(): void;
    }
}

declare module "threads/dist/master/pool-types" {
    export interface WorkerDescriptor<ThreadType> {
        init: Promise<ThreadType>;
        runningTasks: Promise<void>[];
    }
}

declare module "threads/dist/observable-promise" {
    export type ObservablePromise<T> = PromiseLike<T>;
}

declare module "threads/worker" {
    export interface TransferDescriptor<T = unknown> {
        payload: T;
        transferables?: Transferable[];
    }
    export function Transfer<T>(payload: T, transferables?: Transferable[]): TransferDescriptor<T>;
    export function registerSerializer(...args: unknown[]): void;
    export function expose(exposed: unknown): void;
}

declare module "bzip2" {
    const bzip2: any;
    export default bzip2;
}

declare module "picogl/build/module/texture.js" {
    export const Texture: any;
}
