/** Compatibility typings for threads.js 1.7 under TypeScript bundler resolution. */
declare module "threads" {
    export interface TransferDescriptor<T = any> {
        readonly send: T;
        readonly transferables: Transferable[];
    }

    export interface SerializerImplementation<Msg = any, Input = any> {
        deserialize(message: Msg, defaultDeserialize: (message: Msg) => Input): Input;
        serialize(input: Input, defaultSerialize: (input: Input) => Msg): Msg;
    }

    type StripAsync<T> = T extends Promise<infer U> ? U : T;
    type StripTransfer<T> = T extends TransferDescriptor<infer U> ? U : T;
    type ProxyArgs<Args extends readonly unknown[]> = {
        [K in keyof Args]: Args[K] | TransferDescriptor<Args[K]>;
    };

    export type ModuleThread<Module> = {
        [K in keyof Module as Module[K] extends (...args: any[]) => any ? K : never]:
            Module[K] extends (...args: infer Args) => infer Return
                ? (...args: ProxyArgs<Args>) => Promise<StripTransfer<StripAsync<Return>>>
                : never;
    };

    export interface QueuedTask<ThreadType, Return> extends PromiseLike<Return> {
        readonly id: number;
        run(thread: ThreadType): Promise<Return>;
        cancel(): void;
    }

    export interface Pool<ThreadType> {
        queue<Return>(task: (thread: ThreadType) => PromiseLike<Return>): QueuedTask<ThreadType, Return>;
        terminate(force?: boolean): Promise<void>;
    }

    export function Pool<ThreadType>(
        spawnWorker: () => Promise<ThreadType>,
        optionsOrSize?: number | { size?: number; concurrency?: number; maxQueuedJobs?: number; name?: string },
    ): Pool<ThreadType>;

    export function spawn<Module>(worker: Worker): Promise<ModuleThread<Module>>;
    export function registerSerializer(serializer: SerializerImplementation): void;
}

declare module "threads/worker" {
    export interface TransferDescriptor<T = any> {
        readonly send: T;
        readonly transferables: Transferable[];
    }

    export function Transfer<T>(payload: T, transferables?: Transferable[]): TransferDescriptor<T>;
    export function registerSerializer(serializer: {
        deserialize(message: any, defaultDeserialize: (message: any) => any): any;
        serialize(input: any, defaultSerialize: (input: any) => any): any;
    }): void;
    export function expose(exposed: unknown): void;
}

declare module "bzip2" {
    const bzip2: any;
    export default bzip2;
}

declare module "picogl/build/module/texture.js" {
    export const Texture: any;
}
