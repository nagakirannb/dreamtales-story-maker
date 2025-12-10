// netlify/functions/illustrations.js

// Netlify function to generate a single cover image using OpenAI gpt-image-1
// Returns: { url: "...", imageUrl: "..." }

exports.handler = async (event, context) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "ok",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("Missing OPENAI_API_KEY in environment");
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Server missing OpenAI API key" }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  const prompt = body.prompt;
  if (!prompt || typeof prompt !== "string") {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Missing 'prompt' string" }),
    };
  }

  // 🔧 KEY CHANGE: give OpenAI more time than before
  // If Netlify’s own function limit is lower than this, you may still hit a 504
  // from Netlify—but at least *we* won’t kill it early.
  const IMAGE_TIMEOUT_MS = 28000; // 22 seconds instead of ~9.5s

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, IMAGE_TIMEOUT_MS);

  try {
    const response = await fetch(
      "https://api.openai.com/v1/images/generations",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-image-1",
          prompt,
          n: 1,
          size: "1024x1024", // valid sizes: "1024x1024", "1024x1536", "1536x1024", "auto"
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("OpenAI image error:", data);
      return {
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          error:
            data?.error?.message || data?.error || "OpenAI image API error",
        }),
      };
    }

    const first = data?.data?.[0];
    if (!first) {
      console.error("No data[0] in OpenAI response:", data);
      return {
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "No image returned from OpenAI" }),
      };
    }

    let url = first.url || null;
    if (!url && first.b64_json) {
      url = `data:image/png;base64,${first.b64_json}`;
    }

    if (!url) {
      console.error("No url or b64_json in OpenAI response:", data);
      return {
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "No usable image in OpenAI response" }),
      };
    }

    const payload = { url, imageUrl: url };

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(payload),
    };
  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === "AbortError") {
      console.error(
        `OpenAI image request aborted after ${IMAGE_TIMEOUT_MS} ms (local timeout).`
      );
      return {
        statusCode: 504,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          error:
            "Image generation took too long on our side. Please try again in a moment.",
        }),
      };
    }

    console.error("Illustrations function caught error:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: err.message || "Unexpected error" }),
    };
  }
};
