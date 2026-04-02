import { Routes, Route, Navigate } from "react-router";
import { HomePage } from "./pages/HomePage";
import { DocPage } from "./pages/DocPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/doc/:docId" element={<DocPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
