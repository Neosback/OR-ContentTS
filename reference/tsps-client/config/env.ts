/**
 * Build-time environment. Vite inlines `import.meta.env` (VITE_* keys from
 * client/.env*, plus BASE_URL/DEV/PROD). Under the tsx node tests and scripts
 * there is no Vite, so VITE_* reads fall back to `process.env` at call time.
 */
type ViteEnv = {
    readonly BASE_URL?: string;
    readonly DEV?: boolean;
    readonly PROD?: boolean;
    readonly [key: string]: string | boolean | undefined;
};

const viteEnv: ViteEnv | undefined = (import.meta as { env?: ViteEnv }).env;
const env: ViteEnv = viteEnv ?? {};

/** A VITE_* value, or undefined when unset. */
export function readEnv(key: `VITE_${string}`): string | undefined {
    const value = viteEnv ? viteEnv[key] : typeof process !== "undefined" ? process.env?.[key] : undefined;
    return typeof value === "string" ? value : undefined;
}

/** Public base path without a trailing slash: "" when served from the root. */
export const PUBLIC_PATH = (env.BASE_URL ?? "").replace(/\/$/, "");

export const IS_PRODUCTION = env.PROD === true;
export const IS_DEVELOPMENT = env.DEV === true;
