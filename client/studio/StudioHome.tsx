import { GAME_CLIENT_PATH, MAP_EDITOR_PATH } from "../config/studioMode";
import "./StudioHome.css";

type StudioTool = {
    name: string;
    description: string;
    /** Absent until the tool exists. */
    href?: string;
};

const TOOLS: StudioTool[] = [
    {
        name: "Map Editor",
        description: "Terrain, objects, NPC spawns and zones, rendered with the game's own scene code.",
        href: MAP_EDITOR_PATH,
    },
    { name: "Definitions", description: "Objects, NPCs, items and their configs." },
    { name: "Models & Animations", description: "Model viewer, recolours and sequences." },
    { name: "Interfaces", description: "Widget trees and CS2 scripts." },
];

/**
 * Studio landing page. Tools are plain links, not router links: the client
 * decides its boot mode from the URL once, when its module first loads.
 */
export default function StudioHome() {
    return (
        <div className="studio-home">
            <header className="studio-home__header">
                <h1>OpenRune Content Studio</h1>
                <p>Pick a tool to open.</p>
            </header>
            <ul className="studio-home__tools">
                {TOOLS.map((tool) => (
                    <li key={tool.name}>
                        {tool.href ? (
                            <a className="studio-tool" href={tool.href}>
                                <span className="studio-tool__name">{tool.name}</span>
                                <span className="studio-tool__description">{tool.description}</span>
                            </a>
                        ) : (
                            <div className="studio-tool studio-tool--planned" aria-disabled="true">
                                <span className="studio-tool__name">
                                    {tool.name}
                                    <span className="studio-tool__badge">Planned</span>
                                </span>
                                <span className="studio-tool__description">{tool.description}</span>
                            </div>
                        )}
                    </li>
                ))}
            </ul>
            <footer className="studio-home__footer">
                <a href={GAME_CLIENT_PATH}>Open legacy game client</a>
            </footer>
        </div>
    );
}
