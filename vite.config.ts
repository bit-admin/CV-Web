import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // `npm run dev:api` serves the sync API (the Worker) on port 8787.
  server: {
    proxy: { "/api": "http://127.0.0.1:8787" }
  },
  test: {
    environment: "jsdom",
    globals: true
  }
});
