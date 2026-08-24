/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5175,
    strictPort: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/setupTests.ts",
    // e2e/ holds Playwright specs, run by `npm run e2e`. Vitest's default
    // include globs collect them too, and they throw on import — which left
    // `vitest run` permanently red for reasons unrelated to any unit test.
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
  },
});
