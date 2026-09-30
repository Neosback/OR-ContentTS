/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_IS_LOCAL?: string;
}

/** Wallpaper Engine hooks the renderers read (set by the shell). */
interface Window {
    wallpaperFpsLimit?: number;
    wallpaperPropertyListener?: unknown;
    wallpaperRegisterAudioListener?: unknown;
}
