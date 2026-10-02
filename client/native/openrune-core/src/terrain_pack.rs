//! Batched terrain vertex packing for editor paint flushes.
//!
//! The TypeScript renderer stores each terrain tile in a fixed 36-vertex slot.
//! Every vertex is four little-endian u16 words: x, z, hsl/light, texture index + 1.
//! Unused vertices in each slot remain zero so replacing a shorter tile clears stale geometry.

use wasm_bindgen::prelude::*;

const TILE_MAX_VERTICES: usize = 36;
const VERTEX_STRIDE: usize = 8;
const TILE_BYTES: usize = TILE_MAX_VERTICES * VERTEX_STRIDE;

#[inline]
fn write_u16(out: &mut [u8], offset: usize, value: u16) {
    let bytes = value.to_le_bytes();
    out[offset] = bytes[0];
    out[offset + 1] = bytes[1];
}

/// Packs flattened terrain vertices into fixed-size per-tile slots.
///
/// `tile_counts` gives the number of vertices for each tile in order. The four
/// vertex arrays are concatenated in that same tile order. Output is exactly
/// `tile_counts.len() * 36 * 8` bytes and is byte-identical to
/// `TerrainVertexBuffer.addVertex` followed by a zero-filled tile upload.
#[wasm_bindgen]
pub fn pack_terrain_vertex_batch(
    tile_counts: &[u32],
    xs: &[i32],
    zs: &[i32],
    hsls: &[i32],
    texture_indices: &[i32],
) -> Result<Vec<u8>, JsError> {
    let vertex_count = xs.len();
    if zs.len() != vertex_count || hsls.len() != vertex_count || texture_indices.len() != vertex_count {
        return Err(JsError::new("terrain vertex arrays must have equal lengths"));
    }

    let expected_vertices: usize = tile_counts.iter().map(|&count| count as usize).sum();
    if expected_vertices != vertex_count {
        return Err(JsError::new("terrain tile counts do not match vertex array length"));
    }

    if tile_counts.iter().any(|&count| count as usize > TILE_MAX_VERTICES) {
        return Err(JsError::new("terrain tile exceeds the 36-vertex slot"));
    }

    let mut out = vec![0u8; tile_counts.len() * TILE_BYTES];
    let mut source = 0usize;

    for (tile_index, &count) in tile_counts.iter().enumerate() {
        let tile_base = tile_index * TILE_BYTES;
        for local in 0..count as usize {
            let texture_index = texture_indices[source];
            let hsl = if texture_index != -1 {
                hsls[source] & 127
            } else {
                hsls[source]
            };
            let base = tile_base + local * VERTEX_STRIDE;

            write_u16(&mut out, base, xs[source] as u16);
            write_u16(&mut out, base + 2, zs[source] as u16);
            write_u16(&mut out, base + 4, hsl as u16);
            write_u16(
                &mut out,
                base + 6,
                texture_index.wrapping_add(1) as u16,
            );
            source += 1;
        }
    }

    Ok(out)
}
