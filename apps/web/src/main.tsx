import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Gallery } from "./Gallery";
import "./styles.css";

// ?galeria=1 shows every character, weapon and vehicle up close
const gallery = new URLSearchParams(location.search).has("galeria");
createRoot(document.getElementById("root")!).render(gallery ? <Gallery /> : <App />);
