# First-party OpenRune server support: audit and plan

Findings from three read-only audits (TS decoders vs `OpenRune-FileStore-main`, the server's `or-cache` and content layout, and the
`backend/` + client file layers). Nothing here is built yet; it is the basis for choosing the first milestone.

## 1. Are the TypeScript decoders on par with the FileStore?

**No. The TS side is a read-only, render-oriented decoder; the FileStore is a full read/write library.**

| Gap | Detail |
|---|---|
| No write path | No Container/Archive/ReferenceTable encode, no CRC / whirlpool, no `idx255` rebuild, no `encode()` on any config type (FileStore has encoders for every codec, except `UnderlayCodec.encode` which is a TODO there). |
| Revision | The bundled cache is rev 237; the server targets rev 240. NPC opcodes 124/126/148-152 are missing and NPC opcode 150 is read in the wrong (non-OSRS) format; ObjType 43 and 160 throw "not implemented"; ObjType 200-202 and NPC 251-253 use the pre-237 entity-ops layout; ParamType 7/8 missing (type stays undefined on 237+). |
| Lossy decode | Fields are read and dropped (Loc 69/91/93/95/96, Seq 16/18, NPC sound/fade ops, SpotAnim 9/10, Idk 5), so decode-edit-encode cannot round-trip. |
| Missing types | DBTable, DBRow, DBTableIndex (the server stores its content tables there), HitSplat, HealthBar, Ambience, WorldEntity, VarClan(Settings), StringVector, BugTemplate, Font, WorldMapArea, midi/vorbis. |
| Server custom archives | Index 2 groups 58-87 (npc 58, item 59, inv 60, mesanim 61, stat 63, projanim 64, bas 65, varp 67, walktrigger 68, varn 82, varnbit 83, varconbit 84, varcon 85, varobj 86, hunt 87) and custom var literals 253/254 have no TS model. |
| Container / index | No LZMA; `IndexType` lacks 23 (INTERFACES2) and 25 (MODELSRT7); no `.rscm`, `gamevals.toml`, `max-ids.toml` or `gamevals_generated.dat` reader/writer. |
| Models | No particle / billboard / emissive data (FileStore `ModelCodec` v14/15). |

Where TS is fine: Loc/Seq/Overlay/Enum/Struct/Var* decode matches FileStore for what the renderer needs; components v1/v3 and sprites decode.

## 2. What the server keeps outside the cache (all under `OpenRune-Server-main`)

- `.data/raw-cache/server/*.toml`: items, npcs, loc, enums, varbit/varp/varn/varcon, inv, bas, hunt, mesanim, walktrigger, stats, projectiles, param, shops/, slayer/ (`[[item]] id = "obj.x"`, `inherit`, `[item.params]`).
- `.data/raw-cache/map/{area,npcs,objs}/*.toml` (spawns and areas), `.data/raw-cache/examines/*.csv`.
- `.data/gamevals/*.rscm` (`name=id`), `**/resources/gamevals.toml`, `.data/gamevals-binary/max-ids.toml`, `gamevals_generated.dat`.
- Plugin packs: `<plugin>/pack/src/main/resources/pack/{configs,models,sprites,cs2,interfaces}`.
- The binary cache is generated: `.data/cache/LIVE` (client) and `.data/cache/SERVER` (stripped). The server has no hot reload; Gradle `buildCache` rewrites the cache.

## 3. Architecture (recommendation)

Existing policy (`docs/STUDIO_BACKEND_INTEGRATION.md`): source-first, backend optional and not a file transport, no Studio-specific
changes to the server. The audits support keeping that:

1. **Source-first.** Studio reads and writes the TOML / rscm / gamevals sources; `LIVE` and `SERVER` caches stay read-only generated outputs.
2. **`ProjectFileSystem` stays the single boundary** (Tauri adapter primary, browser File System Access as progressive enhancement, import/export as fallback).
3. **Harden Tauri writes** in `client/src-tauri/src/access.rs`: temp file in the same folder, fsync, rename; backup copy; an `expected` mtime/hash precondition that returns a CONFLICT error; mkdir.
4. **Extend the contract**: CONFLICT error code, `stat` with mtime and size, optional `expected` on `writeText`/`writeBytes` (in-memory, Tauri and FSA adapters).
5. **File watching**: the `notify` crate in Tauri with debounce, wired to `OpenRuneProjectSession.refresh()`; mtime polling in the browser.
6. **Rebuild through the existing path**: after TOML edits call the backend's allowlisted `:or-cache:buildCache`, then reload `LIVE` read-only; warn that the running server needs a restart.
7. **No new file-server backend.** If a headless/web deployment is ever needed, a thin companion exposing the same `ProjectFileSystem` contract with Origin and token checks, not StudioService.
8. **Decoders**: bring TS to rev 240 first (NPC 124/126/148-152, Obj 43/160, entity-ops, Param 7/8), stop discarding fields, then add DBTable/DBRow and the server's custom config archives as read-only; encoders come with the first feature that writes the binary cache (it likely will not: the server packs it).

## 4. Suggested first milestone (desktop)

Open `OpenRune-Server-main` through the grant flow; atomic + conflict-checked + backed-up writes; edit an item in `.data/raw-cache/server/items.toml`
through the existing source-aware writers; detect external changes; trigger `buildCache`; reload `LIVE`.

### Status: desktop source-first editing (implemented)

- **Safe writes (Tauri).** `fs_write_text` / `fs_write_file` write a temp file next to the target, fsync, then rename; file permissions are kept.
  `expected_mtime_ms` / `must_not_exist` turn a stale write into a `CONFLICT:` error. Before a file is replaced it is copied to
  `<app data>/backups/<hash of path>/<name>.<ms>.bak` (newest 10 kept, never inside the server checkout). `fs_mkdir` is new. All of it stays inside granted folders.
- **Contract.** `ProjectFileSystem.writeText/writeBytes(path, data, { expectedModifiedAt, backup })`, error code `CONFLICT`, optional `watch()`.
  Implemented by the in-memory, scoped, browser (compares `lastModified`, no backup) and Tauri adapters.
- **Watching.** `watch.rs` runs one debounced (300 ms) recursive watcher per granted folder and emits `project-fs-changed`; `.git`, `.gradle`, `build`,
  `node_modules` and our own temp files are ignored (judged below the watched root). The Tauri adapter drops events caused by its own writes.
  `OpenRuneProjectSession.watch()` re-indexes when source files change (`*.toml`, `*.rscm`, `*.yml`, `.data/gamevals/**`); changes under
  `.data/cache/**` are reported as `cacheChanged` without a re-index. `active-openrune-project-runtime` follows its session and publishes the new snapshot
  (`subscribeOpenRuneProjectExternalChanges` for UI that wants the paths).
- **Race-free writers.** `updateOpenRuneServerField`, `updateOpenRuneConfigField`, `replaceOpenRuneServerSourceFile` stat before reading and write with that
  stamp; a lost race surfaces as the existing `STALE_SOURCE` error (`SOURCE_EXISTS` for a new file that appeared meanwhile).
- **UI.** `/server` (sidebar "Server"): table list with counts, searchable virtualized definition list, field editor for plain top-level scalars
  (identity fields, arrays and nested tables are shown read-only), per-field Save/Revert, "changed on disk" banner with Reload.
  Logic lives in `project/openrune-server-content.ts`.
- **Verified:** `cargo test` (14, including a real watcher on a temp folder), vitest (writer races, session/runtime watch), and the screen driven in the browser
  pane against an in-memory project. Not yet driven in the native app against a real server checkout (needs the native folder dialog).
- **Still open:** Build cache button (`StudioBackendClient` + `:or-cache:buildCache`), decoder parity to rev 240 + DBTable/DBRow, browser-only mtime polling.

