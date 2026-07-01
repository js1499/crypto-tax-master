import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests for the pure tax-engine libraries (no DB). Most engine libs use relative
// imports, but tax-calculator.ts uses the "@/..." path alias, so mirror the tsconfig
// path here. The regex `^@/` is deliberate so it does NOT rewrite scoped packages
// like "@prisma/client". Run with `npm test`.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: [
      { find: /^@\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) },
    ],
  },
});
