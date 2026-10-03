import { ByteBuffer } from "../../io/ByteBuffer";
import { Type } from "../Type";
import {
    DbColumnType,
    readDbColumnTypes,
    readDbColumnValues,
} from "./DbColumnType";

export class DbRowType extends Type {
    declaredColumnCount = 0;
    tableId = -1;
    readonly columns = new Map<number, DbColumnType>();

    override decodeOpcode(opcode: number, buffer: ByteBuffer): void {
        switch (opcode) {
            case 3: {
                this.declaredColumnCount = buffer.readUnsignedByte();

                for (
                    let columnId = buffer.readUnsignedByte();
                    columnId !== 0xff;
                    columnId = buffer.readUnsignedByte()
                ) {
                    const typeSlotCount = buffer.readUnsignedByte();
                    const types = readDbColumnTypes(buffer, typeSlotCount);
                    const values = readDbColumnValues(buffer, types);
                    this.columns.set(columnId, new DbColumnType(types, values));
                }
                break;
            }
            case 4:
                this.tableId = buffer.readVarInt();
                break;
            default:
                throw new Error(`DbRowType ${this.id}: unsupported opcode ${opcode}`);
        }
    }
}
