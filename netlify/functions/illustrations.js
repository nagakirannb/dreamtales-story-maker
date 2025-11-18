// netlify/functions/illustrations.js
// Generates a single cover illustration using OpenAI and returns a usable image URL.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

exports.handler = async function (event, context) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  if (!OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY env var");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server is missing OpenAI API key" })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON body" })
    };
  }

  const prompt = body.prompt;
  if (!prompt || typeof prompt !== "string") {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing 'prompt' string" })
    };
  }

  try {
    const openaiRes = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        n: 1,
        size: "1024x1024" // don't send response_format – default already includes b64_json
      })
    });

    const data = await openaiRes.json().catch(() => ({}));

    if (!openaiRes.ok) {
      console.error("OpenAI image error:", data);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: data.error?.message || data.error || "OpenAI image API error"
        })
      };
    }

    console.log("OpenAI image OK, raw data:", JSON.stringify(data).slice(0, 500) + "...");

    let url = null;

    // If OpenAI ever returns a direct URL
    if (data.data && Array.isArray(data.data) && data.data[0]) {
      const item = data.data[0];
      if (item.url) {
        url = item.url;
      } else if (item.b64_json) {
        // Convert base64 into a data URL so the browser can show it
        url = `data:image/png;base64,${item.b64_json}`;
      }
    }

    if (!url) {
      console.error("Could not find usable image field in response:", data);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "No usable image returned from OpenAI" })
      };
    }

    // ✅ This is what the frontend expects
    return {
      statusCode: 200,
      body: JSON.stringify({ url })
    };
  } catch (err) {
    console.error("Illustrations function exception:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Unexpected server error" })
    };
  }
};
