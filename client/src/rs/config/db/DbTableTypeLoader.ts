import type { Archive } from "../../cache/Archive";
import type { CacheInfo } from "../../cache/CacheInfo";
import { ArchiveTypeLoader, type TypeLoader } from "../TypeLoader";
import { DbTableType } from "./DbTableType";

export type DbTableTypeLoader = TypeLoader<DbTableType>;

export class ArchiveDbTableTypeLoader
    extends ArchiveTypeLoader<DbTableType>
    implements DbTableTypeLoader
{
    constructor(cacheInfo: CacheInfo, archive: Archive) {
        super(DbTableType, cacheInfo, archive);
    }
}
