export async function handler(event) {
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
      headers: { "Content-Type": "application/json" },
      body
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "error", message: e.message })
    };
  }
}
