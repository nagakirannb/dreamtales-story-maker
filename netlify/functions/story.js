// netlify/functions/story.js

exports.handler = async function (event, context) {
  try {
    // 1. Check if key exists
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("OPENAI_API_KEY is NOT set in Netlify environment");
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Missing OPENAI_API_KEY on server. Set it in Netlify Environment Variables."
        })
      };
    }

    // 2. Parse request body
    const body = JSON.parse(event.body || "{}");
    const messages = body.messages || [];

    if (!Array.isArray(messages) || messages.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No messages provided to story function." })
      };
    }

    // 3. Call OpenAI
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages,
        temperature: 0.9
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI API error:", data);
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: data.error || "OpenAI API error" })
      };
    }

    // 4. Return OpenAI response back to browser
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    };
  } catch (err) {
    console.error("Function error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};


