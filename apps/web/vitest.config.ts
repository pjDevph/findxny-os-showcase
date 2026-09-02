import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["lib/**/*.test.ts", "lib/**/*.test.tsx", "features/**/*.test.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
    // jsdom for everything — pure tests don't touch DOM globals, so the
    // overhead is minimal and we avoid per-file environment markers.
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
