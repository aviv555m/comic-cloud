import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8081,
    allowedHosts: ["cc.displayname.top"],
    proxy: {
      "/api-comix": {
        target: "https://comix.to",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-comix/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setHeader("referer", "https://comix.to/");
            proxyReq.setHeader("origin", "https://comix.to");
          });
        }
      },
      "/api-mangafire": {
        target: "https://mangafire.to",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-mangafire/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setHeader("referer", "https://mangafire.to/");
            proxyReq.setHeader("origin", "https://mangafire.to");
          });
        }
      },
      "/api-mangafreak": {
        target: "https://ww2.mangafreak.me",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-mangafreak/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setHeader("referer", "https://ww2.mangafreak.me/");
            proxyReq.setHeader("origin", "https://ww2.mangafreak.me");
          });
        }
      },
      "/api-mangapark": {
        target: "https://mangapark.io",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-mangapark/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setHeader("referer", "https://mangapark.io/");
            proxyReq.setHeader("origin", "https://mangapark.io");
          });
        }
      }
    }
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      react: path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
      "react/jsx-runtime": path.resolve(__dirname, "./node_modules/react/jsx-runtime.js"),
      "react/jsx-dev-runtime": path.resolve(__dirname, "./node_modules/react/jsx-dev-runtime.js"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "three", "@react-three/fiber", "@react-three/drei"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "@tanstack/react-query", "three", "@react-three/fiber", "@react-three/drei"],
  },
}));
