import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { registerMediaCache } from "./features/media/registerMediaCache";
import "./styles.css";

async function start() {
  const isLab =
    import.meta.env.DEV && window.location.pathname === "/embed-lab";
  const content = isLab ? (
    React.createElement((await import("./pages/EmbedLab")).EmbedLab)
  ) : (
    <RouterProvider router={(await import("./app/router")).router} />
  );
  if (!isLab) registerMediaCache();
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>{content}</React.StrictMode>,
  );
}
void start();
