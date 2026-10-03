import { ByteBuffer } from "../../io/ByteBuffer";
import {
    cacheVarLiteralById,
    type CacheVarLiteral,
} from "../CacheVarLiteral";

export type DbCell = number | bigint | string;

const UNSUPPORTED_ARRAY_LITERAL_IDS = new Set([200, 201]);

export class DbColumnType {
    constructor(
        readonly types: CacheVarLiteral[],
        readonly values?: DbCell[],
    ) {}
}

export function readDbColumnTypes(buffer: ByteBuffer, count: number): CacheVarLiteral[] {
    const types = new Array<CacheVarLiteral>(count);
    for (let i = 0; i < count; i++) {
        const id = buffer.readUnsignedShortSmart();
        const type = cacheVarLiteralById(id);
        if (!type) {
            throw new Error(`DB column references unknown CacheVarLiteral id ${id}`);
        }
        if (UNSUPPORTED_ARRAY_LITERAL_IDS.has(type.id)) {
            throw new Error(`DB array cell type ${type.name} (${type.id}) is not supported`);
        }
        types[i] = type;
    }
    return types;
}

export function readDbCell(buffer: ByteBuffer, type: CacheVarLiteral): DbCell {
    switch (type.baseType) {
        case "integer":
            return buffer.readInt();
        case "long":
            return buffer.readLong();
        case "string":
            return buffer.readString();
    }
}

export function readDbColumnValues(
    buffer: ByteBuffer,
    types: CacheVarLiteral[],
): DbCell[] {
    const tupleCount = buffer.readUnsignedShortSmart();
    const values = new Array<DbCell>(tupleCount * types.length);

    for (let tupleIndex = 0; tupleIndex < tupleCount; tupleIndex++) {
        for (let typeIndex = 0; typeIndex < types.length; typeIndex++) {
            const valueIndex = tupleIndex * types.length + typeIndex;
            values[valueIndex] = readDbCell(buffer, types[typeIndex]);
        }
    }
    return values;
}
