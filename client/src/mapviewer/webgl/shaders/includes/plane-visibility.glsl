const int PLANE_SCENE_BORDER_SIZE = 6;
const int PLANE_TILE_SIZE_SHIFT = 7;

uniform highp usampler2DArray u_tileRenderFlags;
// Editor view options: draw every plane above the view plane like RS with roofs shown, and treat
// plane-1 bridge flags as linking the column down one plane (both on in the OSRS client).
uniform float u_showRoofs;
uniform float u_bridgeLinkBelow;

int getTileRenderFlag(int level, vec2 pos) {
    ivec2 ipos = ivec2(pos);
    int tileX = ipos.x >> PLANE_TILE_SIZE_SHIFT;
    int tileZ = ipos.y >> PLANE_TILE_SIZE_SHIFT;
    return int(texelFetch(u_tileRenderFlags, ivec3(PLANE_SCENE_BORDER_SIZE + tileX, PLANE_SCENE_BORDER_SIZE + tileZ, level), 0).r);
}

// OSRS setTileMinPlane: flag 8 draws from plane 0; a bridge flag on plane 1 lowers the whole column.
int getTileMinLevel(int level, vec2 pos) {
    if ((getTileRenderFlag(level, pos) & 0x8) != 0) {
        return 0;
    }
    if (u_bridgeLinkBelow > 0.5 && level > 0 && (getTileRenderFlag(1, pos) & 0x2) != 0) {
        return level - 1;
    }
    return level;
}

// Scene.draw skips tiles whose minPlane is above the drawn max plane: 3 with roofs shown, else the
// current plane (clientPreferences.isRoofsHidden). Flag 16 only matters to the low-detail loader.
bool isScenePlaneVisible(int plane, vec2 pos, float viewPlane, float hideBelowViewPlane) {
    int currentPlane = int(viewPlane);
    int maxPlane = u_showRoofs > 0.5 ? 3 : currentPlane;
    if (getTileMinLevel(plane, pos) > maxPlane) {
        return false;
    }
    return hideBelowViewPlane < 0.5 || plane >= currentPlane;
}
