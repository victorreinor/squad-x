import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    // The service worker keeps a copy of the whole game (it is one page, one script, one stylesheet and the icons), so
    // it opens and plays with no network after the first visit. Only the production build gets one: the dev server
    // never caches.
    VitePWA({
      injectRegister: "script",
      // the manifest is a plain file in public/, next to the icons
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,webmanifest}"],
        // the bundle is about 1.1 MB and the default limit is 2 MiB: over it the file is left out and offline breaks
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        // A new version is downloaded in the background and takes over at once, so it is what the next opening (or
        // reload) shows. Nothing reloads the page by itself: a deploy never restarts a run. This is safe while the
        // game is a single script; with lazy chunks, a page still running the old version could ask for a file the
        // new worker has already thrown away.
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  // host: true lets a phone on the same Wi-Fi open the dev server at http://<ip of the computer>:5183
  server: { port: 5183, host: true },
});
