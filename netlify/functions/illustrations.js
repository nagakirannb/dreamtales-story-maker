// netlify/functions/illustrations.js

exports.handler = async (event) => {
  const json = (statusCode, obj) => ({
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  });

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY env var");
    return json(500, { error: "Missing OPENAI_API_KEY" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    console.error("Invalid JSON body:", e);
    return json(400, { error: "Invalid JSON body" });
  }

  const prompt = body.prompt;
  if (!prompt || typeof prompt !== "string") {
    return json(400, { error: "Missing 'prompt' string" });
  }

  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        size: "1024x1024",
        // IMPORTANT: ask for base64 output, then convert to data URL
        response_format: "b64_json",
      }),
    });

    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      console.error("Non-JSON response from OpenAI:", text);
      return json(500, { error: "Non-JSON response from OpenAI", raw: text });
    }

    if (!res.ok) {
      console.error("OpenAI image error:", data);
      const msg =
        data.error?.message ||
        data.error ||
        data.message ||
        JSON.stringify(data);
      return json(res.status, { error: msg });
    }

    const item = data.data && data.data[0];
    const b64 = item && item.b64_json;

    if (!b64) {
      console.error("No base64 image in OpenAI response:", data);
      return json(500, { error: "No image data returned from OpenAI" });
    }

    // Convert base64 to a data URL that the browser <img> can use directly
    const url = `data:image/png;base64,${b64}`;

    return json(200, { url });
  } catch (err) {
    console.error("Image generation exception:", err);
    return json(500, {
      error: err.message || "Unexpected error",
      stack: String(err.stack || ""),
    });
  }
};
