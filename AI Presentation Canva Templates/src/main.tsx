import "./index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import posthog from "posthog-js";
import { PostHogProvider } from "@posthog/react";

// Initialize PostHog
posthog.init("phc_o7fjTOIWSN6rkQkNRKRCr0PBk3ZhYh62a5QpyvfPVgR", {
  api_host: "https://us.i.posthog.com",
  person_profiles: "identified_only",
});

// Dynamic basename calculation based on current URL
function getBasename(): string {
  const { host, pathname } = window.location;

  // If index.html is in the path, remove it so / works correctly (preserve query string)
  if (pathname.endsWith("/index.html")) {
    const newPath = pathname.slice(0, -10) + (window.location.search || "");
    window.history.replaceState({}, "", newPath);
  }

  // Check if environment variable is set first
  const envBasePath = import.meta.env.VITE_BASE_PATH;
  if (envBasePath) {
    return envBasePath;
  }

  // When embedded in chatgpt-app at /canva-app/ (current shell) or
  // /canva-editor/ (legacy), use that as the router basename so the route
  // `/` correctly resolves and the AIPresentationView renders.
  if (pathname.startsWith("/canva-app")) {
    return "/canva-app";
  }
  if (pathname.startsWith("/canva-editor")) {
    return "/canva-editor";
  }

  // If the host is flyingfox.canva-experiments.com, then the basename should be window.location.pathname without the /index.html
  if (host === "flyingfox.canva-experiments.com") {
    return pathname.replace("/index.html", "");
  }

  // Default to root
  return "/";
}

const basename = getBasename();

console.info("basename", basename);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PostHogProvider client={posthog}>
      <BrowserRouter basename={basename}>
        <App />
      </BrowserRouter>
    </PostHogProvider>
  </React.StrictMode>
);
