import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import GlobalErrorBoundary from "./components/GlobalErrorBoundary";
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
