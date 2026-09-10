// Supabase Edge Function: public-library-proxy
// Proxies requests to public library sources to avoid CORS and apply a browser-like User-Agent

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Allowlist of hostnames we proxy to (must be lowercase)
const ALLOWED_HOSTS = new Set<string>([
  "gutendex.com",
  "archive.org",
  "openlibrary.org",
  "www.wattpad.com",
  "api.mangadex.org",
  "uploads.mangadex.org",
  "standardebooks.org",
  "www.standardebooks.org",
  "covers.openlibrary.org",
  "comix.to",
  "www.comix.to",
  "mangafire.to",
  "mangafreak.me",
  "ww2.mangafreak.me",
  "mangapark.io",
  "manganato.com",
  "chapmanganato.to",
  "images.weserv.nl",
]);

// Allow image subdomains under these parent domains (e.g. cdn.comix.to, i0.wp.com style hosts)
const ALLOWED_SUFFIXES = [
  ".comix.to",
  ".mangadex.org",
  ".mangafire.to",
  ".mangafreak.me",
  ".mangapark.io",
  ".manganato.com",
  ".chapmanganato.to",
  ".mstcdn.xyz",
  ".mpcdn.net",
];

const IPV4_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

function validateUrl(rawUrl: string): { ok: true; url: URL } | { ok: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, error: "Invalid URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Only http(s) URLs are allowed" };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: "Credentials in URL are not allowed" };
  }
  const hostname = parsed.hostname.toLowerCase();
  if (IPV4_RE.test(hostname) || hostname.includes(":") || hostname === "localhost") {
    return { ok: false, error: "IP/host not allowed" };
  }
  const allowed =
    ALLOWED_HOSTS.has(hostname) ||
    ALLOWED_SUFFIXES.some((s) => hostname.endsWith(s));
  if (!allowed) {
    return { ok: false, error: `Host not allowed: ${hostname}` };
  }
  // images.weserv.nl is an open image proxy: it fetches whatever its own ?url=
  // parameter points at, which would otherwise tunnel straight past the
  // IP/localhost checks above. The wrapped target is not held to the allowlist
  // (it is legitimately an arbitrary image CDN), only to the SSRF rules.
  if (hostname === "images.weserv.nl") {
    const inner = parsed.searchParams.get("url");
    if (!inner) {
      return { ok: false, error: "Missing proxied url" };
    }
    let innerUrl: URL;
    try {
      // weserv accepts scheme-less values such as "example.com/a.jpg"
      innerUrl = new URL(/^https?:\/\//i.test(inner) ? inner : `https://${inner}`);
    } catch {
      return { ok: false, error: "Invalid proxied URL" };
    }
    const innerHost = innerUrl.hostname.toLowerCase();
    if (innerUrl.username || innerUrl.password) {
      return { ok: false, error: "Credentials in URL are not allowed" };
    }
    if (IPV4_RE.test(innerHost) || innerHost.includes(":") || innerHost === "localhost") {
      return { ok: false, error: "IP/host not allowed" };
    }
  }
  parsed.hostname = hostname;
  return { ok: true, url: parsed };
}

async function safeFetch(initialUrl: URL): Promise<Response> {
  let current = initialUrl;
  for (let i = 0; i < 5; i++) {
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
    };
    // These CDNs answer 403 without the originating site's Referer
    const host = current.hostname;
    if (host.endsWith("comix.to")) {
      headers["Referer"] = "https://comix.to/";
    } else if (host.endsWith("manganato.com") || host.endsWith("chapmanganato.to")) {
      headers["Referer"] = "https://chapmanganato.to/";
    } else if (host.endsWith("mangafire.to") || host.endsWith("mstcdn.xyz")) {
      headers["Referer"] = "https://mangafire.to/";
    } else if (host.endsWith("mangafreak.me")) {
      headers["Referer"] = "https://ww2.mangafreak.me/";
    } else if (host.endsWith("mangapark.io") || host.endsWith("mpcdn.net")) {
      headers["Referer"] = "https://mangapark.io/";
    }
    const res = await fetch(current.toString(), {
      headers,
      redirect: "manual",
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      const next = new URL(loc, current);
      const check = validateUrl(next.toString());
      if (!check.ok) {
        return new Response(JSON.stringify({ success: false, error: `Redirect blocked: ${check.error}` }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
      current = check.url;
      continue;
    }
    return res;
  }
  return new Response(JSON.stringify({ success: false, error: "Too many redirects" }), {
    status: 508,
    headers: { "Content-Type": "application/json" },
  });
}

// Fetch latest version from GitHub API (cached in Deno memory to prevent rate limits)
let cachedLatestVersion = "";
let lastFetchedTime = 0;

async function getLatestGitHubVersion() {
  const now = Date.now();
  if (cachedLatestVersion && (now - lastFetchedTime) < 300000) { // cache for 5 minutes
    return cachedLatestVersion;
  }
  try {
    const res = await fetch("https://api.github.com/repos/aviv555m/comic-cloud/releases/latest", {
      headers: { "User-Agent": "deno-edge-function" }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.tag_name) {
        cachedLatestVersion = data.tag_name.toLowerCase().replace(/^v/, "").trim();
        lastFetchedTime = now;
      }
    }
  } catch (err) {
    console.warn("Failed to fetch latest GitHub release version:", err);
  }
  return cachedLatestVersion;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Mandatory App Version Verification
  const clientVersion = req.headers.get("x-app-version");
  if (clientVersion) {
    const latest = await getLatestGitHubVersion();
    if (latest) {
      const cleanClient = clientVersion.toLowerCase().replace(/^v/, "").trim();
      if (cleanClient !== latest) {
        return new Response(JSON.stringify({ success: false, error: "Outdated client version. Update required to use services." }), {
          status: 426,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
  }

  try {
    const { url, responseType = "json" } = await req.json();
    if (!url || typeof url !== "string" || url.length > 2048) {
      return new Response(JSON.stringify({ success: false, error: "Missing or invalid url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const check = validateUrl(url);
    if (!check.ok) {
      return new Response(JSON.stringify({ success: false, error: check.error }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const upstream = await safeFetch(check.url);
    const contentType = upstream.headers.get("content-type") || "";

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `Upstream error ${upstream.status}` }),
        { status: upstream.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Binary payloads are returned base64-encoded: callers atob() the string,
    // and upstream.text() would UTF-8-mangle the bytes.
    const lowerType = contentType.toLowerCase();
    const isBinary =
      responseType === "base64" ||
      lowerType.startsWith("image/") ||
      lowerType.startsWith("audio/") ||
      lowerType.startsWith("video/") ||
      lowerType.includes("octet-stream") ||
      lowerType.includes("pdf") ||
      lowerType.includes("zip") ||
      // Some image CDNs answer with no Content-Type at all; fall back to the extension.
      (!lowerType && /\.(jpe?g|png|gif|webp|avif|bmp|pdf|epub|cbz|zip)$/i.test(check.url.pathname));
    if (isBinary) {
      return new Response(JSON.stringify({ success: true, data: encodeBase64(await upstream.arrayBuffer()), contentType }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (responseType === "text" || contentType.includes("xml") || contentType.includes("html") || contentType.includes("atom")) {
      const text = await upstream.text();
      return new Response(JSON.stringify({ success: true, data: text, contentType }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Read the body once: a failed Response.json() leaves it consumed, so the old
    // .text() fallback always resolved to "" and reported success with empty data.
    const raw = await upstream.text();
    let data: unknown = raw;
    try {
      data = JSON.parse(raw);
    } catch {
      // not JSON after all - hand back the raw text
    }
    return new Response(JSON.stringify({ success: true, data, contentType }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Proxy error:", message);
    return new Response(JSON.stringify({ success: false, error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
