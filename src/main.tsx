import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import ErrorBoundary from "./components/ui/ErrorBoundary.tsx";
import "./styles.css";

// Outer boundary: App.tsx already wraps its content, but the header and the
// root render live outside that one. Any render error there used to unmount
// the entire tree with no fallback at all (issue #11 white screen).
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
