import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import http from "http";
import https from "https";
import fs from "fs";
import crypto from "crypto";


const SERVER_DB_FILE = path.resolve(__dirname, "./data/comic-cloud-db.json");
const SERVER_TABLES = [
  "profiles",
  "books",
  "tags",
  "book_tags",
  "annotations",
  "book_reviews",
  "reading_sessions",
  "reading_lists",
  "reading_list_books",
  "reading_challenges",
  "reading_reminders",
  "scheduled_reading",
  "journal_entries",
  "vocabulary",
  "user_reading_preferences",
];

type ServerDb = {
  users: Array<{ id: string; email: string; passwordHash: string; salt: string; created_at: string }>;
  tables: Record<string, any[]>;
};

function emptyServerDb(): ServerDb {
  return { users: [], tables: Object.fromEntries(SERVER_TABLES.map((table) => [table, []])) } as ServerDb;
}

function readServerDb(): ServerDb {
  try {
    if (!fs.existsSync(SERVER_DB_FILE)) return emptyServerDb();
    const parsed = JSON.parse(fs.readFileSync(SERVER_DB_FILE, "utf8"));
    const db = { ...emptyServerDb(), ...parsed } as ServerDb;
    db.tables = { ...emptyServerDb().tables, ...(parsed.tables || {}) };
    return db;
  } catch (err) {
    console.error("[Local DB API] Failed to read server DB:", err);
    return emptyServerDb();
  }
}

function writeServerDb(db: ServerDb) {
  fs.mkdirSync(path.dirname(SERVER_DB_FILE), { recursive: true });
  fs.writeFileSync(SERVER_DB_FILE, JSON.stringify(db, null, 2));
}

function hashPassword(password: string, salt: string) {
  return crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

function sendJson(res: any, status: number, body: unknown, origin?: string) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.end(JSON.stringify(body));
}

function readJsonBody(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk: Buffer) => {
      raw += chunk.toString("utf8");
      if (raw.length > 10 * 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (err) { reject(err); }
    });
    req.on("error", reject);
  });
}

function filterRowsForUser(table: string, rows: any[], userId: string) {
  if (table === "profiles") return rows.filter((row) => row.id === userId);
  if (table === "book_tags") return rows;
  if (table === "reading_list_books") return rows;
  return rows.filter((row) => row.user_id === userId);
}

function rowMatchesPayload(row: any, payload: any) {
  if (!row || !payload) return false;
  if (payload.id) return row.id === payload.id;
  const keys = Object.keys(payload).filter((key) => payload[key] !== undefined && payload[key] !== null);
  if (keys.length === 0) return false;
  return keys.every((key) => row[key] === payload[key]);
}

function defaultConflictKeys(table: string) {
  if (table === "book_tags") return ["book_id", "tag_id"];
  if (table === "reading_list_books") return ["list_id", "book_id"];
  if (table === "user_reading_preferences") return ["user_id"];
  return ["id"];
}


function validateProxyUrl(rawUrl: string): URL {
  const parsed = new URL(rawUrl);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Only http(s) URLs are allowed");
  if (parsed.username || parsed.password) throw new Error("Credentials in URL are not allowed");
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.includes(":" ) || /^\d+\.\d+\.\d+\.\d+$/.test(host)) throw new Error("Host not allowed");
  return parsed;
}

function fetchProxyUrl(target: URL, redirects = 0): Promise<{ status: number; contentType: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const requester = target.protocol === "https:" ? https : http;
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "*/*",
      "Accept-Language": "en-US,en;q=0.9",
    };
    const host = target.hostname.toLowerCase();
    if (host.includes("comix.to")) headers.referer = "https://comix.to/";
    if (host.includes("mangafire.to") || host.includes("mstcdn") || host.includes("mfcdn")) headers.referer = "https://mangafire.to/";
    if (host.includes("mangafreak.me")) headers.referer = "https://ww2.mangafreak.me/";
    if (host.includes("mangapark.io") || host.includes("mpcdn.net")) headers.referer = "https://mangapark.io/";
    if (host.includes("manganato") || host.includes("chapmanganato") || host.includes("blogspot") || host.includes("googleusercontent")) headers.referer = "https://chapmanganato.to/";

    const req = requester.request(target, { method: "GET", headers, timeout: 20000 }, (upstream) => {
      const status = upstream.statusCode || 200;
      const location = upstream.headers.location;
      if (status >= 300 && status < 400 && location && redirects < 5) {
        upstream.resume();
        const next = validateProxyUrl(new URL(location, target).toString());
        fetchProxyUrl(next, redirects + 1).then(resolve, reject);
        return;
      }
      const chunks: Buffer[] = [];
      upstream.on("data", (chunk: Buffer) => chunks.push(chunk));
      upstream.on("end", () => resolve({
        status,
        contentType: String(upstream.headers["content-type"] || "application/octet-stream"),
        body: Buffer.concat(chunks),
      }));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(new Error("Proxy request timed out")); });
    req.end();
  });
}

function applyServerDbItem(db: ServerDb, item: any) {
  const table = item.table;
  if (!SERVER_TABLES.includes(table)) return;
  const rows = db.tables[table] || [];
  const payload = Array.isArray(item.payload) ? item.payload : [item.payload];

  if (item.operation === "delete") {
    const ids = new Set(payload.map((row: any) => row?.id).filter(Boolean));
    const deletedRows = rows.filter((row) => ids.has(row.id) || payload.some((item: any) => rowMatchesPayload(row, item)));
    const deletedIds = new Set(deletedRows.map((row) => row.id).filter(Boolean));
    const deletedBookIds = new Set(deletedRows.map((row) => row.book_id).filter(Boolean));
    const deletedListIds = new Set(deletedRows.map((row) => row.id).filter(Boolean));
    const deletedTagIds = new Set(deletedRows.map((row) => row.id).filter(Boolean));

    db.tables[table] = rows.filter((row) => !deletedRows.includes(row));
    if (table === "books" && (deletedIds.size > 0 || ids.size > 0)) {
      const bookIds = deletedIds.size > 0 ? deletedIds : ids;
      for (const cascadeTable of SERVER_TABLES) {
        if (cascadeTable === "books") continue;
        db.tables[cascadeTable] = (db.tables[cascadeTable] || []).filter((row) => !bookIds.has(row.book_id));
      }
    }
    if (table === "reading_lists" && deletedListIds.size > 0) {
      db.tables.reading_list_books = (db.tables.reading_list_books || []).filter((row) => !deletedListIds.has(row.list_id));
    }
    if (table === "tags" && deletedTagIds.size > 0) {
      db.tables.book_tags = (db.tables.book_tags || []).filter((row) => !deletedTagIds.has(row.tag_id));
    }
    if (deletedBookIds.size > 0 && (table === "book_tags" || table === "reading_list_books")) {
      db.tables[table] = (db.tables[table] || []).filter((row) => !deletedRows.includes(row));
    }
    return;
  }

  const conflictKeys = item.upsertConflict
    ? String(item.upsertConflict).split(",").map((key) => key.trim()).filter(Boolean)
    : defaultConflictKeys(table);

  for (const record of payload) {
    if (!record) continue;
    const idx = rows.findIndex((row) => conflictKeys.every((key) => row[key] === record[key]));
    const next = { ...record };
    if (!next.id && !["book_tags", "reading_list_books"].includes(table)) next.id = crypto.randomUUID();
    if (!next.created_at) next.created_at = new Date().toISOString();
    if (["books", "profiles", "book_reviews", "annotations", "tags"].includes(table)) {
      next.updated_at = next.updated_at || new Date().toISOString();
    }
    if (idx >= 0) rows[idx] = { ...rows[idx], ...next };
    else rows.push(next);
  }
  db.tables[table] = rows;
}

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com",
  "script-src-elem 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline' blob: https://fonts.googleapis.com",
  "style-src-elem 'self' 'unsafe-inline' blob: https://fonts.googleapis.com",
  "img-src 'self' data: blob: http: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "media-src 'self' data: blob: http: https:",
  "connect-src 'self' http: https: ws: wss: capacitor://localhost",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join('; ');

const setupMiddlewares = (middlewares: any) => {
  middlewares.use((req: any, res: any, next: any) => {
    res.setHeader("Content-Security-Policy", contentSecurityPolicy);
    res.setHeader("Content-Security-Policy-Report-Only", contentSecurityPolicy);
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

          if (req.url && req.url.startsWith("/api/") && req.method === "OPTIONS") {
            res.statusCode = 204;
            res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
            res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", "x-file-path, content-type, authorization");
            res.end();
            return;
          }

          if (req.url && req.url.startsWith("/api/auth/signup") && req.method === "POST") {
            readJsonBody(req).then((body) => {
              const email = String(body.email || "").trim().toLowerCase();
              const password = String(body.password || "");
              if (!email || !password) return sendJson(res, 400, { error: "Email and password are required" }, allowedOrigin);
              const db = readServerDb();
              if (db.users.some((u) => u.email === email)) return sendJson(res, 409, { error: "User already registered" }, allowedOrigin);
              const salt = crypto.randomBytes(16).toString("hex");
              const user = { id: body.id || crypto.randomUUID(), email, passwordHash: hashPassword(password, salt), salt, created_at: new Date().toISOString() };
              db.users.push(user);
              const profiles = db.tables.profiles || [];
              if (!profiles.some((p) => p.id === user.id)) {
                profiles.push({ id: user.id, email, created_at: user.created_at, updated_at: user.created_at });
                db.tables.profiles = profiles;
              }
              writeServerDb(db);
              sendJson(res, 200, { user: { id: user.id, email: user.email, created_at: user.created_at } }, allowedOrigin);
            }).catch((err) => sendJson(res, 400, { error: err.message || "Bad request" }, allowedOrigin));
            return;
          }

          if (req.url && req.url.startsWith("/api/auth/signin") && req.method === "POST") {
            readJsonBody(req).then((body) => {
              const email = String(body.email || "").trim().toLowerCase();
              const password = String(body.password || "");
              const db = readServerDb();
              const user = db.users.find((u) => u.email === email);
              if (!user || user.passwordHash !== hashPassword(password, user.salt)) return sendJson(res, 401, { error: "Invalid credentials" }, allowedOrigin);
              sendJson(res, 200, { user: { id: user.id, email: user.email, created_at: user.created_at } }, allowedOrigin);
            }).catch((err) => sendJson(res, 400, { error: err.message || "Bad request" }, allowedOrigin));
            return;
          }

          if (req.url && req.url.startsWith("/api/db/pull") && req.method === "GET") {
            const urlObj = new URL(req.url, `http://${req.headers.host || "localhost"}`);
            const userId = urlObj.searchParams.get("userId") || "";
            if (!userId) return sendJson(res, 400, { error: "Missing userId" }, allowedOrigin);
            const db = readServerDb();
            const tables: Record<string, any[]> = {};
            for (const table of SERVER_TABLES) {
              tables[table] = filterRowsForUser(table, db.tables[table] || [], userId);
            }
            sendJson(res, 200, { tables }, allowedOrigin);
            return;
          }

          if (req.url && req.url.startsWith("/api/db/public-books") && req.method === "GET") {
            const db = readServerDb();
            const books = (db.tables.books || [])
              .filter((book) => book.is_public === true)
              .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
            sendJson(res, 200, { books }, allowedOrigin);
            return;
          }

          if (req.url && req.url.startsWith("/api/db/push") && req.method === "POST") {
            readJsonBody(req).then((body) => {
              const items = Array.isArray(body.items) ? body.items : [];
              const db = readServerDb();
              for (const item of items) applyServerDbItem(db, item);
              writeServerDb(db);
              sendJson(res, 200, { success: true, applied: items.length }, allowedOrigin);
            }).catch((err) => sendJson(res, 400, { error: err.message || "Bad request" }, allowedOrigin));
            return;
          }

          if (req.url && req.url.startsWith("/api/public-library-proxy") && req.method === "POST") {
            readJsonBody(req).then(async (body) => {
              const target = validateProxyUrl(String(body.url || ""));
              const upstream = await fetchProxyUrl(target);
              if (upstream.status < 200 || upstream.status >= 300) {
                return sendJson(res, upstream.status, { success: false, error: `Upstream error ${upstream.status}` }, allowedOrigin);
              }
              const isBinaryTextRequest = body.responseType === "text" && (
                upstream.contentType.startsWith("image/") ||
                upstream.contentType.includes("octet-stream") ||
                upstream.contentType.includes("zip") ||
                upstream.contentType.includes("pdf")
              );
              if (body.responseType === "base64" || isBinaryTextRequest) {
                return sendJson(res, 200, { success: true, data: upstream.body.toString('base64'), contentType: upstream.contentType }, allowedOrigin);
              }
              if (body.responseType === "text" || upstream.contentType.includes("html") || upstream.contentType.includes("xml") || upstream.contentType.includes("atom")) {
                return sendJson(res, 200, { success: true, data: upstream.body.toString('utf8'), contentType: upstream.contentType }, allowedOrigin);
              }
              try {
                return sendJson(res, 200, { success: true, data: JSON.parse(upstream.body.toString('utf8')), contentType: upstream.contentType }, allowedOrigin);
              } catch {
                return sendJson(res, 200, { success: true, data: upstream.body.toString('utf8'), contentType: upstream.contentType }, allowedOrigin);
              }
            }).catch((err) => sendJson(res, 400, { success: false, error: err.message || "Proxy failed" }, allowedOrigin));
            return;
          }

          // Local server upload/delete API
          if (req.url && req.url.startsWith("/api/upload") && req.method === "DELETE") {
            const filePathHeader = req.headers['x-file-path'] as string;
            if (!filePathHeader) {
              res.statusCode = 400;
              res.end("Missing x-file-path header");
              return;
            }
            const cleanFilePath = decodeURIComponent(filePathHeader);
            const uploadDir = path.resolve(__dirname, "./public/uploads");
            const distDir = path.resolve(__dirname, "./dist/uploads");
            for (const dir of [uploadDir, distDir]) {
              const target = path.resolve(dir, cleanFilePath);
              if (target.startsWith(dir)) fs.rmSync(target, { force: true });
            }
            sendJson(res, 200, { success: true }, allowedOrigin);
            return;
          }

          if (req.url && req.url.startsWith("/api/upload") && req.method === "POST") {
            const filePathHeader = req.headers['x-file-path'] as string;
            if (!filePathHeader) {
              res.statusCode = 400;
              res.end("Missing x-file-path header");
              return;
            }

            const cleanFilePath = decodeURIComponent(filePathHeader);
            const uploadDir = path.resolve(__dirname, "./public/uploads");
            const distDir = path.resolve(__dirname, "./dist/uploads");
            const destPathCheck = path.resolve(uploadDir, cleanFilePath);
            if (!destPathCheck.startsWith(uploadDir)) {
              res.statusCode = 403;
              res.end("Forbidden: invalid file path");
              return;
            }

            const chunks: Buffer[] = [];
            let bytesWritten = 0;
            const MAX_FILE_SIZE = 500 * 1024 * 1024;

            req.on("data", (chunk: Buffer) => {
              bytesWritten += chunk.length;
              if (bytesWritten > MAX_FILE_SIZE) {
                req.destroy();
                return;
              }
              chunks.push(chunk);
            });

            req.on("end", () => {
              try {
                const data = Buffer.concat(chunks);
                for (const dir of [uploadDir, distDir]) {
                  const destPath = path.resolve(dir, cleanFilePath);
                  if (!destPath.startsWith(dir)) throw new Error("Forbidden: invalid file path");
                  fs.mkdirSync(path.dirname(destPath), { recursive: true });
                  fs.writeFileSync(destPath, data);
                }
                sendJson(res, 200, { url: `/uploads/${cleanFilePath}` }, allowedOrigin);
              } catch (err: any) {
                console.error("Upload error:", err);
                sendJson(res, 500, { error: err.message || "Upload failed" }, allowedOrigin);
              }
            });

            req.on("error", (err) => {
              console.error("Upload error:", err);
              res.statusCode = 500;
              res.end("Upload failed");
            });
            return;
          }

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
              
              const headers = {
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
        });
};

// https://vitejs.dev/config/
const proxyConfig = {
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
    };

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8081,
    allowedHosts: ["cc.displayname.top"],
    proxy: proxyConfig
  },
  preview: {
    host: "::",
    port: 8081,
    allowedHosts: ["cc.displayname.top"],
    proxy: proxyConfig
  },
  plugins: [
    react(),
    {
      name: "image-proxy-middleware",
      configureServer(server) {
        setupMiddlewares(server.middlewares);
      },
      configurePreviewServer(server) {
        setupMiddlewares(server.middlewares);
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
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "three", "@react-three/fiber", "@react-three/drei"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "@tanstack/react-query", "three", "@react-three/fiber", "@react-three/drei"],
  },
}));
