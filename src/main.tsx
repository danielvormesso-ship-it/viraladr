import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Capture UTM from URL before any redirects strip them
(() => {
  const params = new URLSearchParams(window.location.search);
  const source = params.get('utm_source');
  const medium = params.get('utm_medium');
  const campaign = params.get('utm_campaign');
  if (source || medium || campaign) {
    sessionStorage.setItem('utm', JSON.stringify({ source, medium, campaign }));
  }
})();

createRoot(document.getElementById("root")!).render(<App />);
