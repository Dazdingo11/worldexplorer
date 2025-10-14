//* Hardening *//
const ALLOWED_PATHS = new Set(["top-headlines", "everything", "sources"]);

const corsHeaders = (origin) => ({
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin"
});

function withTimeout(ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error("Upstream timeout")), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(t) };
}

//* Handler *//
export async function handler(event) {
  const origin = event.headers?.origin || "*";

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(origin), body: "" };
  }

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      body: JSON.stringify({ status: "error", message: "Method Not Allowed" })
    };
  }

  try {
    const selfUrl = new URL(event.rawUrl);

    const path = (selfUrl.searchParams.get("path") || "top-headlines").trim();
    if (!ALLOWED_PATHS.has(path)) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        body: JSON.stringify({ status: "error", message: "Invalid path" })
      };
    }
    selfUrl.searchParams.delete("path");

    for (const [k, v] of [...selfUrl.searchParams.entries()]) {
      if (v === "" || v == null) selfUrl.searchParams.delete(k);
    }

    const upstream = `https://newsapi.org/v2/${path}?${selfUrl.searchParams.toString()}`;

    const { signal, clear } = withTimeout(7000);
    let r;
    try {
      r = await fetch(upstream, {
        headers: { "X-Api-Key": process.env.NEWSAPI_KEY },
        signal
      });
    } finally {
      clear();
    }

    const body = await r.text();
    return {
      statusCode: r.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": r.ok ? "public, max-age=60" : "no-store",
        ...corsHeaders(origin)
      },
      body
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      body: JSON.stringify({ status: "error", message: e?.message || "Unexpected error" })
    };
  }
}
