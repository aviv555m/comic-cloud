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
      "/api-image-proxy": {
        target: "https://comix.to", // Fallback
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-image-proxy/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            const urlObj = new URL(req.url || "", "http://localhost");
            const targetUrl = urlObj.searchParams.get("url");
            if (targetUrl) {
              try {
                const targetObj = new URL(targetUrl);
                proxyReq.path = targetObj.pathname + targetObj.search;
                
                // Inject correct Referer/Origin headers based on target hostname
                const host = targetObj.hostname.toLowerCase();
                if (host.includes("comix.to")) {
                  proxyReq.setHeader("referer", "https://comix.to/");
                } else if (host.includes("manganato.com") || host.includes("chapmanganato.to") || host.includes("googleusercontent.com") || host.includes("blogspot.com")) {
                  proxyReq.setHeader("referer", "https://chapmanganato.to/");
                } else if (host.includes("mangafire.to") || host.includes("mstcdn.xyz")) {
                  proxyReq.setHeader("referer", "https://mangafire.to/");
                } else if (host.includes("mangafreak.me")) {
                  proxyReq.setHeader("referer", "https://ww2.mangafreak.me/");
                } else if (host.includes("mangapark.io") || host.includes("mpcdn.net")) {
                  proxyReq.setHeader("referer", "https://mangapark.io/");
                }
                
                proxyReq.setHeader("Host", targetObj.host);
              } catch (e) {
                console.error("Proxy URL rewrite error:", e);
              }
            }
          });
        },
        router: (req) => {
          const urlObj = new URL(req.url || "", "http://localhost");
          const targetUrl = urlObj.searchParams.get("url");
          if (targetUrl) {
            try {
              const targetObj = new URL(targetUrl);
              return `${targetObj.protocol}//${targetObj.host}`;
            } catch {}
          }
          return "https://comix.to";
        }
      },
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
      },
      "/api-manganato": {
        target: "https://manganato.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-manganato/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setHeader("referer", "https://manganato.com/");
            proxyReq.setHeader("origin", "https://manganato.com");
          });
        }
      },
      "/api-chapmanganato": {
        target: "https://chapmanganato.to",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-chapmanganato/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setHeader("referer", "https://chapmanganato.to/");
            proxyReq.setHeader("origin", "https://chapmanganato.to");
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
