import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Separate from pnpm test: this suite runs at most 24 paid synthetic model calls.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["evals/**/*.eval.ts"],
    testTimeout: 480_000,
  },
});
