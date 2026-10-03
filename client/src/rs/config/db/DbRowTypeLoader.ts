import type { Archive } from "../../cache/Archive";
import type { CacheInfo } from "../../cache/CacheInfo";
import { ArchiveTypeLoader, type TypeLoader } from "../TypeLoader";
import { DbRowType } from "./DbRowType";

export type DbRowTypeLoader = TypeLoader<DbRowType>;

export class ArchiveDbRowTypeLoader
    extends ArchiveTypeLoader<DbRowType>
    implements DbRowTypeLoader
{
    constructor(cacheInfo: CacheInfo, archive: Archive) {
        super(DbRowType, cacheInfo, archive);
    }
}
