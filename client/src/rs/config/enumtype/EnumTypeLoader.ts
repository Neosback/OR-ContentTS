import type { Archive } from "../../cache/Archive";
import type { CacheInfo } from "../../cache/CacheInfo";
import { ArchiveTypeLoader, type TypeLoader } from "../TypeLoader";
import { EnumType } from "./EnumType";

export type EnumTypeLoader = TypeLoader<EnumType>;

export class ArchiveEnumTypeLoader extends ArchiveTypeLoader<EnumType> implements EnumTypeLoader {
    constructor(cacheInfo: CacheInfo, archive: Archive) {
        super(EnumType, cacheInfo, archive);
    }
}
