// netlify/functions/illustrations.js

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
    const prompts = Array.isArray(body.prompts) ? body.prompts : [];

    if (prompts.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No prompts provided for illustrations." })
      };
    }

    // Limit cost: max 6 images
    const maxImages = Math.min(prompts.length, 6);

    const urls = [];

    for (let i = 0; i < maxImages; i++) {
      const prompt = prompts[i];

      const response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-image-1",
          prompt: prompt,
          n: 1,
          size: "512x512"
        })
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Image API error:", data);
        // skip this one, continue with others
        urls.push(null);
        continue;
      }

      const url = data?.data?.[0]?.url || null;
      urls.push(url);
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls })
    };
  } catch (err) {
    console.error("Illustrations function error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
