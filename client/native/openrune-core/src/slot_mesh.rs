//! Per-slot vertex remap for the object "slot mesh". Port of the `emit` loop in
//! `buildSlotMesh` (client/src/mapeditor/webgl/loader/object-slot-mesh.ts).
//!
//! Every placed model owns a slot; the vertices of a model are copied once per slot (each copy carrying the slot
//! as a fourth word) and the model's indices are remapped to the copies. Jobs run in order, so output vertex
//! order matches the TypeScript version exactly.

use wasm_bindgen::prelude::*;

use crate::mesh_pack::MeshPacker;

/// Words per output vertex: the three packed words plus the slot.
const OUT_WORDS: usize = 4;
/// Words per job: first element, element count, slot, target (0 = static indices, 1 = animation indices).
const JOB_WORDS: usize = 4;

#[wasm_bindgen]
pub struct SlotMeshOutput {
    words: Vec<u32>,
    static_indices: Vec<u32>,
    anim_indices: Vec<u32>,
    job_lengths: Vec<u32>,
}

#[wasm_bindgen]
impl SlotMeshOutput {
    /// Output vertices, 4 words each (x/y/z/uv/colour words, then the slot).
    pub fn take_words(&mut self) -> Vec<u32> {
        std::mem::take(&mut self.words)
    }

    pub fn take_static_indices(&mut self) -> Vec<u32> {
        std::mem::take(&mut self.static_indices)
    }

    pub fn take_anim_indices(&mut self) -> Vec<u32> {
        std::mem::take(&mut self.anim_indices)
    }

    /// Indices appended to the job's target, one entry per job.
    pub fn take_job_lengths(&mut self) -> Vec<u32> {
        std::mem::take(&mut self.job_lengths)
    }
}

#[wasm_bindgen]
impl MeshPacker {
    /// Runs the emit jobs (`[first, count, slot, target]` per job) against the packed vertices and indices.
    pub fn build_slot_mesh(&self, jobs: &[u32]) -> Result<SlotMeshOutput, JsError> {
        if jobs.len() % JOB_WORDS != 0 {
            return Err(JsError::new("slot jobs must be groups of 4 words"));
        }
        let source_count = self.vertices.len() / 3;
        let mut stamp = vec![-1i64; source_count];
        let mut remap = vec![0u32; source_count];
        let mut words: Vec<u32> = Vec::with_capacity(self.indices.len() * OUT_WORDS / 2);
        let mut static_indices: Vec<u32> = Vec::with_capacity(self.indices.len());
        let mut anim_indices: Vec<u32> = Vec::new();
        let mut job_lengths: Vec<u32> = Vec::with_capacity(jobs.len() / JOB_WORDS);
        let mut out_count: u32 = 0;

        for job in jobs.chunks_exact(JOB_WORDS) {
            let (first, count, slot, target) = (job[0] as usize, job[1] as usize, job[2], job[3]);
            if first + count > self.indices.len() {
                return Err(JsError::new("slot job reads past the index list"));
            }
            let out = if target == 0 { &mut static_indices } else { &mut anim_indices };
            let before = out.len();
            for &source in &self.indices[first..first + count] {
                let source = source as usize;
                if stamp[source] != slot as i64 {
                    stamp[source] = slot as i64;
                    remap[source] = out_count;
                    out_count += 1;
                    let base = source * 3;
                    words.extend_from_slice(&[self.vertices[base], self.vertices[base + 1], self.vertices[base + 2], slot]);
                }
                out.push(remap[source]);
            }
            job_lengths.push((out.len() - before) as u32);
        }
        Ok(SlotMeshOutput { words, static_indices, anim_indices, job_lengths })
    }
}
