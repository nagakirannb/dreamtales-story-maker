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
        // IMPORTANT: no response_format here, your API doesn't accept it
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

    // Handle both shapes: URL or base64
    const item = data.data && data.data[0];
    if (!item) {
      console.error("No data[0] in OpenAI image response:", data);
      return json(500, { error: "No image returned from OpenAI" });
    }

    let url = item.url;
    if (!url && item.b64_json) {
      // Convert base64 PNG to a data URL for the browser
      url = `data:image/png;base64,${item.b64_json}`;
    }

    if (!url) {
      console.error("No image URL or base64 in response:", data);
      return json(500, { error: "No usable image in OpenAI response" });
    }

    return json(200, { url });
  } catch (err) {
    console.error("Image generation exception:", err);
    return json(500, {
      error: err.message || "Unexpected error",
      stack: String(err.stack || ""),
    });
  }
};
