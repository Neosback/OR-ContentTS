// WebGPU port of the editor object pass: mapviewer/webgl/shaders/main.vert.glsl + main.frag.glsl, VERTEX_SLOT variant.
// Keep the two in step until the WebGL2 renderer is retired. Everything that decides how a pixel looks (vertex
// decode, HSL -> RGB, texture animation, plane visibility, contouring, fog, depth bias) is a line-for-line port.

const TEXTURE_ANIM_UNIT: f32 = 1.0 / 128.0;

const CONTOUR_GROUND_CENTER_TILE: u32 = 0u;
const CONTOUR_GROUND_VERTEX: u32 = 1u;
const CONTOUR_GROUND_NONE: u32 = 2u;
const CONTOUR_GROUND_BAKED: u32 = 3u;

const FACE_PRIORITY_DEPTH_BIAS: f32 = 1.5e-6;
const MODEL_PRIORITY_DEPTH_BIAS: f32 = 2.0e-6;
// Model priority of walls (SceneLocs WALL_PRIORITY) and how far they are pushed back, in tiles.
const WALL_PRIORITY: u32 = 2u;
const WALL_DEPTH_PUSH: f32 = 12.0 / 128.0;

const FOG_CORNER_ROUNDING: f32 = 8.0;

const SCENE_BORDER_SIZE: i32 = 6;
const TILE_SIZE: i32 = 128;
const TILE_SIZE_SHIFT: u32 = 7u;

struct SceneUniforms {
    viewProj: mat4x4<f32>,
    view: mat4x4<f32>,
    proj: mat4x4<f32>,
    sky: vec4<f32>,
    cameraPos: vec2<f32>,
    renderDistance: f32,
    fogDepth: f32,
    currentTime: f32,
    brightness: f32,
    colorBanding: f32,
    isNewTextureAnim: f32,
}

struct MapUniforms {
    mapPos: vec2<f32>,
    timeLoaded: f32,
    hideRoofs: f32,
    viewPlaneMax: f32,
    hideBelowViewPlane: f32,
    planeClipEnabled: f32,
    showRoofs: f32,
    bridgeLinkBelow: f32,
    pad0: f32,
    pad1: f32,
    pad2: f32,
}

@group(0) @binding(0) var<uniform> scene: SceneUniforms;
@group(0) @binding(1) var textures: texture_2d_array<f32>;
@group(0) @binding(2) var textureSampler: sampler;
@group(0) @binding(3) var textureMaterials: texture_2d<i32>;

@group(1) @binding(0) var<uniform> map: MapUniforms;
// Two RGBA16UI texels per slot, stored as the raw uint16 stream (8 per slot = 4 words).
@group(1) @binding(1) var<storage, read> slotInfo: array<u32>;
@group(1) @binding(2) var heightMap: texture_2d_array<i32>;
@group(1) @binding(3) var tileRenderFlags: texture_2d_array<u32>;

struct ModelInfo {
    tilePos: vec2<f32>,
    height: u32,
    plane: u32,
    priority: u32,
    contourGround: u32,
    interactType: u32,
    interactId: u32,
    flags: u32,
}

struct Vertex {
    pos: vec3<f32>,
    color: vec4<f32>,
    texCoord: vec2<f32>,
    textureId: u32,
    priority: u32,
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) texCoord: vec2<f32>,
    @location(2) @interpolate(flat) texId: u32,
    @location(3) @interpolate(flat) alphaCutOff: f32,
    @location(4) fogAmount: f32,
}

fn fmod(x: f32, y: f32) -> f32 {
    return x - y * floor(x / y);
}

fn fmod2(x: vec2<f32>, y: f32) -> vec2<f32> {
    return x - y * floor(x / y);
}

fn unpackFloat11(v: u32) -> f32 {
    return 16.0 - f32(v) / 64.0;
}

// https://stackoverflow.com/a/17309861
fn hslToRgb(hsl: i32, brightness: f32) -> vec3<f32> {
    let onethird = 1.0 / 3.0;
    let twothird = 2.0 / 3.0;
    let rcpsixth = 6.0;

    let hue = f32(hsl >> 10u) / 64.0 + 0.0078125;
    let sat = f32((hsl >> 7u) & 0x7) / 8.0 + 0.0625;
    let lum = f32(hsl & 0x7f) / 128.0;

    var xt = vec3<f32>(rcpsixth * (hue - twothird), 0.0, rcpsixth * (1.0 - hue));
    if (hue < twothird) {
        xt = vec3<f32>(0.0, rcpsixth * (twothird - hue), rcpsixth * (hue - onethird));
    }
    if (hue < onethird) {
        xt = vec3<f32>(rcpsixth * (onethird - hue), rcpsixth * hue, 0.0);
    }
    xt = min(xt, vec3<f32>(1.0));

    let sat2 = 2.0 * sat;
    let satinv = 1.0 - sat;
    let luminv = 1.0 - lum;
    let lum2m1 = (2.0 * lum) - 1.0;
    let ct = (sat2 * xt) + satinv;

    var rgb = (luminv * ct) + lum2m1;
    if (lum < 0.5) {
        rgb = lum * ct;
    }
    return pow(max(rgb, vec3<f32>(0.0)), vec3<f32>(brightness));
}

fn decodeVertex(v0: u32, v1: u32, v2: u32, brightness: f32) -> Vertex {
    let x = f32(i32((v0 >> 17u) & 0x7FFFu) - 0x4000);
    let u = unpackFloat11(((v0 >> 11u) & 0x3Fu) | ((v2 & 0x1Fu) << 6u));
    let v = unpackFloat11(v0 & 0x7FFu);

    let y = -f32(i32(v1 & 0x7FFFu) - 0x4000);
    let hsl = i32((v1 >> 15u) & 0xFFFFu);
    let isTextured = (v1 >> 31u) & 0x1u;
    let textureId = u32((hsl >> 7u) | i32(((v2 >> 5u) & 0x1u) << 9u)) + 1u;
    let texId = select(0u, textureId, isTextured == 1u);

    let z = f32(i32((v2 >> 17u) & 0x7FFFu) - 0x4000);
    let alpha = f32((v2 >> 9u) & 0xFFu) / 255.0;
    let priority = (v2 >> 6u) & 0x7u;

    var color: vec4<f32>;
    if (texId == 0u) {
        color = vec4<f32>(hslToRgb(hsl, brightness), alpha);
    } else {
        color = vec4<f32>(vec3<f32>(f32(hsl & 0x7F) / 127.0), alpha);
    }

    return Vertex(vec3<f32>(x, y, z), color, vec2<f32>(u, v), texId, priority);
}

fn decodeModelInfo(slot: u32) -> ModelInfo {
    let base = slot * 4u;
    let w0 = slotInfo[base];
    let w1 = slotInfo[base + 1u];
    let w2 = slotInfo[base + 2u];
    let r = w0 & 0xFFFFu;
    let g = w0 >> 16u;
    let b = w1 & 0xFFFFu;
    let a = w1 >> 16u;

    var info: ModelInfo;
    info.tilePos = vec2<f32>(f32(r & 0x3FFFu), f32(g & 0x3FFFu));
    info.height = (b >> 6u) * 8u;
    info.plane = r >> 14u;
    info.priority = b & 0x7u;
    info.contourGround = (g >> 14u) & 0x3u;
    info.interactType = (b >> 4u) & 0x3u;
    info.interactId = a | (((b >> 3u) & 0x1u) << 16u);
    info.flags = w2 & 0xFFFFu;
    return info;
}

fn getTileHeight(x: i32, z: i32, plane: u32) -> i32 {
    return textureLoad(heightMap, vec2<i32>(SCENE_BORDER_SIZE + x, SCENE_BORDER_SIZE + z), i32(plane), 0).r * 8;
}

fn getHeightInterp(pos: vec2<f32>, plane: u32) -> f32 {
    let ipos = vec2<i32>(pos);
    let tileX = ipos.x >> TILE_SIZE_SHIFT;
    let tileZ = ipos.y >> TILE_SIZE_SHIFT;
    let offsetX = ipos.x & (TILE_SIZE - 1);
    let offsetZ = ipos.y & (TILE_SIZE - 1);
    let h00 = getTileHeight(tileX, tileZ, plane);
    let h10 = getTileHeight(tileX + 1, tileZ, plane);
    let h01 = getTileHeight(tileX, tileZ + 1, plane);
    let h11 = getTileHeight(tileX + 1, tileZ + 1, plane);
    let delta0 = (h00 * (TILE_SIZE - offsetX) + h10 * offsetX) >> TILE_SIZE_SHIFT;
    let delta1 = (h01 * (TILE_SIZE - offsetX) + h11 * offsetX) >> TILE_SIZE_SHIFT;
    return f32((delta0 * (TILE_SIZE - offsetZ) + delta1 * offsetZ) >> TILE_SIZE_SHIFT);
}

fn getTileRenderFlag(level: i32, pos: vec2<f32>) -> i32 {
    let ipos = vec2<i32>(pos);
    let tileX = ipos.x >> TILE_SIZE_SHIFT;
    let tileZ = ipos.y >> TILE_SIZE_SHIFT;
    return i32(textureLoad(tileRenderFlags, vec2<i32>(SCENE_BORDER_SIZE + tileX, SCENE_BORDER_SIZE + tileZ), level, 0).r);
}

// OSRS setTileMinPlane: flag 8 draws from plane 0; a bridge flag on plane 1 lowers the whole column.
fn getTileMinLevel(level: i32, pos: vec2<f32>) -> i32 {
    if ((getTileRenderFlag(level, pos) & 0x8) != 0) {
        return 0;
    }
    if (map.bridgeLinkBelow > 0.5 && level > 0 && (getTileRenderFlag(1, pos) & 0x2) != 0) {
        return level - 1;
    }
    return level;
}

fn isScenePlaneVisible(plane: i32, pos: vec2<f32>, viewPlane: f32, hideBelowViewPlane: f32) -> bool {
    let currentPlane = i32(viewPlane);
    var maxPlane = currentPlane;
    if (map.showRoofs > 0.5) {
        maxPlane = 3;
    }
    if (getTileMinLevel(plane, pos) > maxPlane) {
        return false;
    }
    return hideBelowViewPlane < 0.5 || plane >= currentPlane;
}

fn fogFactorLinear(dist: f32, start: f32, end: f32) -> f32 {
    return 1.0 - clamp((dist - start) / (end - start), 0.0, 1.0);
}

fn sdRoundedBox(p: vec2<f32>, b: vec2<f32>, r: f32) -> f32 {
    let q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, vec2<f32>(0.0))) - r;
}

fn hidden() -> VertexOutput {
    var out: VertexOutput;
    out.position = vec4<f32>(2.0, 2.0, 2.0, 1.0);
    out.color = vec4<f32>(0.0);
    out.texCoord = vec2<f32>(0.0);
    out.texId = 0u;
    out.alphaCutOff = 0.0;
    out.fogAmount = 0.0;
    return out;
}

@vertex
fn vs_main(@location(0) attrib: vec4<u32>) -> VertexOutput {
    let vertex = decodeVertex(attrib.x, attrib.y, attrib.z, scene.brightness);

    let materialData = textureLoad(textureMaterials, vec2<i32>(i32(vertex.textureId), 0), 0);
    let textureAnimation = vec2<f32>(f32(materialData.r), f32(materialData.g));

    var out: VertexOutput;
    out.color = vertex.color;
    if (scene.isNewTextureAnim > 0.5) {
        out.texCoord = vertex.texCoord + fmod2(fmod(scene.currentTime, 128.0) * textureAnimation / 64.0, 1.0);
    } else {
        out.texCoord = vertex.texCoord + (scene.currentTime / 0.02) * textureAnimation * TEXTURE_ANIM_UNIT;
    }
    out.texId = vertex.textureId;
    out.alphaCutOff = f32(materialData.b & 0xFF) / 255.0;

    let modelInfo = decodeModelInfo(attrib.w);

    // Roof-shaped locs are hidden per slot instead of by zeroing their draw range.
    if (map.hideRoofs > 0.5 && (modelInfo.flags & 1u) != 0u) {
        return hidden();
    }

    if (map.planeClipEnabled > 0.5) {
        if (!isScenePlaneVisible(i32(modelInfo.plane), modelInfo.tilePos, map.viewPlaneMax, map.hideBelowViewPlane)) {
            return hidden();
        }
    }

    // Baked (merged) models are already in scene space; their tile position is only for visibility/picking.
    let placed = select(1.0, 0.0, modelInfo.contourGround == CONTOUR_GROUND_BAKED);
    var localPos = vertex.pos + vec3<f32>(modelInfo.tilePos.x, 0.0, modelInfo.tilePos.y) * placed;

    var interpPos = vec2<f32>(0.0);
    if (modelInfo.contourGround == CONTOUR_GROUND_CENTER_TILE) {
        interpPos = modelInfo.tilePos;
    } else if (modelInfo.contourGround == CONTOUR_GROUND_VERTEX) {
        interpPos = localPos.xz;
    }
    localPos.y -= f32(modelInfo.height);
    if (modelInfo.contourGround != CONTOUR_GROUND_NONE) {
        localPos.y -= getHeightInterp(interpPos, modelInfo.plane) * placed;
    }

    localPos /= 128.0;
    localPos += vec3<f32>(map.mapPos.x, 0.0, map.mapPos.y) * 64.0;

    let loadAlpha = smoothstep(0.0, 1.0, min(scene.currentTime - map.timeLoaded, 1.0));
    let isLoading = select(0.0, 1.0, loadAlpha != 1.0);

    let dist = -sdRoundedBox(
        vec2<f32>(localPos.x - scene.cameraPos.x, localPos.z - scene.cameraPos.y),
        vec2<f32>(scene.renderDistance),
        FOG_CORNER_ROUNDING,
    );
    let fogDepth = min(scene.fogDepth, scene.renderDistance);
    var fog = fogFactorLinear(dist, 0.0, fogDepth);
    fog = isLoading * max(1.0 - loadAlpha, fog) + (1.0 - isLoading) * fog;
    out.fogAmount = fog;

    // See main.vert.glsl: walls are pushed back by less than their thickness so what touches them is painted over
    // them, and coplanar faces are ordered by a clip-space bias.
    let isWall = select(0.0, 1.0, modelInfo.priority == WALL_PRIORITY);
    var p = scene.view * vec4<f32>(localPos, 1.0);
    p.z += f32(modelInfo.plane) * 0.005 - isWall * WALL_DEPTH_PUSH;
    p = scene.proj * p;
    p.z -= (f32(vertex.priority) * FACE_PRIORITY_DEPTH_BIAS
        + f32(modelInfo.priority) * (1.0 - isWall) * MODEL_PRIORITY_DEPTH_BIAS) * p.w;
    // The projection matrix is OpenGL's (clip z in [-w, w]); WebGPU's clip z is [0, w]. This maps to the same
    // depth values WebGL writes, so the biases above mean the same thing.
    p.z = (p.z + p.w) * 0.5;
    out.position = p;
    return out;
}

// The texture bytes are BGRA in memory (ARGB ints), uploaded as bgra8unorm, so sampling already yields RGBA.
fn shade(input: VertexOutput) -> vec4<f32> {
    let textureColor = textureSample(textures, textureSampler, input.texCoord, input.texId);
    let lit = pow(textureColor, vec4<f32>(vec3<f32>(scene.brightness), 1.0))
        * vec4<f32>(round(input.color.rgb * scene.colorBanding) / scene.colorBanding, input.color.a);
    return lit;
}

@fragment
fn fs_opaque(input: VertexOutput) -> @location(0) vec4<f32> {
    let lit = shade(input);
    return vec4<f32>(mix(lit.rgb, scene.sky.rgb, input.fogAmount), lit.a);
}

@fragment
fn fs_alpha(input: VertexOutput) -> @location(0) vec4<f32> {
    let textureColor = textureSample(textures, textureSampler, input.texCoord, input.texId);
    let lit = pow(textureColor, vec4<f32>(vec3<f32>(scene.brightness), 1.0))
        * vec4<f32>(round(input.color.rgb * scene.colorBanding) / scene.colorBanding, input.color.a);
    if ((input.texId == 0u && lit.a < 0.01) || textureColor.a < input.alphaCutOff) {
        discard;
    }
    return vec4<f32>(mix(lit.rgb, scene.sky.rgb, input.fogAmount), lit.a);
}
