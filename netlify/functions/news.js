const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }

  try {
    const url = new URL(event.rawUrl);
    const path = url.searchParams.get("path") || "top-headlines";
    url.searchParams.delete("path");

    const upstream = `https://newsapi.org/v2/${path}?${url.searchParams.toString()}`;
    const r = await fetch(upstream, {
      headers: { "X-Api-Key": process.env.NEWSAPI_KEY }
    });

    const body = await r.text();
    return {
      statusCode: r.status,
      headers: { "Content-Type": "application/json", ...CORS },
      body
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", ...CORS },
      body: JSON.stringify({ status: "error", message: e.message })
    };
  }
}
