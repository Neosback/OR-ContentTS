import { ByteBuffer } from "../../io/ByteBuffer";
import { Type } from "../Type";
import { cacheVarLiteralByChar, cacheVarLiteralById, type CacheVarLiteral } from "../CacheVarLiteral";

export class ParamType extends Type {
    private static SCRIPT_VAR_TYPES = [
        "€",
        "\u0000",
        "‚",
        "ƒ",
        "„",
        "…",
        "†",
        "‡",
        "ˆ",
        "‰",
        "Š",
        "‹",
        "Œ",
        "\u0000",
        "Ž",
        "\u0000",
        "\u0000",
        "‘",
        "’",
        "“",
        "”",
        "•",
        "–",
        "—",
        "˜",
        "™",
        "š",
        "›",
        "œ",
        "\u0000",
        "ž",
        "Ÿ",
    ];

    // ScriptVarType character retained for existing callers.
    type!: string;
    varType?: CacheVarLiteral;

    defaultInt: number = 0;
    defaultLong: bigint = 0n;

    defaultString!: string;

    autoDisable: boolean = true;

    static getJagexChar(c: number): string {
        if (c === 0) {
            throw new Error("Invalid char: " + c);
        } else {
            if (c >= 128 && c < 160) {
                let s = ParamType.SCRIPT_VAR_TYPES[c - 128];
                if (s === "\u0000") {
                    s = "?";
                }

                return s;
            }

            return String.fromCharCode(c);
        }
    }

    override decodeOpcode(opcode: number, buffer: ByteBuffer): void {
        if (opcode === 1) {
            this.type = ParamType.getJagexChar(buffer.readUnsignedByte());
            this.varType = cacheVarLiteralByChar(this.type);
        } else if (opcode === 2) {
            this.defaultInt = buffer.readInt();
        } else if (opcode === 4) {
            this.autoDisable = false;
        } else if (opcode === 5) {
            this.defaultString = buffer.readString();
        } else if (opcode === 7) {
            this.defaultLong = buffer.readLong();
        } else if (opcode === 8) {
            const typeId = buffer.readUnsignedByte();
            const literal = cacheVarLiteralById(typeId);
            if (!literal) {
                throw new Error(`ParamType: Unknown CacheVarLiteral id ${typeId}. ID: ${this.id}`);
            }
            this.varType = literal;
            this.type = literal.char;
        }
    }

    isString(): boolean {
        return this.type === "s";
    }
}
