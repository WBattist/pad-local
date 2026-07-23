import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@atyrode/excalidraw/index.css";
import "./index.scss";

import App from "./src/App";

const rootElement = document.getElementById("root")!;
const root = createRoot(rootElement);
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
