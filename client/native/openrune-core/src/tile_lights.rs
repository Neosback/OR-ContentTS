//! Terrain light calculation for one scene plane.
//!
//! This is the numeric inner loop from `Scene.calculateTileLights`: height gradients,
//! normalized tile normals, directional lighting, and optional light occlusion.
//! Input planes are flattened in x-major order.

use wasm_bindgen::prelude::*;

const LIGHT_DIR_X: i32 = -50;
const LIGHT_DIR_Y: i32 = -10;
const LIGHT_DIR_Z: i32 = -50;
const LIGHT_INTENSITY_BASE: i32 = 96;
const LIGHT_INTENSITY_FACTOR: i32 = 768;
const HEIGHT_SCALE: i32 = 65536;

#[inline]
fn plane_index(x: usize, y: usize, stride_y: usize) -> usize {
    x * stride_y + y
}

#[wasm_bindgen]
pub fn calculate_tile_lights(
    size_x: u32,
    size_y: u32,
    heights: &[i32],
    occlusions: &[u8],
    ignore_occlusion: bool,
) -> Result<Vec<i32>, JsError> {
    let size_x = size_x as usize;
    let size_y = size_y as usize;
    let source_stride_y = size_y + 1;
    let expected_source = (size_x + 1) * source_stride_y;

    if heights.len() != expected_source {
        return Err(JsError::new("tile light height plane has the wrong size"));
    }
    if !ignore_occlusion && occlusions.len() != expected_source {
        return Err(JsError::new("tile light occlusion plane has the wrong size"));
    }

    let light_magnitude = (((LIGHT_DIR_X * LIGHT_DIR_X
        + LIGHT_DIR_Y * LIGHT_DIR_Y
        + LIGHT_DIR_Z * LIGHT_DIR_Z) as f64)
        .sqrt()) as i32;
    let light_intensity = (light_magnitude * LIGHT_INTENSITY_FACTOR) >> 8;

    let mut lights = vec![0i32; size_x * size_y];

    if size_x < 3 || size_y < 3 {
        return Ok(lights);
    }

    for x in 1..size_x - 1 {
        for y in 1..size_y - 1 {
            let height_delta_x = heights[plane_index(x + 1, y, source_stride_y)]
                - heights[plane_index(x - 1, y, source_stride_y)];
            let height_delta_y = heights[plane_index(x, y + 1, source_stride_y)]
                - heights[plane_index(x, y - 1, source_stride_y)];

            let tile_normal_length = (((height_delta_y as f64) * (height_delta_y as f64)
                + (height_delta_x as f64) * (height_delta_x as f64)
                + HEIGHT_SCALE as f64)
                .sqrt()) as i32;

            let normalized_x = height_delta_x.wrapping_shl(8) / tile_normal_length;
            let normalized_y = HEIGHT_SCALE / tile_normal_length;
            let normalized_z = height_delta_y.wrapping_shl(8) / tile_normal_length;

            let dot = normalized_x * LIGHT_DIR_X
                + normalized_y * LIGHT_DIR_Y
                + normalized_z * LIGHT_DIR_Z;
            let sun_light = dot / light_intensity + LIGHT_INTENSITY_BASE;

            let light_occlusion = if ignore_occlusion {
                0
            } else {
                ((occlusions[plane_index(x - 1, y, source_stride_y)] as i32) >> 2)
                    + ((occlusions[plane_index(x, y - 1, source_stride_y)] as i32) >> 2)
                    + ((occlusions[plane_index(x + 1, y, source_stride_y)] as i32) >> 3)
                    + ((occlusions[plane_index(x, y + 1, source_stride_y)] as i32) >> 3)
                    + ((occlusions[plane_index(x, y, source_stride_y)] as i32) >> 1)
            };

            lights[plane_index(x, y, size_y)] = sun_light - light_occlusion;
        }
    }

    Ok(lights)
}
