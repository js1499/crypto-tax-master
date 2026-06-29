import { defineConfig } from "vitest/config";

// Unit tests for the pure securities tax-engine libraries (no DB, no path aliases —
// the engine libs use relative imports). Run with `npm test`.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
