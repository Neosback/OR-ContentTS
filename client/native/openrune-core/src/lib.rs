//! OpenRune hot-path kernels (WebAssembly).
//!
//! Rules for every kernel in this crate:
//! - typed arrays in, typed arrays out, no state shared with JS beyond the explicit handles below;
//! - a TypeScript reference implementation exists and a parity test proves byte-identical output;
//! - the TS path stays as the fallback when the module cannot be loaded.

mod mesh_pack;

mod slot_mesh;

pub use mesh_pack::MeshPacker;
pub use slot_mesh::SlotMeshOutput;
