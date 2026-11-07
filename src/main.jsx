// 🧭 Safari / WebKit Polyfills (Promise.withResolvers & URL.parse for PDF.js v6 + Circle Search)
import "./utils/safariCompat";

// 🛡️ Initialize Client-Side Anti-Tamper & Zero-Trust Defense Engine FIRST before other modules
import { initAntiTamperDefense } from "./utils/antiTamperDefense";
initAntiTamperDefense();

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import GlobalErrorBoundary from "./components/GlobalErrorBoundary";
import "katex/dist/katex.min.css";
import "./styles.css";

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
