
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { applyPageMetadata, getPageMetadata } from "./seoMetadata.js";

const rootElement = document.getElementById("root");
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

const currentPath = window.location.pathname.length > 1
  ? window.location.pathname.replace(/\/+$/, "")
  : window.location.pathname;
applyPageMetadata(getPageMetadata(currentPath));

if (rootElement.dataset.prerenderedRoute === currentPath && rootElement.hasChildNodes()) {
  hydrateRoot(rootElement, app);
} else {
  rootElement.replaceChildren();
  createRoot(rootElement).render(app);
}
