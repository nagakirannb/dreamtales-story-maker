// netlify/functions/illustrations.js

// Netlify function to generate a single cover image using OpenAI gpt-image-1
// Returns: { url: "...", imageUrl: "..." }

let openaiClientPromise;

/**
 * Lazily load and cache the OpenAI client.
 * This pattern works fine in Netlify's CommonJS function environment.
 */
async function getOpenAIClient() {
  if (!openaiClientPromise) {
    openaiClientPromise = (async () => {
      const mod = await import("openai");
      const OpenAI = mod.default;

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("Missing OPENAI_API_KEY environment variable");
      }

      return new OpenAI({
        apiKey,
        timeout: 28000, // 28s client-side timeout
      });
    })();
  }
  return openaiClientPromise;
}

exports.handler = async (event) => {
  // --- CORS preflight ---
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

  // --- Method guard ---
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  // --- Parse body ---
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
    const openai = await getOpenAIClient();

    console.log("Illustration prompt length:", prompt.length);

    // Call OpenAI Images API via official client
    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      n: 1,
      size: "1024x1024", // valid sizes: 1024x1024, 1024x1536, 1536x1024, or "auto"
    });

    const first = result.data && result.data[0];
    if (!first) {
      console.error("No data[0] in images.generate result:", result);
      return {
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "No image returned from OpenAI" }),
      };
    }

    // Prefer URL; fall back to base64 if returned that way
    let url = first.url || null;
    if (!url && first.b64_json) {
      url = `data:image/png;base64,${first.b64_json}`;
    }

    if (!url) {
      console.error("No url or b64_json in image result:", first);
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
    // Distinguish between timeout and other errors
    console.error("Illustrations function caught error:", err);

    const isTimeout =
      err && (err.type === "request_timeout" || /timeout/i.test(err.message || ""));

    return {
      statusCode: isTimeout ? 504 : 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        error: isTimeout
          ? "Image generation took too long. Please try again in a moment."
          : err.message || "Unexpected error",
      }),
    };
  }
};
