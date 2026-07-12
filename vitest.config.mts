import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Loaded as ESM (`.mts`) so Vitest resolves its ESM config build and avoids the
// `require() of ES Module std-env` failure from the CJS config entry on some
// Node/Windows setups. Path aliases are declared manually here (instead of the
// vite-tsconfig-paths / @vitejs/plugin-react plugins) to keep the config's
// dependency surface minimal — Vitest's built-in esbuild transform handles the
// TypeScript/TSX in tests.

const src = fileURLToPath(new URL("./src", import.meta.url));
const serverOnlyStub = fileURLToPath(
  new URL("./tests/stubs/server-only.ts", import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: {
      // `server-only` throws outside an RSC bundle; tests run in Node.
      "server-only": serverOnlyStub,
      "@": src,
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["tests/setup.ts"],
  },
});
