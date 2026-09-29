<script lang="ts">
    import { GAME_CLIENT_PATH, MAP_EDITOR_PATH } from "../config/studioMode";

    type StudioTool = {
        name: string;
        description: string;
        /** Absent until the tool exists. */
        href?: string;
    };

    const tools: StudioTool[] = [
        {
            name: "Map Editor",
            description: "Terrain, objects, NPC spawns and zones, rendered with the game's own scene code.",
            href: MAP_EDITOR_PATH,
        },
        { name: "Definitions", description: "Objects, NPCs, items and their configs." },
        { name: "Models & Animations", description: "Model viewer, recolours and sequences." },
        { name: "Interfaces", description: "Widget trees and CS2 scripts." },
    ];
</script>

<!-- Tools are plain links: each tool boots its own page (the map editor starts the game client). -->
<div class="home">
    <header>
        <h1>OpenRune Content Studio</h1>
        <p>Pick a tool to open.</p>
    </header>
    <ul class="tools">
        {#each tools as tool (tool.name)}
            <li>
                {#if tool.href}
                    <a class="tool" href={tool.href}>
                        <span class="name">{tool.name}</span>
                        <span class="description">{tool.description}</span>
                    </a>
                {:else}
                    <div class="tool planned" aria-disabled="true">
                        <span class="name">{tool.name}<span class="badge">Planned</span></span>
                        <span class="description">{tool.description}</span>
                    </div>
                {/if}
            </li>
        {/each}
    </ul>
    <footer>
        <a href={GAME_CLIENT_PATH}>Open legacy game client</a>
    </footer>
</div>

<style>
    .home {
        box-sizing: border-box;
        height: 100%;
        overflow-y: auto;
        padding: 48px 16px;
        background: var(--studio-bg);
        color: var(--studio-text);
        font-family: var(--studio-font);
        user-select: text;
        -webkit-user-select: text;
    }

    header,
    .tools,
    footer {
        max-width: 880px;
        margin: 0 auto;
    }

    h1 {
        margin: 0 0 6px;
        font-size: 28px;
        font-weight: 600;
        letter-spacing: -0.01em;
    }

    header p {
        margin: 0;
        color: var(--studio-muted);
    }

    .tools {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: 12px;
        padding: 0;
        margin-top: 32px;
        list-style: none;
    }

    .tool {
        display: flex;
        flex-direction: column;
        gap: 6px;
        box-sizing: border-box;
        height: 100%;
        padding: 18px;
        border: 1px solid var(--studio-border);
        border-radius: 8px;
        background: var(--studio-surface);
        color: inherit;
        text-decoration: none;
    }

    a.tool:hover,
    a.tool:focus-visible {
        background: var(--studio-surface-2);
        border-color: var(--studio-accent);
        outline: none;
    }

    .name {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 16px;
        font-weight: 600;
    }

    .description {
        color: var(--studio-muted);
        font-size: 14px;
        line-height: 1.4;
    }

    .planned {
        opacity: 0.55;
    }

    .badge {
        padding: 1px 6px;
        border: 1px solid var(--studio-border);
        border-radius: 4px;
        color: var(--studio-muted);
        font-size: 11px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }

    footer {
        margin-top: 32px;
        font-size: 13px;
    }

    footer a {
        color: var(--studio-muted);
    }
</style>
