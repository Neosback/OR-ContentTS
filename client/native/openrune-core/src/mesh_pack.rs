//! Model faces -> packed vertices + indices. Port of `SceneBuffer.addModel` / `VertexBuffer.addVertex` /
//! `getModelFaces` (client/src/mapviewer/webgl/buffer). Output must stay byte-identical to the TypeScript version.
//!
//! A packed vertex is three u32 words (12 bytes):
//!   w0 = x << 17 | (u & 0x3f) << 11 | v
//!   w1 = y | hsl << 15 | textured << 31
//!   w2 = z << 17 | alpha << 9 | priority << 6 | (texture >> 9 & 1) << 5 | u >> 6
//! Identical vertices are shared through an open-addressing table, exactly like the TypeScript buffer.

use wasm_bindgen::prelude::*;

const WORDS_PER_VERTEX: usize = 3;

#[inline]
fn slot_hash(v0: u32, v1: u32, v2: u32) -> u32 {
    let mut h = v0.wrapping_mul(0x9e37_79b1) ^ v1.wrapping_mul(0x85eb_ca6b) ^ v2.wrapping_mul(0xc2b2_ae35);
    h ^= h >> 15;
    h = h.wrapping_mul(0x2c1b_3c6d);
    h ^= h >> 12;
    h
}

/// `Math.round` (half rounds towards +infinity).
#[inline]
fn js_round(v: f64) -> f64 {
    (v + 0.5).floor()
}

/// `FloatUtil.packFloat11`, clamped to the 11-bit range the vertex format holds.
#[inline]
fn pack_uv(v: f32) -> u32 {
    let packed = 1024.0 - js_round(v as f64 * 64.0);
    packed.clamp(0.0, 0x7ff as f64) as u32
}

#[inline]
fn clamp_position(v: i32) -> u32 {
    (v + 0x4000).clamp(0, 0x8000) as u32
}

#[wasm_bindgen]
pub struct MeshPacker {
    pub(crate) vertices: Vec<u32>,
    pub(crate) indices: Vec<u32>,
    /// Vertex index + 1 per slot, 0 = empty.
    table: Vec<u32>,
    table_count: usize,
    /// Texture id -> texture array index (-1 when the texture is not in the atlas).
    texture_index: Vec<i32>,
    /// Texture id -> 1 when the texture has translucent pixels.
    texture_transparent: Vec<u8>,
    used_textures: Vec<u32>,
    used_seen: Vec<u8>,
}

#[wasm_bindgen]
impl MeshPacker {
    #[wasm_bindgen(constructor)]
    pub fn new(texture_index: Vec<i32>, texture_transparent: Vec<u8>, vertex_capacity: u32) -> MeshPacker {
        let mut table_len = 1024usize;
        while table_len < (vertex_capacity as usize) * 2 {
            table_len *= 2;
        }
        MeshPacker {
            vertices: Vec::with_capacity(vertex_capacity as usize * WORDS_PER_VERTEX),
            indices: Vec::with_capacity(vertex_capacity as usize * 2),
            table: vec![0; table_len],
            table_count: 0,
            used_seen: vec![0; texture_index.len()],
            texture_index,
            texture_transparent,
            used_textures: Vec::new(),
        }
    }

    pub fn vertex_count(&self) -> u32 {
        (self.vertices.len() / WORDS_PER_VERTEX) as u32
    }

    pub fn index_count(&self) -> u32 {
        self.indices.len() as u32
    }

    /// Packed vertices as little-endian u32 words (3 per vertex).
    pub fn vertices(&self) -> Vec<u32> {
        self.vertices.clone()
    }

    pub fn indices(&self) -> Vec<u32> {
        self.indices.clone()
    }

    /// Texture ids (not indices) of every atlas texture a face used, in first-use order.
    pub fn used_texture_ids(&self) -> Vec<u32> {
        self.used_textures.clone()
    }

    /// Adds the faces of one model that match `transparent` (the opaque or the translucent pass).
    /// Returns how many indices were appended.
    ///
    /// Empty slices mean "the model has no such array" (`contour_y`, `face_textures`, `face_alphas`,
    /// `priorities`, `uvs`). `offset` is applied (and `contour_y` used) only when `has_offset`.
    #[allow(clippy::too_many_arguments)]
    pub fn add_model(
        &mut self,
        face_count: u32,
        vx: &[i32],
        vy: &[i32],
        vz: &[i32],
        contour_y: &[i32],
        indices1: &[i32],
        indices2: &[i32],
        indices3: &[i32],
        colors1: &[i32],
        colors2: &[i32],
        colors3: &[i32],
        face_textures: &[i16],
        face_alphas: &[i8],
        priorities: &[i8],
        uvs: &[f32],
        has_offset: bool,
        offset_x: i32,
        offset_y: i32,
        offset_z: i32,
        transparent: bool,
        reuse_vertices: bool,
    ) -> Result<u32, JsError> {
        if !face_textures.is_empty() && uvs.is_empty() {
            return Err(JsError::new("Model has face textures but no texture coordinates"));
        }
        let (ox, oy, oz) = if has_offset { (offset_x, offset_y, offset_z) } else { (0, 0, 0) };
        let ys = if has_offset && !contour_y.is_empty() { contour_y } else { vy };

        let start = self.indices.len();
        for face in 0..face_count as usize {
            let mut hsl_c = colors3[face];
            if hsl_c == -2 {
                continue;
            }
            let texture_id: i32 = if face_textures.is_empty() { -1 } else { face_textures[face] as i32 };
            let mut alpha: i32 = 0xff;
            if !face_alphas.is_empty() && texture_id == -1 {
                alpha = 0xff - (face_alphas[face] as i32 & 0xff);
            }
            if alpha == 0 || alpha == 1 {
                continue;
            }
            let face_transparent = alpha < 0xff
                || (texture_id != -1
                    && self.texture_transparent.get(texture_id as usize).copied().unwrap_or(0) != 0);
            if face_transparent != transparent {
                continue;
            }
            let priority = if priorities.is_empty() { 0 } else { priorities[face] as i32 };
            let texture_index = if texture_id >= 0 {
                self.texture_index.get(texture_id as usize).copied().unwrap_or(-1)
            } else {
                -1
            };

            let hsl_a = colors1[face];
            let mut hsl_b = colors2[face];
            let hsl_a_out = hsl_a;
            if hsl_c == -1 {
                hsl_c = hsl_a;
                hsl_b = hsl_a;
            }

            let (mut u0, mut v0, mut u1, mut v1, mut u2, mut v2) = (0f32, 0f32, 0f32, 0f32, 0f32, 0f32);
            if !uvs.is_empty() {
                let base = face * 6;
                u0 = uvs[base];
                v0 = uvs[base + 1];
                u1 = uvs[base + 2];
                v1 = uvs[base + 3];
                u2 = uvs[base + 4];
                v2 = uvs[base + 5];
            }

            let fa = indices1[face] as usize;
            let fb = indices2[face] as usize;
            let fc = indices3[face] as usize;

            if texture_index != -1 {
                let id = texture_id as usize;
                if id < self.used_seen.len() && self.used_seen[id] == 0 {
                    self.used_seen[id] = 1;
                    self.used_textures.push(id as u32);
                }
            }

            let p = priority + 1;
            let i0 = self.add_vertex(ox + vx[fa], oy + ys[fa], oz + vz[fa], hsl_a_out, alpha, u0, v0, texture_index, p, reuse_vertices);
            let i1 = self.add_vertex(ox + vx[fb], oy + ys[fb], oz + vz[fb], hsl_b, alpha, u1, v1, texture_index, p, reuse_vertices);
            let i2 = self.add_vertex(ox + vx[fc], oy + ys[fc], oz + vz[fc], hsl_c, alpha, u2, v2, texture_index, p, reuse_vertices);
            self.indices.extend_from_slice(&[i0, i1, i2]);
        }
        Ok((self.indices.len() - start) as u32)
    }

    /// Adds one model at multiple scene offsets while copying its model arrays across the JS/WASM boundary once.
    /// Output order and per-placement counts are identical to sequential `add_model` calls.
    #[allow(clippy::too_many_arguments)]
    pub fn add_model_offsets(
        &mut self,
        face_count: u32,
        vx: &[i32],
        vy: &[i32],
        vz: &[i32],
        contour_y: &[i32],
        indices1: &[i32],
        indices2: &[i32],
        indices3: &[i32],
        colors1: &[i32],
        colors2: &[i32],
        colors3: &[i32],
        face_textures: &[i16],
        face_alphas: &[i8],
        priorities: &[i8],
        uvs: &[f32],
        offsets: &[i32],
        transparent: bool,
        reuse_vertices: bool,
    ) -> Result<Vec<u32>, JsError> {
        if offsets.len() % 3 != 0 {
            return Err(JsError::new("model offsets must be xyz triples"));
        }

        let mut counts = Vec::with_capacity(offsets.len() / 3);
        for offset in offsets.chunks_exact(3) {
            counts.push(self.add_model(
                face_count,
                vx,
                vy,
                vz,
                contour_y,
                indices1,
                indices2,
                indices3,
                colors1,
                colors2,
                colors3,
                face_textures,
                face_alphas,
                priorities,
                uvs,
                true,
                offset[0],
                offset[1],
                offset[2],
                transparent,
                reuse_vertices,
            )?);
        }
        Ok(counts)
    }
}

impl MeshPacker {
    #[allow(clippy::too_many_arguments)]
    #[inline]
    fn add_vertex(&mut self, x: i32, y: i32, z: i32, hsl: i32, alpha: i32, u: f32, v: f32, texture_index: i32, priority: i32, reuse: bool) -> u32 {
        let texture_index = if texture_index >= 1024 { -1 } else { texture_index };
        let textured = texture_index != -1;
        let mut hsl = hsl;
        if textured {
            hsl &= 127;
            hsl |= (texture_index & 0x1ff) << 7;
        }

        let x_pos = clamp_position(x);
        let y_pos = clamp_position(-y);
        let z_pos = clamp_position(z);
        let priority = (priority & 0x7) as u32;
        let u_packed = pack_uv(u);
        let v_packed = pack_uv(v);

        let w0 = (x_pos << 17) | ((u_packed & 0x3f) << 11) | v_packed;
        let w1 = y_pos | ((hsl as u32) << 15) | ((textured as u32) << 31);
        let w2 = (z_pos << 17)
            | ((alpha as u32) << 9)
            | (priority << 6)
            | ((((texture_index >> 9) & 1) as u32) << 5)
            | (u_packed >> 6);

        let mask = self.table.len() - 1;
        let mut slot = 0usize;
        if reuse {
            slot = slot_hash(w0, w1, w2) as usize & mask;
            loop {
                let entry = self.table[slot];
                if entry == 0 {
                    break;
                }
                let base = (entry as usize - 1) * WORDS_PER_VERTEX;
                if self.vertices[base] == w0 && self.vertices[base + 1] == w1 && self.vertices[base + 2] == w2 {
                    return entry - 1;
                }
                slot = (slot + 1) & mask;
            }
        }

        let index = (self.vertices.len() / WORDS_PER_VERTEX) as u32;
        self.vertices.extend_from_slice(&[w0, w1, w2]);
        if reuse {
            self.table[slot] = index + 1;
            self.table_count += 1;
            if self.table_count * 2 > self.table.len() {
                self.grow_table();
            }
        }
        index
    }

    fn grow_table(&mut self) {
        let mut table = vec![0u32; self.table.len() * 2];
        let mask = table.len() - 1;
        for &entry in &self.table {
            if entry == 0 {
                continue;
            }
            let base = (entry as usize - 1) * WORDS_PER_VERTEX;
            let mut slot =
                slot_hash(self.vertices[base], self.vertices[base + 1], self.vertices[base + 2]) as usize & mask;
            while table[slot] != 0 {
                slot = (slot + 1) & mask;
            }
            table[slot] = entry;
        }
        self.table = table;
    }
}
