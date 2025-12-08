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

  try {
    // Call OpenAI images API using plain fetch
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        n: 1,
        size: "1024x1024",
        // Ask explicitly for base64; we still handle URL if OpenAI changes defaults.
        response_format: "b64_json",
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("OpenAI image error:", data);
      return {
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          error: data?.error?.message || data?.error || "OpenAI image API error",
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

    // Prefer URL if present, otherwise build data URL from base64
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

    // NEW: also expose imageUrl for the new front-end, while keeping `url` for backwards compatibility
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
    console.error("Illustrations function caught error:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: err.message || "Unexpected error" }),
    };
  }
};
