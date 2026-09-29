import { bakeMergedSceneModels } from "../src/mapviewer/webgl/loc/mergeEntityNormals";
import { CacheSystem } from "../src/rs/cache/CacheSystem";
import { getCacheLoaderFactory } from "../src/rs/cache/loader/CacheLoaderFactory";
import { LocModelLoader } from "../src/rs/config/loctype/LocModelLoader";
import { VarManager } from "../src/rs/config/vartype/VarManager";
import { Model } from "../src/rs/model/Model";
import { LocLoadType, SceneBuilder } from "../src/rs/scene/SceneBuilder";
import { loadCache, loadCacheInfos, loadCacheList, loadXteas } from "./cache/load-util";

async function main() {
    const cacheInfos = loadCacheInfos();
    const list = loadCacheList(cacheInfos);
    const cache = loadCache(list.latest);
    const cacheSystem = CacheSystem.fromFiles(cache.type, cache.files);
    const factory = getCacheLoaderFactory(cache.info, cacheSystem);
    const locTypeLoader = factory.getLocTypeLoader();
    new VarManager(factory.getVarBitTypeLoader());
    const modelLoader = factory.getModelLoader();
    const textureLoader = factory.getTextureLoader();
    const seqTypeLoader = factory.getSeqTypeLoader();
    const seqFrameLoader = factory.getSeqFrameLoader();
    const skeletalSeqLoader = factory.getSkeletalSeqLoader();
    const locModelLoader = new LocModelLoader(
        locTypeLoader,
        modelLoader,
        textureLoader,
        seqTypeLoader,
        seqFrameLoader,
        skeletalSeqLoader,
    );
    const mkBuilder = () =>
        new SceneBuilder(
            cache.info,
            factory.getMapFileLoader(),
            factory.getUnderlayTypeLoader(),
            factory.getOverlayTypeLoader(),
            locTypeLoader,
            locModelLoader,
            loadXteas(list.latest),
        );
    const borderSize = 6;
    const baseX = 50 * 64 - borderSize,
        baseY = 50 * 64 - borderSize,
        size = 64 + borderSize * 2;
    const refScene = mkBuilder().buildScene(
        baseX,
        baseY,
        size,
        size,
        false,
        false,
        LocLoadType.MODELS,
    );
    const entScene = mkBuilder().buildScene(
        baseX,
        baseY,
        size,
        size,
        false,
        false,
        LocLoadType.NO_MODELS,
    );
    bakeMergedSceneModels(entScene, locModelLoader, true);
    let walls = 0,
        wallExact = 0,
        wallBad = 0,
        wallFaces = 0;
    let locs = 0,
        locExact = 0,
        locBad = 0,
        locFaces = 0;
    const badSamples: string[] = [];
    for (let level = 0; level < 2; level++) {
        for (let x = borderSize + 2; x < borderSize + 62; x++) {
            for (let y = borderSize + 2; y < borderSize + 62; y++) {
                const rt = refScene.tiles[level][x][y];
                const et = entScene.tiles[level][x][y];
                if (!rt || !et) continue;
                const pairs: [unknown, unknown, string][] = [];
                if (rt.wall && et.wall) {
                    pairs.push([rt.wall.entity0, et.wall.entity0, "wall0"]);
                    pairs.push([rt.wall.entity1, et.wall.entity1, "wall1"]);
                }
                const rl = rt.locs.filter((l: any) => l.startX === x && l.startY === y);
                const el = et.locs.filter((l: any) => l.startX === x && l.startY === y);
                for (const r of rl) {
                    const m = el.find(
                        (e: any) =>
                            e.rotation === r.rotation && (e.entity as any)?.id === undefined,
                    );
                    void m;
                    pairs.push([
                        r.entity,
                        et.locs.find(
                            (e: any) =>
                                e.startX === x && e.startY === y && e.rotation === r.rotation,
                        )?.entity,
                        "loc",
                    ]);
                }
                if (rt.floorDecoration && et.floorDecoration) {
                    pairs.push([rt.floorDecoration.entity, et.floorDecoration.entity, "fdec"]);
                }
                for (const [refRaw, mineRaw, kind] of pairs) {
                    if (!(refRaw instanceof Model) || !(mineRaw instanceof Model)) continue;
                    if (refRaw.faceCount !== (mineRaw as Model).faceCount) continue;
                    const ref = refRaw as Model,
                        mine = mineRaw as Model;
                    if (kind === "loc") {
                        locs++;
                    } else {
                        walls++;
                    }
                    let bad = 0;
                    for (let i = 0; i < ref.faceCount; i++) {
                        if (
                            mine.faceColors1[i] !== ref.faceColors1[i] ||
                            mine.faceColors2[i] !== ref.faceColors2[i] ||
                            mine.faceColors3[i] !== ref.faceColors3[i]
                        )
                            bad++;
                    }
                    if (kind === "loc") {
                        locFaces += ref.faceCount;
                        locBad += bad;
                        if (bad === 0) locExact++;
                    } else {
                        wallFaces += ref.faceCount;
                        wallBad += bad;
                        if (bad === 0) wallExact++;
                    }
                    if (bad > 0 && badSamples.length < 15)
                        badSamples.push(
                            `${kind} L${level} (${x - borderSize},${y - borderSize}) bad=${bad}/${
                                ref.faceCount
                            }`,
                        );
                }
            }
        }
    }
    console.log(`walls: ${walls} exact=${wallExact} badFaces=${wallBad}/${wallFaces}`);
    console.log(`locs/fdec: ${locs} exact=${locExact} badFaces=${locBad}/${locFaces}`);
    console.log(badSamples.join("\n"));
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
