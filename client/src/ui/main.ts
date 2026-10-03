import "@fontsource-variable/inter";
import "@fontsource/cinzel/400.css";
import "@fontsource/cinzel/600.css";
import "@fontsource/cinzel/700.css";
import "../styles/globals.css";

import { mount } from "svelte";

import { Bzip2 } from "../rs/compression/Bzip2";
import App from "./App.svelte";
import { installDevLogBridge } from "../lib/tauri/dev-log-bridge";
import { settings } from "./lib/settings.svelte";

installDevLogBridge();
void Bzip2.initWasm();

(window as unknown as { wallpaperPropertyListener?: unknown }).wallpaperPropertyListener = {
    applyGeneralProperties: (properties: { fps?: number }) => {
        if (properties.fps) window.wallpaperFpsLimit = properties.fps;
    },
};

settings.apply();
mount(App, { target: document.getElementById("root") as HTMLElement });
