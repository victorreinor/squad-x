import { createRoot } from "react-dom/client";
import { App } from "./App";
import { BossArena } from "./BossArena";
import { Gallery } from "./Gallery";
import "./styles.css";

// ?galeria=1 shows every character, weapon and vehicle up close; ?chefao=yeti goes straight to a fight with one boss
const params = new URLSearchParams(location.search);
createRoot(document.getElementById("root")!).render(params.has("galeria") ? <Gallery /> : params.has("chefao") ? <BossArena /> : <App />);
