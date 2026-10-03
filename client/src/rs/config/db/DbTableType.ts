import { ByteBuffer } from "../../io/ByteBuffer";
import { Type } from "../Type";
import {
    DbColumnType,
    readDbColumnTypes,
    readDbColumnValues,
} from "./DbColumnType";

export class DbTableType extends Type {
    declaredColumnCount = 0;
    readonly columns = new Map<number, DbColumnType>();

    override decodeOpcode(opcode: number, buffer: ByteBuffer): void {
        if (opcode !== 1) {
            throw new Error(`DbTableType ${this.id}: unsupported opcode ${opcode}`);
        }

        this.declaredColumnCount = buffer.readUnsignedByte();

        for (
            let setting = buffer.readUnsignedByte();
            setting !== 0xff;
            setting = buffer.readUnsignedByte()
        ) {
            const columnId = setting & 0x7f;
            const hasDefault = (setting & 0x80) !== 0;
            const typeSlotCount = buffer.readUnsignedByte();
            const types = readDbColumnTypes(buffer, typeSlotCount);
            const values = hasDefault ? readDbColumnValues(buffer, types) : undefined;

            this.columns.set(columnId, new DbColumnType(types, values));
        }
    }
}
