// netlify/functions/illustrations.js
// Super-simple: call OpenAI image API and always return { url: "data:image/png;base64,..." }

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
        size: "1024x1024"   // don't set response_format; default includes b64_json
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

    console.log(
      "OpenAI image OK, first item keys:",
      data && data.data && data.data[0] ? Object.keys(data.data[0]) : "no item"
    );

    const first = data && data.data && Array.isArray(data.data) ? data.data[0] : null;

    if (!first || !first.b64_json) {
      console.error("No b64_json in OpenAI response:", data);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "No b64_json returned from OpenAI" })
      };
    }

    const url = `data:image/png;base64,${first.b64_json}`;

    // ✅ This is all the frontend expects:
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
