import { Bzip2 } from "../rs/compression/Bzip2";
import { Gzip } from "../rs/compression/Gzip";
import { installUiDiagnostic } from "../ui/UiScaleDiagnostic";
import OsrsClientApp from "./OsrsClientApp";

Bzip2.initWasm();
Gzip.initWasm();
installUiDiagnostic();

try {
    const params = new URLSearchParams(window.location.search);
    if (params.has("debugResize")) {
        (window as any).__RESIZE_DEBUG__ = true;
        console.log("[resize] debug enabled via ?debugResize");
    }
} catch {}

export default function GamePage() {
    return <OsrsClientApp />;
}
