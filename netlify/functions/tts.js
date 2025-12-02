// netlify/functions/tts.js
// Serverless function to call OpenAI TTS and return MP3 audio

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

  // Front-end sends `language`, older version used `languageCode`
  const language = payload.language || payload.languageCode || "en-US";

  const voice = (payload.voice || "alloy").trim() || "alloy";

  // Front-end sends `voice` (e.g. "alloy"), but default if missing
  //const voice = payload.voice || "alloy";

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
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        input: text,
        voice,
        format: "mp3",
        // language: language, // optional hint; voice usually determines accent
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

    // 🔴 IMPORTANT CHANGE:
    // Return raw audio (base64) with audio/mpeg + isBase64Encoded
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "audio/mpeg",
      },
      body: base64Audio,
      isBase64Encoded: true,
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
