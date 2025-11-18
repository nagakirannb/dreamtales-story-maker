// netlify/functions/illustrations.js

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Missing OPENAI_API_KEY" }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  const prompt = body.prompt;
  if (!prompt || typeof prompt !== "string") {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing 'prompt' string" }),
    };
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
        size: "1024x1024", // valid sizes: 1024x1024, 1024x1536, 1536x1024, auto
      }),
    });

    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      console.error("Non-JSON image response:", text);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Non-JSON response from OpenAI" }),
      };
    }

    if (!res.ok) {
      console.error("OpenAI image error:", data);
      // Surface actual error message so you see it in the UI
      const msg =
        data.error?.message ||
        data.error ||
        data.message ||
        JSON.stringify(data);
      return {
        statusCode: res.status,
        body: JSON.stringify({ error: msg }),
      };
    }

    const url = data.data && data.data[0] && data.data[0].url;
    if (!url) {
      console.error("No URL in image response:", data);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "No image URL returned" }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ url }),
    };
  } catch (err) {
    console.error("Image generation error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
