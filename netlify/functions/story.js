import fetch from "node-fetch";

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: body.messages,
        temperature: 0.9
      })
    });

    const data = await response.json();

    return {
      statusCode: 200,
      body: JSON.stringify(data),
      headers: { "Content-Type": "application/json" }
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
