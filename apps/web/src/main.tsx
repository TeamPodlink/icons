import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./globals.css";
import { App } from "./app";

// Data router (not <BrowserRouter>) so navigations can opt into the View
// Transitions morph — a data-router-only feature. A single splat route
// renders <App/>, which keeps the descendant-<Routes> background-location
// pattern (grid + modal) exactly as before.
const router = createBrowserRouter([{ path: "*", Component: App }]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
