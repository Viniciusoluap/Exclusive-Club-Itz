import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createRequire } from "module";
import path from "path";
import { defineConfig } from "vite";

// Manus runtime plugin — disponível apenas no ambiente Manus.
// Carregado de forma opcional para que o build também funcione fora do Manus.
const require = createRequire(import.meta.url);
let manusPlugin: any = null;
try {
  const { vitePluginManusRuntime } = require("vite-plugin-manus-runtime");
  manusPlugin = vitePluginManusRuntime();
} catch { /* não disponível fora do Manus */ }

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(manusPlugin ? [manusPlugin] : [])],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
