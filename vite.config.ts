import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  build: {
    rollupOptions: {
      output: {
        // Split vendors so the app chunk stays small and unchanged deps keep a
        // stable hash across releases. react-markdown & friends only load
        // because HelpDialog is lazy-imported.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;
          if (/node_modules\/(react-dom|react|scheduler)\//.test(id)) return "react";
          if (
            id.includes("react-markdown") || id.includes("remark") || id.includes("rehype") ||
            id.includes("micromark") || id.includes("mdast") || id.includes("hast") ||
            id.includes("unified") || id.includes("unist")
          ) return "markdown";
          if (id.includes("@tauri-apps")) return "tauri";
          if (id.includes("lucide-react")) return "icons";
          if (id.includes("js-yaml")) return "yaml";
          if (id.includes("react-grid-layout") || id.includes("react-resizable")) return "grid";
          return "vendor";
        },
      },
    },
  },
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
