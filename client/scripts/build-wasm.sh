#!/usr/bin/env bash
# Builds native/openrune-core to WebAssembly and writes the bundle to src/wasm/openrune-core.
# The output is committed: CI/Vercel has no Rust toolchain, so only people changing the Rust code run this.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=src/wasm/openrune-core
( cd native && wasm-pack build openrune-core --target web --release --no-pack --out-dir ../../$OUT --out-name openrune_core )
rm -f "$OUT/.gitignore" "$OUT/package.json" "$OUT/README.md"

if command -v wasm-opt >/dev/null 2>&1; then
    before=$(wc -c < "$OUT/openrune_core_bg.wasm")
    wasm-opt -O3 --enable-bulk-memory --enable-bulk-memory-opt --enable-nontrapping-float-to-int --enable-sign-ext --enable-mutable-globals --enable-multivalue --enable-reference-types "$OUT/openrune_core_bg.wasm" -o "$OUT/openrune_core_bg.wasm"
    echo "wasm-opt: $before -> $(wc -c < "$OUT/openrune_core_bg.wasm") bytes"
fi
ls -l "$OUT"
