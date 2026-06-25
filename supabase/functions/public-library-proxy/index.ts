// Supabase Edge Function: public-library-proxy
// Proxies requests to public library sources to avoid CORS and apply a browser-like User-Agent

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

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
]);

// Allow image subdomains under these parent domains (e.g. cdn.comix.to, i0.wp.com style hosts)
const ALLOWED_SUFFIXES = [".comix.to", ".mangadex.org"];

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
    if (current.hostname.endsWith("comix.to")) {
      headers["Referer"] = "https://comix.to/";
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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

    if (responseType === "text" || contentType.includes("xml") || contentType.includes("html") || contentType.includes("atom")) {
      const text = await upstream.text();
      return new Response(JSON.stringify({ success: true, data: text, contentType }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      const data = await upstream.json();
      return new Response(JSON.stringify({ success: true, data, contentType }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch {
      const text = await upstream.text().catch(() => "");
      return new Response(JSON.stringify({ success: true, data: text, contentType }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Proxy error:", message);
    return new Response(JSON.stringify({ success: false, error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
