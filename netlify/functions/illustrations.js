// netlify/functions/illustrations.js
// Generates ONE cover illustration for a story

exports.handler = async function (event, context) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("OPENAI_API_KEY is NOT set in Netlify for illustrations");
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Missing OPENAI_API_KEY on server (illustrations)."
        })
      };
    }

    const body = JSON.parse(event.body || "{}");
    const prompt = body.prompt;

    if (!prompt || typeof prompt !== "string") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No prompt provided for illustration." })
      };
    }

    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        n: 1,
        size: "512x512"
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Image API error:", data);
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: data.error || "Image API error" })
      };
    }

    const url = data?.data?.[0]?.url || null;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    };
  } catch (err) {
    console.error("Illustrations function error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
