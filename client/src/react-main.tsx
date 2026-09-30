import "@fontsource-variable/inter";
import "@fontsource/cinzel/400.css";
import "@fontsource/cinzel/600.css";
import "@fontsource/cinzel/700.css";
import "./styles/globals.css";

import { createRoot } from "react-dom/client";

import { LegacySpaRoot } from "./components/LegacySpaRoot";
import { Toaster } from "./components/ui/sonner";

createRoot(document.getElementById("root") as HTMLElement).render(
    <>
        <LegacySpaRoot />
        <Toaster />
    </>,
);
