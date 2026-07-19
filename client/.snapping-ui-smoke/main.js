
import { createElement as h } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import GraphicDestinationMotion from "../src/components/GraphicDestinationMotion.jsx";
createRoot(document.getElementById("root")).render(h(GraphicDestinationMotion, {
  initialProject: {"app":"graphic-destination-motion","v":5,"stage":{"w":1280,"h":720,"dur":6000},"objects":[{"id":"ob1","type":"shape","name":"A","tracks":{},"locked":false,"hidden":false,"props":{"shape":"rect","x":400,"y":300,"w":200,"h":100,"scale":1,"rotation":0,"opacity":1,"fill":"#5B8CFF","fillMode":"fill","sC":"#FFB224","sW":3,"cornerR":0,"inT":0,"outT":null,"path":null,"prog":0}},{"id":"ob2","type":"shape","name":"B","tracks":{},"locked":false,"hidden":false,"props":{"shape":"rect","x":900,"y":550,"w":120,"h":120,"scale":1,"rotation":0,"opacity":1,"fill":"#6EE7B7","fillMode":"fill","sC":"#FFB224","sW":3,"cornerR":0,"inT":0,"outT":null,"path":null,"prog":0}}]},
  onChange: (json) => { window.__lastProject = json; },
}));
window.__ready = true;
