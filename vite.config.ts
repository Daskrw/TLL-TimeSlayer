import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: ".",
  publicDir: "public",
  plugins: [react()],
  server: {
    port: 5299,
    strictPort: true,
    open: true,
    // Allows access via Cloudflare Tunnel / external domain names
    allowedHosts: true,
    proxy: {
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true,
        changeOrigin: true,
      },
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@engine": "/src",
    },
  },
  build: {
    outDir: "dist-client",
    target: "es2020",
    sourcemap: true,
  },
  optimizeDeps: {
    include: ["three", "gsap"],
  },
});

