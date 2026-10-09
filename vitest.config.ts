import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(viteConfig, defineConfig({
  // Realistic synthesis is heavier; 5 s timed out under parallel load.
  test: { setupFiles: ["tests/setup/ideal-acquisition.ts"], testTimeout: 15_000 },
}));
