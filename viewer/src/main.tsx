import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { installColumnResize } from "./lib/columnResize";
import "./fonts.css";
import "./styles.css";
import "./ledger.css";

installColumnResize();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
