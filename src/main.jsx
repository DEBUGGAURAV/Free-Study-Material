import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import GlobalErrorBoundary from "./components/GlobalErrorBoundary";
import { initAntiTamperDefense } from "./utils/antiTamperDefense";
import "./styles.css";

// 🛡️ Initialize Client-Side Anti-Tamper & Zero-Trust Defense Engine
initAntiTamperDefense();

const rootElement = document.getElementById("root");

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <GlobalErrorBoundary>
        <App />
      </GlobalErrorBoundary>
    </React.StrictMode>
  );
}
