import { CacheSystem } from "../src/rs/cache/CacheSystem";
import { getCacheLoaderFactory } from "../src/rs/cache/loader/CacheLoaderFactory";
import { loadCache } from "./cache/load-util";
const name = process.argv[2];
const info = { name, game: "oldschool" as const, environment: "live", revision: name.includes("240") ? 240 : 237, timestamp: "2026-10-01T00:00:00Z", size: 0 };
const cache = loadCache(info as never);
const f = getCacheLoaderFactory(info as never, CacheSystem.fromFiles(cache.type, cache.files));
const ml = f.getModelLoader();
let total = 0, withBias = 0; const hist = new Map<number, number>();
const sample: string[] = [];
for (let id = 0; id < 60000; id++) {
  let m; try { m = ml.getModel(id); } catch { continue; }
  if (!m) continue; total++;
  if (m.faceBias) { withBias++; const nz = m.faceBias.filter((b: number) => b !== 0).length; for (const b of m.faceBias) hist.set(b, (hist.get(b) ?? 0) + 1); if (sample.length < 40 || [599, 600, 601, 2032, 2093, 1262].includes(id)) sample.push(`model ${id}: faces ${m.faceCount} nonzero bias ${nz} values ${[...new Set(m.faceBias)].sort((a: number, b: number) => a - b).join(",")}`); }
  else if ([599, 2032, 2093].includes(id)) sample.push(`model ${id}: no bias block (faces ${m.faceCount})`);
}
console.log({ total, withBias });
console.log([...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15));
console.log(sample.join("\n"));
