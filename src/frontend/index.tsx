import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@atyrode/excalidraw/index.css";
import "./index.scss";

import App from "./src/App";

// Surface any error that happens before React mounts (or outside its tree)
// to the main-process console-message forwarder, so renderer crashes leave
// a trace before the window reloads to a gray screen.
window.addEventListener("error", (event) => {
  console.error(String(event?.message || event?.error?.message || "error"), event?.error?.stack || "");
});
window.addEventListener("unhandledrejection", (event) => {
  console.error(`unhandledrejection: ${event?.reason?.stack || event?.reason}`);
});

const rootElement = document.getElementById("root")!;
const root = createRoot(rootElement);
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
