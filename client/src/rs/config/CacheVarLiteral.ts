export type CacheVarBaseType = "integer" | "long" | "string";

export type CacheVarLiteral = {
    id: number;
    char: string;
    name: string;
    baseType: CacheVarBaseType;
};

const LONG_IDS = new Set([35, 49, 56, 71, 110, 115, 116]);

const LITERALS: Array<[number, string, string]> = [
    [0, "i", "INT"], [1, "1", "BOOLEAN"], [2, "2", "HASH32"], [3, ":", "QUEST"],
    [4, ";", "QUESTHELP"], [5, "@", "CURSOR"], [6, "A", "SEQ"], [7, "C", "COLOUR"],
    [8, "H", "LOCSHAPE"], [9, "I", "COMPONENT"], [10, "K", "IDKIT"], [11, "M", "MIDI"],
    [12, "N", "NPC_MODE"], [13, "O", "NAMEDOBJ"], [14, "P", "SYNTH"], [15, "Q", "AI_QUEUE"],
    [16, "R", "AREA"], [17, "S", "STAT"], [18, "T", "NPC_STAT"], [19, "V", "WRITEINV"],
    [20, "^", "MESH"], [21, "`", "MAPAREA"], [22, "c", "COORDGRID"], [23, "d", "GRAPHIC"],
    [24, "e", "CHATPHRASE"], [25, "f", "FONTMETRICS"], [26, "g", "ENUM"], [27, "h", "HUNT"],
    [28, "j", "JINGLE"], [29, "k", "CHATCAT"], [30, "l", "LOC"], [31, "m", "MODEL"],
    [32, "n", "NPC"], [33, "o", "OBJ"], [34, "p", "PLAYER_UID"], [35, "r", "REGION_UID"],
    [36, "s", "STRING"], [37, "t", "SPOTANIM"], [38, "u", "NPC_UID"], [39, "v", "INV"],
    [40, "x", "TEXTURE"], [41, "y", "CATEGORY"], [42, "z", "CHAR"], [43, "|", "LASER"],
    [44, "€", "BAS"], [45, "ƒ", "CONTROLLER"], [46, "‡", "COLLISION_GEOMETRY"],
    [47, "‰", "PHYSICS_MODEL"], [48, "Š", "PHYSICS_CONTROL_MODIFIER"], [49, "Œ", "CLANHASH"],
    [51, "š", "CUTSCENE"], [53, "¡", "ITEMCODE"], [54, "¢", "PVPKILLS"], [55, "£", "MAPSCENEICON"],
    [56, "§", "CLANFORUMQFC"], [57, "«", "VORBIS"], [58, "®", "VERIFY_OBJECT"],
    [59, "µ", "MAPELEMENT"], [60, "¶", "CATEGORYTYPE"], [61, "Æ", "SOCIAL_NETWORK"],
    [62, "×", "HITMARK"], [63, "Þ", "PACKAGE"], [64, "á", "PARTICLE_EFFECTOR"],
    [65, "æ", "CONTROLLER_UID"], [66, "é", "PARTICLE_EMITTER"], [67, "í", "PLOGTYPE"],
    [68, "î", "UNSIGNED_INT"], [69, "ó", "SKYBOX"], [70, "ú", "SKYDECOR"], [71, "û", "HASH64"],
    [72, "Î", "INPUTTYPE"], [73, "J", "STRUCT"], [74, "Ð", "DBROW"], [75, "¤", "STORABLELABEL"],
    [76, "¥", "STORABLEPROC"], [77, "è", "GAMELOGEVENT"], [78, "¹", "ANIMATIONCLIP"],
    [79, "°", "SKELETON"], [80, "ì", "REGIONVISIBILITY"], [81, "ë", "FMODHANDLE"],
    [83, "þ", "REGION_ALLOWLOGIN"], [84, "ý", "REGION_INFO"], [85, "ÿ", "REGION_INFO_FAILURE"],
    [86, "õ", "SERVER_ACCOUNT_CREATION_STEP"], [87, "ô", "CLIENT_ACCOUNT_CREATION_STEP"],
    [88, "ö", "LOBBY_ACCOUNT_CREATION_STEP"], [89, "ò", "GWC_PLATFORM"], [90, "Ü", "CURRENCY"],
    [91, "ù", "KEYBOARD_KEY"], [92, "ï", "MOUSEEVENT"], [93, "¯", "HEADBAR"],
    [94, "ê", "BUG_TEMPLATE"], [95, "ð", "BILLING_AUTH_FLAG"], [96, "å", "ACCOUNT_FEATURE_FLAG"],
    [97, "a", "INTERFACE"], [98, "F", "TOPLEVELINTERFACE"], [99, "L", "OVERLAYINTERFACE"],
    [100, "©", "CLIENTINTERFACE"], [101, "Ý", "MOVESPEED"], [102, "¬", "MATERIAL"],
    [103, "ø", "SEQGROUP"], [104, "ä", "TEMP_HISCORE"], [105, "ã", "TEMP_HISCORE_LENGTH_TYPE"],
    [106, "â", "TEMP_HISCORE_DISPLAY_TYPE"], [107, "à", "TEMP_HISCORE_CONTRIBUTE_RESULT"],
    [108, "À", "AUDIOGROUP"], [109, "Ò", "AUDIOMIXBUSS"], [110, "Ï", "LONG"],
    [111, "Ì", "CRM_CHANNEL"], [112, "É", "HTTP_IMAGE"], [113, "Ê", "POP_UP_DISPLAY_BEHAVIOUR"],
    [114, "÷", "POLL"], [115, "¼", "MTXN_PACKAGE"], [116, "½", "MTXN_PRICE_POINT"],
    [117, "-", "ENTITYOVERLAY"], [118, "Ø", "DBTABLE"], [200, "X", "COMPONENTARRAY"],
    [201, "W", "INTARRAY"], [202, "b", "LABEL"], [203, "B", "QUEUE"], [204, "4", "TIMER"],
    [205, "w", "WEAKQUEUE"], [206, "q", "SOFTTIMER"], [207, "0", "OBJVAR"],
    [208, "6", "WALKTRIGGER"], [209, "7", "VARP"], [-1, "¸", "STRINGVECTOR"],
];

export const CACHE_VAR_LITERALS: readonly CacheVarLiteral[] = LITERALS.map(
    ([id, char, name]) => ({
        id,
        char,
        name,
        baseType: id === 36 ? "string" : LONG_IDS.has(id) ? "long" : "integer",
    }),
);

const BY_ID = new Map(CACHE_VAR_LITERALS.map((literal) => [literal.id, literal]));
const BY_CHAR = new Map(CACHE_VAR_LITERALS.map((literal) => [literal.char, literal]));

export function cacheVarLiteralById(id: number): CacheVarLiteral | undefined {
    return BY_ID.get(id);
}

export function cacheVarLiteralByChar(char: string): CacheVarLiteral | undefined {
    return BY_CHAR.get(char);
}
