import type { CacheType } from "@/lib/cache-types";

const CACHE_TYPE_COOKIE = "cache-type";

/** Header value for requests routed through the Vite `/api/cache-proxy/*` plugin. */
export function cacheProxyHeaders(cacheType: Pick<CacheType, "ip" | "port">) {
  return {
    "x-cache-type": JSON.stringify({ ip: cacheType.ip, port: cacheType.port }),
  };
}

/**
 * Keeps the cache target cookie in sync for proxy requests that cannot attach
 * custom headers, such as image URLs used by the Interface Workbench.
 */
export function syncCacheTypeCookie(cacheType: Pick<CacheType, "ip" | "port">) {
  if (typeof document === "undefined") return;
  const value = encodeURIComponent(JSON.stringify({ ip: cacheType.ip, port: cacheType.port }));
  document.cookie = `${CACHE_TYPE_COOKIE}=${value}; path=/; max-age=31536000; SameSite=Lax`;
}
