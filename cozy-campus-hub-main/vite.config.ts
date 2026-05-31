import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "127.0.0.1",
    port: 8080,
    allowedHosts: ["localhost", "127.0.0.1"],
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("commonjsHelpers")) return "runtime";
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("framer-motion")) return "motion";
          if (id.includes("@radix-ui") || id.includes("vaul") || id.includes("cmdk")) return "ui";
          if (id.includes("recharts")) return "charts";
          if (id.includes("lucide-react")) return "icons";
          if (id.includes("html2canvas")) return "receipt-canvas";
          if (id.includes("jspdf") || id.includes("dompurify") || id.includes("fflate")) return "receipt-pdf";
          if (id.includes("qrcode")) return "qr";
          if (id.includes("@tanstack")) return "query";
          if (id.includes("date-fns")) return "date";
          return "vendor";
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
