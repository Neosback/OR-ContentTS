// Camera-dependent OSRS face-priority ordering for the WebGPU object pass.
// One invocation handles one placed static model. This is intentionally a correctness-first serial baseline:
// models are independent and can run concurrently, while each model mirrors RuneLite's stable far-to-near
// priority bucket walk including the special priority 10/11 thresholds.

const CONTOUR_GROUND_CENTER_TILE: u32 = 0u;
const CONTOUR_GROUND_VERTEX: u32 = 1u;
const CONTOUR_GROUND_NONE: u32 = 2u;
const CONTOUR_GROUND_BAKED: u32 = 3u;

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

struct ScratchFace {
    triangle: u32,
    depth: i32,
}

@group(0) @binding(0) var<uniform> scene: SceneUniforms;

@group(1) @binding(0) var<uniform> map: MapUniforms;
@group(1) @binding(1) var<storage, read> slotInfo: array<u32>;
@group(1) @binding(2) var heightMap: texture_2d_array<i32>;

@group(2) @binding(0) var<storage, read> sourceIndices: array<u32>;
@group(2) @binding(1) var<storage, read_write> sortedIndices: array<u32>;
@group(2) @binding(2) var<storage, read> facePriorities: array<u32>;
@group(2) @binding(3) var<storage, read> priorityGroups: array<u32>;
@group(2) @binding(4) var<storage, read> vertexWords: array<u32>;
@group(2) @binding(5) var<storage, read_write> scratchFaces: array<ScratchFace>;
@group(2) @binding(6) var<storage, read> faceOrdinals: array<u32>;

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
    return textureLoad(
        heightMap,
        vec2<i32>(SCENE_BORDER_SIZE + x, SCENE_BORDER_SIZE + z),
        i32(plane),
        0,
    ).r * 8;
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

fn vertexDepth(vertexIndex: u32, slot: u32) -> i32 {
    let base = vertexIndex * 4u;
    let v0 = vertexWords[base];
    let v1 = vertexWords[base + 1u];
    let v2 = vertexWords[base + 2u];

    let x = f32(i32((v0 >> 17u) & 0x7FFFu) - 0x4000);
    let y = -f32(i32(v1 & 0x7FFFu) - 0x4000);
    let z = f32(i32((v2 >> 17u) & 0x7FFFu) - 0x4000);

    let modelInfo = decodeModelInfo(slot);
    let placed = select(1.0, 0.0, modelInfo.contourGround == CONTOUR_GROUND_BAKED);
    var localPos = vec3<f32>(x, y, z) + vec3<f32>(modelInfo.tilePos.x, 0.0, modelInfo.tilePos.y) * placed;

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

    let viewPos = scene.view * vec4<f32>(localPos, 1.0);
    // RuneLite's priority sorter works in integer camera-depth units. Convert tiles back to model units and
    // truncate toward zero like Java's float-to-int cast.
    return i32(-viewPos.z * 128.0);
}

fn triangleDepth(triangle: u32, slot: u32) -> i32 {
    let first = triangle * 3u;
    let d0 = vertexDepth(sourceIndices[first], slot);
    let d1 = vertexDepth(sourceIndices[first + 1u], slot);
    let d2 = vertexDepth(sourceIndices[first + 2u], slot);
    return (d0 + d1 + d2) / 3;
}

fn nextPriorityFace(
    start: u32,
    count: u32,
    scratchOffset: u32,
    priority: u32,
) -> u32 {
    var i = start;
    loop {
        if (i >= count) {
            return count;
        }
        let face = scratchFaces[scratchOffset + i];
        if (facePriorities[face.triangle] == priority) {
            return i;
        }
        i++;
    }
}

fn nextDynamicFace(
    start: u32,
    currentPriority: u32,
    count: u32,
    scratchOffset: u32,
) -> vec2<u32> {
    var priority = currentPriority;
    var cursor = start;
    loop {
        if (priority > 11u) {
            return vec2<u32>(12u, count);
        }
        cursor = nextPriorityFace(cursor, count, scratchOffset, priority);
        if (cursor < count) {
            return vec2<u32>(priority, cursor);
        }
        if (priority == 10u) {
            priority = 11u;
            cursor = 0u;
        } else {
            return vec2<u32>(12u, count);
        }
    }
}

fn isAlphaTriangle(triangle: u32, alphaFirst: u32, alphaCount: u32) -> bool {
    return alphaCount > 0u && triangle >= alphaFirst && triangle < alphaFirst + alphaCount;
}

fn writeTriangle(sourceTriangle: u32, destinationTriangle: u32) {
    let source = sourceTriangle * 3u;
    let destination = destinationTriangle * 3u;
    sortedIndices[destination] = sourceIndices[source];
    sortedIndices[destination + 1u] = sourceIndices[source + 1u];
    sortedIndices[destination + 2u] = sourceIndices[source + 2u];
}

@compute @workgroup_size(1)
fn sortPriorityGroup(@builtin(global_invocation_id) invocation: vec3<u32>) {
    let group = invocation.x;
    let groupBase = group * 6u;
    if (groupBase + 5u >= arrayLength(&priorityGroups)) {
        return;
    }

    let slot = priorityGroups[groupBase];
    let opaqueFirst = priorityGroups[groupBase + 1u];
    let opaqueCount = priorityGroups[groupBase + 2u];
    let alphaFirst = priorityGroups[groupBase + 3u];
    let alphaCount = priorityGroups[groupBase + 4u];
    let scratchOffset = priorityGroups[groupBase + 5u];
    let faceCount = opaqueCount + alphaCount;
    if (faceCount == 0u) {
        return;
    }

    // Build a combined full-model list, then stable-sort it far to near. Keeping both passes together is important:
    // RuneLite computes the 1/2, 3/4 and 6/8 thresholds across opaque and translucent faces before splitting output.
    var i = 0u;
    loop {
        if (i >= faceCount) {
            break;
        }
        let triangle = select(alphaFirst + (i - opaqueCount), opaqueFirst + i, i < opaqueCount);
        scratchFaces[scratchOffset + i].triangle = triangle;
        scratchFaces[scratchOffset + i].depth = triangleDepth(triangle, slot);
        i++;
    }

    i = 1u;
    loop {
        if (i >= faceCount) {
            break;
        }
        let key = scratchFaces[scratchOffset + i];
        var j = i;
        loop {
            if (j == 0u) {
                break;
            }
            let previous = scratchFaces[scratchOffset + j - 1u];
            let depthOrdered = previous.depth > key.depth;
            let tieOrdered =
                previous.depth == key.depth &&
                faceOrdinals[previous.triangle] <= faceOrdinals[key.triangle];
            if (depthOrdered || tieOrdered) {
                break;
            }
            scratchFaces[scratchOffset + j] = previous;
            j--;
        }
        scratchFaces[scratchOffset + j] = key;
        i++;
    }

    var counts: array<u32, 12>;
    var sums: array<i32, 10>;
    i = 0u;
    loop {
        if (i >= faceCount) {
            break;
        }
        let face = scratchFaces[scratchOffset + i];
        let priority = facePriorities[face.triangle];
        if (priority <= 11u) {
            counts[priority]++;
            if (priority < 10u) {
                sums[priority] += face.depth;
            }
        }
        i++;
    }

    var avg12 = 0;
    let count12 = counts[1] + counts[2];
    if (count12 > 0u) {
        avg12 = (sums[1] + sums[2]) / i32(count12);
    }
    var avg34 = 0;
    let count34 = counts[3] + counts[4];
    if (count34 > 0u) {
        avg34 = (sums[3] + sums[4]) / i32(count34);
    }
    var avg68 = 0;
    let count68 = counts[6] + counts[8];
    if (count68 > 0u) {
        avg68 = (sums[6] + sums[8]) / i32(count68);
    }

    var opaqueWrite = opaqueFirst;
    var alphaWrite = alphaFirst;
    var dynamic = nextDynamicFace(0u, 10u, faceCount, scratchOffset);

    var priority = 0u;
    loop {
        if (priority >= 10u) {
            break;
        }

        var hasThreshold = false;
        var threshold = 0;
        if (priority == 0u) {
            hasThreshold = true;
            threshold = avg12;
        } else if (priority == 3u) {
            hasThreshold = true;
            threshold = avg34;
        } else if (priority == 5u) {
            hasThreshold = true;
            threshold = avg68;
        }

        if (hasThreshold) {
            loop {
                if (dynamic.x > 11u) {
                    break;
                }
                let face = scratchFaces[scratchOffset + dynamic.y];
                if (face.depth <= threshold) {
                    break;
                }
                if (isAlphaTriangle(face.triangle, alphaFirst, alphaCount)) {
                    writeTriangle(face.triangle, alphaWrite);
                    alphaWrite++;
                } else {
                    writeTriangle(face.triangle, opaqueWrite);
                    opaqueWrite++;
                }
                dynamic = nextDynamicFace(dynamic.y + 1u, dynamic.x, faceCount, scratchOffset);
            }
        }

        i = 0u;
        loop {
            if (i >= faceCount) {
                break;
            }
            let face = scratchFaces[scratchOffset + i];
            if (facePriorities[face.triangle] == priority) {
                if (isAlphaTriangle(face.triangle, alphaFirst, alphaCount)) {
                    writeTriangle(face.triangle, alphaWrite);
                    alphaWrite++;
                } else {
                    writeTriangle(face.triangle, opaqueWrite);
                    opaqueWrite++;
                }
            }
            i++;
        }

        priority++;
    }

    loop {
        if (dynamic.x > 11u) {
            break;
        }
        let face = scratchFaces[scratchOffset + dynamic.y];
        if (isAlphaTriangle(face.triangle, alphaFirst, alphaCount)) {
            writeTriangle(face.triangle, alphaWrite);
            alphaWrite++;
        } else {
            writeTriangle(face.triangle, opaqueWrite);
            opaqueWrite++;
        }
        dynamic = nextDynamicFace(dynamic.y + 1u, dynamic.x, faceCount, scratchOffset);
    }
}
