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
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
      process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ""
    ),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(
      process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ""
    ),
  },
  optimizeDeps: {
    include: ["three", "gsap"],
  },
});

