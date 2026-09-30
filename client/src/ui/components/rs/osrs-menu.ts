import type { MenuEntry } from "../../../rs/MenuEntry";

export interface OsrsMenuEntry extends MenuEntry {
    onClick?: (entry: MenuEntry) => void;
}

export interface OsrsMenuProps {
    x: number;
    y: number;
    entries: OsrsMenuEntry[];
    tooltip: boolean;
    debugId: boolean;
}
