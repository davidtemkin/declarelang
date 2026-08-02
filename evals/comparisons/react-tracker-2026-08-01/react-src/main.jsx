import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { boot } from "./store.js";
import "./styles.css";

createRoot(document.getElementById("root")).render(<App />);
boot();
