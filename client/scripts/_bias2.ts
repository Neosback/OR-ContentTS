import { CacheSystem } from "../src/rs/cache/CacheSystem";
import { getCacheLoaderFactory } from "../src/rs/cache/loader/CacheLoaderFactory";
import { loadCache } from "./cache/load-util";
const name = process.argv[2];
const info = { name, game: "oldschool" as const, environment: "live", revision: name.includes("240") ? 240 : 237, timestamp: "2026-10-01T00:00:00Z", size: 0 };
const cache = loadCache(info as never);
const f = getCacheLoaderFactory(info as never, CacheSystem.fromFiles(cache.type, cache.files));
const ltl = f.getLocTypeLoader(); const ml = f.getModelLoader();
let locModels = 0, withPrio = 0, withBias = 0, both = 0, prioFaces = 0, biasFaces = 0, bothFaces = 0, totalFaces = 0;
const seen = new Set<number>(); const ex: string[] = [];
for (let id = 0; id < ltl.getCount(); id++) {
  let lt; try { lt = ltl.load(id); } catch { continue; }
  for (const set of lt.models ?? []) for (const mid of set) {
    if (seen.has(mid)) continue; seen.add(mid);
    let m; try { m = ml.getModel(mid); } catch { continue; } if (!m) continue;
    locModels++; totalFaces += m.faceCount;
    const hp = !!m.faceRenderPriorities && m.faceRenderPriorities.some((p: number) => p !== 0) || (m.priority ?? 0) !== 0;
    const hb = !!m.faceBias && m.faceBias.some((b: number) => b !== 0);
    if (hp) withPrio++; if (hb) withBias++; if (hp && hb) both++;
    for (let i = 0; i < m.faceCount; i++) { const p = m.faceRenderPriorities ? m.faceRenderPriorities[i] : m.priority; const b = m.faceBias ? m.faceBias[i] : 0; if (p) prioFaces++; if (b) biasFaces++; if (p && b) bothFaces++; }
    if (hb && ex.length < 12) ex.push(`loc ${id} model ${mid}: bias values ${[...new Set(m.faceBias)].join(",")} prio values ${m.faceRenderPriorities ? [...new Set(m.faceRenderPriorities)].join(",") : "(model prio " + m.priority + ")"}`);
  }
}
console.log({ locModels, withPrio, withBias, both, totalFaces, prioFaces, biasFaces, bothFaces });
console.log(ex.join("\n"));
