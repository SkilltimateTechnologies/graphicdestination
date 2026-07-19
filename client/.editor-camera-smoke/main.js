
import { createElement as h } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import GraphicDestinationMotion from "../src/components/GraphicDestinationMotion.jsx";
createRoot(document.getElementById("root")).render(h(GraphicDestinationMotion));
window.__ready = true;
