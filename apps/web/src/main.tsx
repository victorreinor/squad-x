import { createRoot } from "react-dom/client";
import { App } from "./App";
import { BossArena } from "./BossArena";
import { Gallery } from "./Gallery";
import { Siege } from "./game/SiegeGame";
import "./styles.css";

// ?galeria=1 shows every character, weapon and vehicle up close; ?chefao=yeti goes straight to a fight with one boss;
// ?modo=cerco and ?modo=muralha are the two test modes of the castle bridge
const params = new URLSearchParams(location.search);
createRoot(document.getElementById("root")!).render(params.has("galeria") ? <Gallery /> : params.has("chefao") ? <BossArena /> : params.get("modo") === "cerco" || params.get("modo") === "muralha" ? <Siege mode={params.get("modo") as "cerco" | "muralha"} /> : <App />);
