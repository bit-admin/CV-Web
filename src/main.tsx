import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { ConfirmProvider } from "./components/ConfirmDialog";
import { MobileBlocker } from "./components/MobileBlocker";
import "./styles.css";

const App = lazy(() => import("./App").then((m) => ({ default: m.App })));

const isMobile = window.matchMedia("(max-width: 768px)").matches;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isMobile ? (
      <MobileBlocker />
    ) : (
      <Suspense>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </Suspense>
    )}
  </StrictMode>
);
