# OpenRune project setup

How Studio finds, opens and reports on an OpenRune Server project.

## Picking the folder

`project/openrune-project-locator.ts` decides what the picked folder is:

- **The repository root** (has `settings.gradle(.kts)` plus an `or-cache` module, a `.data` folder or `game.yml`): used as is.
- **A folder that contains a project** (a workspace folder): searched up to two levels down (skipping `build`, `.git`, `node_modules`, `.data`, caches; at most 150 folders). One match is used automatically, several are offered as choices. The project then becomes its own root through `ScopedProjectFileSystem`, or through its own path/handle on desktop and in the browser.
- **Anything else** is rejected with a reason: unreadable folder, empty folder, "looks like a single Gradle module, choose the repository root", "has settings.gradle.kts but nothing that identifies OpenRune Server", or "no Gradle project here", each listing what was found and what was expected.

Access can never extend above the picked folder, so a folder *inside* a project cannot be recovered; the message says to choose the repository root.

On desktop, if the app has no access to the folder yet, the picker opens again at that folder (see Settings > Folder access) and the check is retried once.

## What setup reads

After a project is accepted, setup opens a full `OpenRuneProjectSession` (project index, GameVals, config/map/server TOML) and shows a short summary in the dialog: the capability chips and whether LIVE exists. Name and revision are filled from `game.yml`; name, icon and description are optional and folded away.

## The project overview

`project/openrune-project-overview.ts` turns a session snapshot into data (counts per source, a capability list, grouped issues). It is shown in `OpenRuneProjectDialog`:

- automatically after a new OpenRune setup is added,
- from the **Project overview** button on every OpenRune setup card.

Each capability is marked **In use** or **Loaded**, plus **Ready / Partly there / Not available** with an actionable explanation. The Interface Editor now uses both LIVE/cache data and the retained project's GameVal/RSCM metadata projection; map editing remains cache/runtime driven while OpenRune NPC/ground-Obj/Area TOML sources are indexed for source-aware workflows.

## Handoff note

Setup is no longer the next architectural blocker. Preserve its single-root authority and retained-session behavior while adding new editors. A Basic Cache must clear active OpenRune project metadata, and switching OpenRune roots must never expose stale metadata from the previous project.
