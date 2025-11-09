// Supabase Edge Function: public-library-proxy
// Proxies requests to public library sources to avoid CORS and apply a browser-like User-Agent

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Allowlist of hostnames we proxy to
const ALLOWED_HOSTS = new Set<string>([
  "gutendex.com",
  "archive.org",
  "openlibrary.org",
  "standardebooks.org",
  "www.wattpad.com",
]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, responseType = "json" } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ success: false, error: "Missing or invalid url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let hostname: string;
    try {
      hostname = new URL(url).hostname;
    } catch {
      return new Response(JSON.stringify({ success: false, error: "Invalid URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!ALLOWED_HOSTS.has(hostname)) {
      return new Response(JSON.stringify({ success: false, error: `Host not allowed: ${hostname}` }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const headers: HeadersInit = {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
    };

    const upstream = await fetch(url, { headers });
    const contentType = upstream.headers.get("content-type") || "";

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      return new Response(
        JSON.stringify({ success: false, error: `Upstream error ${upstream.status}`, details: text }),
        { status: upstream.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (responseType === "text" || contentType.includes("xml") || contentType.includes("html")) {
      const text = await upstream.text();
      return new Response(JSON.stringify({ success: true, data: text, contentType }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // default json
    const data = await upstream.json();
    return new Response(JSON.stringify({ success: true, data, contentType }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e ?? "Unknown error");
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
