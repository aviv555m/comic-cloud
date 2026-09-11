import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import http from "http";
import https from "https";

// https://vitejs.dev/config/
// Serves /api-image-proxy. Registered for both dev and preview: `vite preview`
// never calls configureServer, so in production this route fell through to the
// SPA and returned index.html instead of the image.
const imageProxyMiddleware = (req: any, res: any, next: any) => {
          // Block malicious/scanner requests to sensitive paths (e.g. .git, .env) before Vite parses them
          if (req.url && (req.url.includes("/.git") || req.url.includes("/.env") || req.url.includes("/..") || req.url.includes("/.github"))) {
            res.statusCode = 403;
            res.setHeader("Content-Type", "text/plain");
            res.end("Forbidden");
            return;
          }

          const allowedOrigins = ["https://cc.displayname.top", "http://localhost:8081", "capacitor://localhost", "http://localhost"];
          const reqOrigin = req.headers.origin as string;
          const allowedOrigin = reqOrigin && allowedOrigins.includes(reqOrigin) ? reqOrigin : "https://cc.displayname.top";



          if (req.url && req.url.startsWith("/api-image-proxy")) {
            const urlObj = new URL(req.url, `http://${req.headers.host || "localhost"}`);
            const targetUrl = urlObj.searchParams.get("url");
            if (!targetUrl) {
              res.statusCode = 400;
              res.end("Missing url parameter");
              return;
            }
            try {
              const targetObj = new URL(targetUrl);
              const isHttps = targetObj.protocol === "https:";
              const requester = isHttps ? https : http;
              
              const headers: Record<string, string> = {
                "Host": targetObj.host,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
              };
              
              const host = targetObj.hostname.toLowerCase();
              if (host.includes("comix.to")) {
                headers["referer"] = "https://comix.to/";
              } else if (host.includes("manganato.com") || host.includes("chapmanganato.to") || host.includes("googleusercontent.com") || host.includes("blogspot.com")) {
                headers["referer"] = "https://chapmanganato.to/";
              } else if (host.includes("mangafire.to") || host.includes("mstcdn.xyz") || host.includes("mfcdn")) {
                headers["referer"] = "https://mangafire.to/";
              } else if (host.includes("mangafreak.me")) {
                headers["referer"] = "https://ww2.mangafreak.me/";
              } else if (host.includes("mangapark.io") || host.includes("mpcdn.net")) {
                headers["referer"] = "https://mangapark.io/";
              }
              
              const options = {
                method: req.method || "GET",
                headers,
                timeout: 15000,
              };
              
              const proxyReq = requester.request(targetUrl, options, (proxyRes) => {
                res.writeHead(proxyRes.statusCode || 200, {
                  "content-type": proxyRes.headers["content-type"] || "image/jpeg",
                  "cache-control": proxyRes.headers["cache-control"] || "public, max-age=14400",
                  "access-control-allow-origin": "*",
                });
                proxyRes.pipe(res);
              });
              
              proxyReq.on("error", (err) => {
                console.error("[Proxy Middleware Error]:", err);
                if (!res.headersSent) {
                  res.statusCode = 500;
                  res.end("Proxy request failed");
                }
              });
              
              req.pipe(proxyReq);
            } catch (err) {
              console.error("[Proxy Middleware URL Error]:", err);
              res.statusCode = 400;
              res.end("Invalid target URL");
            }
          } else {
            next();
          }
};

export default defineConfig(({ mode }) => ({
  preview: {
    host: "::",
    port: 8081,
    allowedHosts: ["cc.displayname.top"]
  },
  server: {
    host: "::",
    port: 8081,
    allowedHosts: ["cc.displayname.top"],
    proxy: {
      // server/secure-files.cjs (127.0.0.1:8084) serves uploads and encrypted files.
      // nginx maps these three prefixes for cc.displayname.top; dev/preview need the
      // same mapping so getServerUrl()'s localhost/192.168.* origin resolves too.
      // Keys keep the trailing slash so they match the nginx locations exactly and
      // cannot swallow an app route that merely starts with "db"/"uploads".
      "/api/upload": {
        target: "http://127.0.0.1:8084"
      },
      "/db/": {
        target: "http://127.0.0.1:8084"
      },
      "/uploads/": {
        target: "http://127.0.0.1:8084",
        rewrite: (path) => path.replace(/^\/uploads/, "/db/file")
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
  plugins: [
    react(),
    {
      name: "image-proxy-middleware",
      configureServer(server) {
        server.middlewares.use(imageProxyMiddleware);
      },
      configurePreviewServer(server) {
        server.middlewares.use(imageProxyMiddleware);
      }
    }
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      react: path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
      "react/jsx-runtime": path.resolve(__dirname, "./node_modules/react/jsx-runtime.js"),
      "react/jsx-dev-runtime": path.resolve(__dirname, "./node_modules/react/jsx-dev-runtime.js"),
      // react-pdf pins pdfjs-dist exactly (5.4.296) and installs it nested, while the
      // root copy is newer. The worker refuses to run against a different API version,
      // so both must resolve to react-pdf's copy.
      "pdfjs-dist": path.resolve(__dirname, "./node_modules/react-pdf/node_modules/pdfjs-dist"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "three", "@react-three/fiber", "@react-three/drei", "pdfjs-dist"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "@tanstack/react-query", "three", "@react-three/fiber", "@react-three/drei"],
  },
}));
