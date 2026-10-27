import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/instagram": {
        target: "https://oginstagram.com",
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
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/tests/setup.ts",
  },
});
