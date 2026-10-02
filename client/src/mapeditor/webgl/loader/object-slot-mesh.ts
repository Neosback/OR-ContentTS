import type { DrawCommand, ModelInfo, SceneBuffer } from "../../../mapviewer/webgl/buffer/SceneBuffer";
import type { SlotJobOutput } from "../../../wasm/mesh-packer";
import type { LocAnimatedData } from "../../../mapviewer/webgl/loc/LocAnimatedData";

/**
 * Object geometry for one chunk in "slot" form, drawn with a handful of draw calls instead of one per model.
 *
 * Every placed model owns a *slot*: a record in a data texture (position, plane, contouring, priority, pick id,
 * roof flag). Each vertex carries its model's slot in a fourth 32-bit word, so the vertex shader finds the record
 * itself and the whole chunk (and, merged on the main thread, the whole map square) is one indexed range.
 *
 * Why: on Apple GPUs behind ANGLE-Metal each draw call costs several MB of GPU memory whatever it draws. The
 * previous layout issued one range per placed model (~3,000 per region) which exhausted memory.
 */

/** Bytes per vertex: the three packed words of `VertexBuffer` plus the slot. */
export const SLOT_VERTEX_STRIDE = 16;
/** Uint16 values per slot record: two RGBA16UI texels. */
export const SLOT_INFO_STRIDE = 8;

export const SLOT_FLAG_ROOF = 1;

export interface SlotAnimatedLoc {
    slot: number;
    /** Per animation frame: [element offset in `animIndices`, element count] (opaque pass). */
    frames: [number, number][];
    /** Same for transparent faces; undefined when the model has none. */
    framesAlpha: [number, number][] | undefined;
    seqId: number;
    randomStart: boolean;
}

export interface SlotMesh {
    /** SLOT_VERTEX_STRIDE bytes per vertex: x/y/z/uv/colour words, then the slot. */
    vertices: Uint8Array;
    /** Static geometry: `staticOpaqueCount` opaque indices followed by `staticAlphaCount` transparent ones. */
    indices: Int32Array;
    staticOpaqueCount: number;
    staticAlphaCount: number;
    /** Animation frame geometry (never drawn directly; the current frame of each loc is copied into a dynamic range). */
    animIndices: Int32Array;
    /** SLOT_INFO_STRIDE uint16 per slot. */
    slotInfo: Uint16Array;
    slotCount: number;
    locsAnimated: SlotAnimatedLoc[];
}

class GrowableU32 {
    data: Uint32Array;
    length = 0;

    constructor(capacity: number) {
        this.data = new Uint32Array(Math.max(capacity, 16));
    }

    push(value: number): void {
        if (this.length === this.data.length) {
            const next = new Uint32Array(this.data.length * 2);
            next.set(this.data);
            this.data = next;
        }
        this.data[this.length++] = value;
    }

    toArray(): Uint32Array {
        return this.data.slice(0, this.length);
    }
}

function writeSlotInfo(info: Uint16Array, slot: number, model: ModelInfo): void {
    const base = slot * SLOT_INFO_STRIDE;
    info[base] = model.sceneX | (model.level << 14);
    info[base + 1] = model.sceneZ | (model.contourGround << 14);
    info[base + 2] =
        (model.priority & 0x7) |
        ((model.interactId >> 16) << 3) |
        (model.interactType << 4) |
        (Math.round(model.heightOffset / 8) << 6);
    info[base + 3] = model.interactId;
    info[base + 4] = model.roof ? SLOT_FLAG_ROOF : 0;
}

const JOB_WORDS = 4;
const TARGET_STATIC = 0;
const TARGET_ANIM = 1;

/**
 * TypeScript reference of the wasm kernel `MeshPacker.build_slot_mesh`: runs emit jobs
 * (`[first element, element count, slot, target]` per job) in order. Each job copies the source vertices it
 * references once per slot (with the slot as a fourth word) and appends the remapped indices to its target list.
 */
export function emitSlotJobsTs(
    view: DataView,
    sourceIndices: ArrayLike<number>,
    sourceVertexCount: number,
    jobs: Uint32Array,
): SlotJobOutput {
    const words = new GrowableU32(Math.max(sourceVertexCount * 4, 64));
    const staticIndices = new GrowableU32(Math.max(sourceIndices.length, 16));
    const animIndices = new GrowableU32(16);
    const jobLengths = new Uint32Array(jobs.length / JOB_WORDS);

    // Per-slot vertex remap: source vertex -> output vertex, valid while stamp matches the current slot.
    const stamp = new Int32Array(sourceVertexCount).fill(-1);
    const remap = new Int32Array(sourceVertexCount);
    let outVertexCount = 0;

    for (let job = 0; job < jobLengths.length; job++) {
        const first = jobs[job * JOB_WORDS];
        const count = jobs[job * JOB_WORDS + 1];
        const slot = jobs[job * JOB_WORDS + 2];
        const out = jobs[job * JOB_WORDS + 3] === TARGET_STATIC ? staticIndices : animIndices;
        const before = out.length;
        for (let k = first; k < first + count; k++) {
            const source = sourceIndices[k];
            if (stamp[source] !== slot) {
                stamp[source] = slot;
                remap[source] = outVertexCount++;
                const byteOffset = source * 12;
                words.push(view.getUint32(byteOffset, true));
                words.push(view.getUint32(byteOffset + 4, true));
                words.push(view.getUint32(byteOffset + 8, true));
                words.push(slot);
            }
            out.push(remap[source]);
        }
        jobLengths[job] = out.length - before;
    }
    return { words: words.toArray(), staticIndices: staticIndices.toArray(), animIndices: animIndices.toArray(), jobLengths };
}

/** Converts a built `SceneBuffer` (per-model draw commands) into slot form. */
export function buildSlotMesh(sceneBuf: SceneBuffer, animated: LocAnimatedData[]): SlotMesh {
    // Slots are allocated in two passes (static models, then animated locs); the exact count is known up front.
    let slotTotal = 0;
    for (const list of [sceneBuf.drawCommandsInteract, sceneBuf.drawCommandsInteractAlpha]) {
        for (const cmd of list) {
            if (cmd.elements > 0) slotTotal += cmd.instances.length;
        }
    }
    slotTotal += animated.length;
    const slotInfo = new Uint16Array(Math.max(slotTotal, 1) * SLOT_INFO_STRIDE);
    let slotCount = 0;

    // Phase 1: decide every emit job (and write the slot records). Nothing is copied yet.
    const jobs = new GrowableU32(256);
    let jobCount = 0;
    const addJob = (firstElement: number, count: number, slot: number, target: number): number => {
        jobs.push(firstElement);
        jobs.push(count);
        jobs.push(slot);
        jobs.push(target);
        return jobCount++;
    };

    const addCommands = (commands: readonly DrawCommand[]): void => {
        for (const cmd of commands) {
            if (cmd.elements === 0) continue; // animated placeholder: drawn through the dynamic range
            for (const instance of cmd.instances) {
                const slot = slotCount++;
                writeSlotInfo(slotInfo, slot, instance);
                addJob(cmd.offset / 4, cmd.elements, slot, TARGET_STATIC);
            }
        }
    };
    addCommands(sceneBuf.drawCommandsInteract);
    const opaqueJobEnd = jobCount;
    addCommands(sceneBuf.drawCommandsInteractAlpha);
    const staticJobEnd = jobCount;

    // The same source vertices are reused by every frame of an animated loc, so one slot (and one remap stamp)
    // serves all of its frames.
    const animatedJobs: { slot: number; loc: LocAnimatedData; frames: number[]; framesAlpha: number[] | undefined }[] = [];
    for (const loc of animated) {
        const placeholder = sceneBuf.drawCommandsInteract[loc.drawRangeInteractIndex];
        const instance = placeholder?.instances[0];
        if (!instance) continue;
        const slot = slotCount++;
        writeSlotInfo(slotInfo, slot, instance);
        const frameJobs = (ranges: readonly number[][]): number[] =>
            ranges.map((range) => addJob(range[0] / 4, range[1] > 0 ? range[1] : 0, slot, TARGET_ANIM));
        animatedJobs.push({
            slot,
            loc,
            frames: frameJobs(loc.anim.frames),
            framesAlpha: loc.anim.framesAlpha ? frameJobs(loc.anim.framesAlpha) : undefined,
        });
    }

    // Phase 2: run the jobs, in wasm when the buffer was packed there, else the TypeScript reference.
    const jobWords = jobs.toArray();
    const output =
        sceneBuf.emitSlotJobs?.(jobWords) ??
        (() => {
            const { view, indices, vertexCount } = sceneBuf.packedGeometry();
            return emitSlotJobsTs(view, indices, vertexCount, jobWords);
        })();

    // Phase 3: assemble.
    const jobLengths = output.jobLengths;
    let staticOpaqueCount = 0;
    let staticAlphaCount = 0;
    for (let job = 0; job < staticJobEnd; job++) {
        if (job < opaqueJobEnd) staticOpaqueCount += jobLengths[job];
        else staticAlphaCount += jobLengths[job];
    }
    // Where each animation job's indices start inside `animIndices`.
    const animStart = new Uint32Array(jobCount);
    let animCursor = 0;
    for (let job = 0; job < jobCount; job++) {
        if (jobWords[job * JOB_WORDS + 3] === TARGET_ANIM) {
            animStart[job] = animCursor;
            animCursor += jobLengths[job];
        }
    }
    const frameRanges = (jobIndices: number[]): [number, number][] =>
        jobIndices.map((job) => [animStart[job], jobLengths[job]] as [number, number]);

    const locsAnimated: SlotAnimatedLoc[] = animatedJobs.map(({ slot, loc, frames, framesAlpha }) => ({
        slot,
        frames: frameRanges(frames),
        framesAlpha: framesAlpha ? frameRanges(framesAlpha) : undefined,
        seqId: loc.seqId,
        randomStart: loc.randomStart,
    }));

    const vertexWords = output.words;
    return {
        vertices: new Uint8Array(vertexWords.buffer, vertexWords.byteOffset, vertexWords.byteLength),
        indices: new Int32Array(output.staticIndices.buffer, output.staticIndices.byteOffset, output.staticIndices.length),
        staticOpaqueCount,
        staticAlphaCount,
        animIndices: new Int32Array(output.animIndices.buffer, output.animIndices.byteOffset, output.animIndices.length),
        slotInfo: slotInfo.slice(0, Math.max(slotCount, 1) * SLOT_INFO_STRIDE),
        slotCount,
        locsAnimated,
    };
}
