export const checkIphone = () => {
    const u = navigator.userAgent;
    return !!u.match(/iPhone/i);
};
export const checkAndroid = () => {
    const u = navigator.userAgent;
    return !!u.match(/Android/i);
};
export const checkIpad = () => {
    const u = navigator.userAgent;
    return !!u.match(/iPad/i);
};
export const checkMobile = () => {
    const u = navigator.userAgent;
    return !!u.match(/Android/i) || !!u.match(/iPhone/i);
};

export function checkIos() {
    // iPad on iOS 13 detection
    const isIpad = navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints >= 1;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || isIpad;
}

export const isIos = checkIos();

export const isWallpaperEngine = !!window.wallpaperRegisterAudioListener;

export const isTouchDevice = !!(
    navigator.maxTouchPoints || "ontouchstart" in document.documentElement
);

let webGL2Supported: boolean | undefined;

/**
 * Probes once, on first use. The probe context is released immediately: creating it at module load kept a second
 * WebGL context (and its GPU memory) alive for the whole page for a check that only the map viewer needs.
 */
export function isWebGL2Supported(): boolean {
    if (webGL2Supported === undefined) {
        const gl = document.createElement("canvas").getContext("webgl2");
        webGL2Supported = !!gl;
        gl?.getExtension("WEBGL_lose_context")?.loseContext();
    }
    return webGL2Supported;
}

export const isWebGPUSupported = "gpu" in navigator;

export const pixelRatio = window.devicePixelRatio || 1;
