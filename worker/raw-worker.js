/**
 * Cloudflare Worker for raw.cdn.amit.is-a.dev.
 *
 * Serves files straight from the Hugging Face bucket and keeps a copy in Cloudflare's edge cache for
 * 10 seconds, so the Render app is no longer in the path for raw downloads. Mirrors stream_raw() in
 * app/main.py: same headers, same content-type fixes, same 404 / folder behaviour.
 *
 * Variables (Worker settings -> Variables), all optional:
 *   HF_BUCKET_ID       bucket to read from (default notamitgamer/cdn)
 *   CDN_BASE_URL       where folder paths are redirected (default https://cdn.amit.is-a.dev)
 *   HF_TOKEN           secret, only if the bucket is private
 *   HF_BUCKET_PRIVATE  "1" to send HF_TOKEN
 *   EDGE_TTL           seconds to keep a file in the edge cache (default 10)
 */

const WEB_MIME = {
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".xml": "application/xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
  ".map": "application/json",
};
const TEXTY = new Set(["application/json", "application/xml", "application/manifest+json"]);

// HF often labels web assets text/plain or octet-stream; with nosniff the browser then refuses them.
function resolveContentType(filename, upstreamType) {
  const dot = filename.lastIndexOf(".");
  const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : "";
  if (ext === ".md" || ext === ".txt") return "text/plain; charset=utf-8";
  const mime = WEB_MIME[ext];
  if (mime) return mime.startsWith("text/") || TEXTY.has(mime) ? `${mime}; charset=utf-8` : mime;
  return upstreamType;
}

const CORS = { "Access-Control-Allow-Origin": "*" };

function notFound() {
  return new Response("404: File Not Found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...CORS },
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...CORS,
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Range",
          "Access-Control-Max-Age": "86400",
        },
      });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD, OPTIONS" } });
    }

    const url = new URL(request.url);
    let path;
    try {
      path = decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g, "");
    } catch {
      return new Response("Bad Request", { status: 400 });
    }
    if (!path) {
      return new Response("Specify a file path.", { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    const segments = path.split("/");
    if (segments.some((s) => s === "." || s === ".." || s === "")) return notFound();

    const bucket = env.HF_BUCKET_ID || "notamitgamer/cdn";
    const ttl = Number(env.EDGE_TTL) > 0 ? Number(env.EDGE_TTL) : 10;
    const upstreamUrl = `https://huggingface.co/buckets/${bucket}/resolve/${segments.map(encodeURIComponent).join("/")}`;
    const filename = segments[segments.length - 1];

    const isRange = request.headers.has("Range");
    const cacheable = request.method === "GET" && !isRange;
    const cache = caches.default;
    const cacheKey = new Request(url.origin + url.pathname, { method: "GET" });

    if (cacheable) {
      const hit = await cache.match(cacheKey);
      if (hit) {
        const res = new Response(hit.body, hit);
        res.headers.set("X-Edge-Cache", "HIT");
        return res;
      }
    }

    const headers = {};
    if (env.HF_BUCKET_PRIVATE === "1" && env.HF_TOKEN) headers.Authorization = `Bearer ${env.HF_TOKEN}`;
    if (isRange) headers.Range = request.headers.get("Range");

    const upstream = await fetch(upstreamUrl, { method: request.method, headers, redirect: "follow" });

    if (upstream.status !== 200 && upstream.status !== 206) {
      // Same as the app: an unknown path that looks like a folder goes to the file browser.
      if (!filename.includes(".")) {
        const base = (env.CDN_BASE_URL || "https://cdn.amit.is-a.dev").replace(/\/+$/, "");
        return Response.redirect(`${base}/${path}/`, 307);
      }
      return notFound();
    }

    const res = new Response(request.method === "HEAD" ? null : upstream.body, upstream);
    res.headers.delete("Set-Cookie");
    res.headers.set("Access-Control-Allow-Origin", "*");
    res.headers.set("Cache-Control", `public, max-age=${ttl}`);
    res.headers.set("X-Content-Type-Options", "nosniff");
    res.headers.set("Accept-Ranges", "bytes");
    const type = resolveContentType(filename.toLowerCase(), res.headers.get("Content-Type"));
    if (type) res.headers.set("Content-Type", type);
    res.headers.set("X-Edge-Cache", "MISS");

    if (cacheable && upstream.status === 200) ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  },
};
