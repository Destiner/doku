import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { CwdProvider } from "./contexts/CwdContext";
import "./variables.css";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <CwdProvider>
      <App />
    </CwdProvider>
  </BrowserRouter>,
);
