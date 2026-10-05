import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // host: true lets a phone on the same Wi-Fi open the dev server at http://<ip of the computer>:5183
  server: { port: 5183, host: true },
});
