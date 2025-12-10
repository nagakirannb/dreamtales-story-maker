// netlify/functions/illustrations.js
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function handler(event) {
  // Only allow POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const { prompt } = JSON.parse(event.body || "{}");

    if (!prompt || !prompt.trim()) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing 'prompt' in request body" }),
      };
    }

    console.log("Illustration prompt:", prompt);

    // ✅ Keep this call as light as possible so it finishes under ~10s
    const image = await client.images.generate({
      model: "gpt-image-1",
      prompt,
      n: 1,                 // just one image
      size: "1024x1024",    // you can switch to "512x512" if timeouts persist
      // ❌ no `response_format`, no `quality: "hd"` – both add work/latency
    });

    const imageUrl = image.data?.[0]?.url;

    if (!imageUrl) {
      throw new Error("No image URL returned from OpenAI");
    }

    console.log("Generated image URL:", imageUrl);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ imageUrl }),
    };
  } catch (err) {
    console.error("Illustration function error:", err);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: err.message || "Unexpected error in illustration function",
      }),
    };
  }
}
