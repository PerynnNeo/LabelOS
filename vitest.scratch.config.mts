import { defineConfig } from "vitest/config";
import path from "node:path";
const root = import.meta.dirname;
export default defineConfig({
  resolve: {
    alias: {
      "server-only": path.join(root, "tests/stubs/server-only.ts"),
      "@": path.join(root, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: [path.join(root, "tests/setup.ts")],
  },
});
