// netlify/functions/tts.js
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const text = body.text;
    const language = body.language || "en-US";
    const voice = body.voice || "alloy";

    if (!text || typeof text !== "string" || !text.trim()) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing or empty 'text' field" }),
      };
    }

    // Call OpenAI TTS
    const response = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",  // or the TTS model you want
      voice,
      input: text,
      // OpenAI SDK returns a buffer-like object
    });

    // Turn into a Node Buffer and then base64 encode for Netlify
    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const base64Audio = audioBuffer.toString("base64");

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "audio/mpeg",
      },
      body: base64Audio,
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error("TTS error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "TTS failed",
        details: err.message || String(err),
      }),
    };
  }
};
