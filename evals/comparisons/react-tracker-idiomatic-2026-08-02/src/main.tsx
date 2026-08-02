import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { SCALES, useTrackerStore } from "./store/trackerStore";
import "./styles/global.css";

// Kick the fetch off before the first render rather than from an effect: it
// starts a frame earlier, and it is not repeated by StrictMode's double-invoke.
void useTrackerStore.getState().loadScale(SCALES[0]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
