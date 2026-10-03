import { describe, expect, it } from "vitest";

import { Archive } from "../Archive";
import type { CacheIndex } from "../CacheIndex";
import type { CacheInfo } from "../CacheInfo";
import { CacheSystem } from "../CacheSystem";
import { ConfigType } from "../ConfigType";
import { IndexType } from "../IndexType";
import type { CacheLoaderFactory } from "./CacheLoaderFactory";
import { Dat2CacheLoaderFactory } from "./Dat2CacheLoaderFactory";

const REV_240: CacheInfo = {
    name: "rev-240-test",
    game: "oldschool",
    environment: "live",
    revision: 240,
    timestamp: "",
    size: 0,
};

function data(...values: number[]): Int8Array {
    return Int8Array.from(values.map((value) => value & 0xff));
}

function makeFactory(
    cacheInfo: CacheInfo = REV_240,
    archives: Map<number, Archive> = new Map(),
): CacheLoaderFactory {
    const configIndex = {
        archiveExists: (archiveId: number) => archives.has(archiveId),
        getArchive: (archiveId: number) => {
            const archive = archives.get(archiveId);
            if (!archive) {
                throw new Error(`Archive not found: ${archiveId}`);
            }
            return archive;
        },
    } as unknown as CacheIndex;

    const indices: Array<CacheIndex | undefined> = [];
    indices[IndexType.DAT2.configs] = configIndex;

    return new Dat2CacheLoaderFactory(cacheInfo, "dat2", new CacheSystem(indices));
}

describe("Dat2CacheLoaderFactory DB config integration", () => {
    it("loads DBRow and DBTable directly from OSRS config archives 38 and 39", () => {
        const archives = new Map<number, Archive>([
            [
                ConfigType.OSRS.dbRow,
                Archive.create(
                    ConfigType.OSRS.dbRow,
                    data(
                        4,
                        0xac, 0x02,
                        0,
                    ),
                ),
            ],
            [
                ConfigType.OSRS.dbTable,
                Archive.create(
                    ConfigType.OSRS.dbTable,
                    data(
                        1,
                        1,
                        0,
                        1,
                        0,
                        0xff,
                        0,
                    ),
                ),
            ],
        ]);

        const factory = makeFactory(REV_240, archives);
        const rowLoader = factory.getDbRowTypeLoader();
        const tableLoader = factory.getDbTableTypeLoader();

        expect(rowLoader).toBeDefined();
        expect(tableLoader).toBeDefined();

        expect(rowLoader?.load(0).tableId).toBe(300);
        expect(tableLoader?.load(0).columns.get(0)?.types[0]).toMatchObject({
            id: 0,
            name: "INT",
        });
    });

    it("keeps DB loaders optional when the selected cache does not contain DB archives", () => {
        const factory = makeFactory();

        expect(factory.getDbRowTypeLoader()).toBeUndefined();
        expect(factory.getDbTableTypeLoader()).toBeUndefined();
    });

    it("does not expose OSRS DB config loaders for RuneScape caches", () => {
        const archives = new Map<number, Archive>([
            [ConfigType.OSRS.dbRow, Archive.create(ConfigType.OSRS.dbRow, data(0))],
            [ConfigType.OSRS.dbTable, Archive.create(ConfigType.OSRS.dbTable, data(0))],
        ]);
        const factory = makeFactory(
            {
                ...REV_240,
                game: "runescape",
                revision: 700,
            },
            archives,
        );

        expect(factory.getDbRowTypeLoader()).toBeUndefined();
        expect(factory.getDbTableTypeLoader()).toBeUndefined();
    });
});
