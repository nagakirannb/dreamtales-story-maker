// netlify/functions/tts.js
// Serverless function to call OpenAI TTS and return base64 MP3

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  if (!OPENAI_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Missing OPENAI_API_KEY environment variable" }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  const text = (payload.text || "").trim();
  const languageCode = payload.languageCode || "en-US";

  if (!text) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing 'text' field for TTS" }),
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        input: text,
        voice: "alloy",
        format: "mp3",
        // Optional hint:
        // language: languageCode,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI TTS error:", errText);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "OpenAI TTS request failed",
          details: errText.slice(0, 400),
        }),
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString("base64");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio: base64Audio }),
    };
  } catch (err) {
    console.error("TTS function exception:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "TTS function exception",
        details: String(err),
      }),
    };
  }
};
