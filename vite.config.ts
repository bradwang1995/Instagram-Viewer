import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/instagram": {
        target: "https://instagram-viewer-metadata.bradwang1995.workers.dev",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/instagram/, ""),
        headers: { Accept: "application/activity+json" },
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          animation: ["@gsap/react", "gsap", "motion/react"],
          data: ["dexie"],
          icons: ["lucide-react"],
          react: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
  test: {
    exclude: [...configDefaults.exclude, "embed-lab.local/**"],
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/tests/setup.ts",
  },
});
