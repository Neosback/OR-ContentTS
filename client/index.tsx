import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { STUDIO_HOME_PATH } from "./config/studioMode";
import "./index.css";
import { registerServiceWorker } from "./serviceWorkerRegistration";

const StudioHome = lazy(() => import("./studio/StudioHome"));
// Everything else boots the client: /map-editor, /play, and legacy world links.
const Page = lazy(() => import("./game/GamePage"));

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
root.render(
    // <React.StrictMode>
    <BrowserRouter>
        <Suspense fallback={<div className="page-loading">Loading…</div>}>
            <Routes>
                <Route path={STUDIO_HOME_PATH} element={<StudioHome />} />
                <Route path="*" element={<Page />} />
            </Routes>
        </Suspense>
    </BrowserRouter>,
    // </React.StrictMode>,
);


registerServiceWorker();
