// Imported from "vitest/config" instead of plain "vite" — it's a drop-in
// superset that also type-checks/accepts the `test` block below. `vite dev`
// and `vite build` behave identically either way; `vitest` additionally
// reads the `test` config from this same file, so there's only one config
// to keep in sync.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"), // 👈 add this
    },
  },
  build: {
    // D74: keep the Vite >500 kB warning meaningful — do not raise the
    // limit; split heavy vendors so route chunks stay under it.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("recharts") || id.includes("/d3-")) return "recharts";
          if (
            id.includes("reactflow") ||
            id.includes("@reactflow") ||
            id.includes("/dagre/")
          ) {
            return "reactflow";
          }
          if (id.includes("framer-motion")) return "framer-motion";
          if (id.includes("mathjs")) return "mathjs";
          if (id.includes("lucide-react")) return "lucide";
          if (id.includes("@radix-ui")) return "radix";
          if (id.includes("@tanstack")) return "query";
          if (id.includes("@dnd-kit")) return "dnd";
          if (
            id.includes("react-dom") ||
            id.includes("react-router") ||
            id.includes("/react/") ||
            id.includes("\\react\\")
          ) {
            return "react-vendor";
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy /api to express backend
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  test: {
    // React components (auth context, ProtectedRoute, RequirePermission)
    // need a DOM; Express route tests don't care and run fine under jsdom
    // too, so one shared environment keeps this simple.
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.js"],
    css: false,
    include: [
      "src/**/*.test.{js,jsx,ts,tsx}",
      "server/**/*.test.{js,jsx}",
    ],
  },
});
