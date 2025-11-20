// supabase/functions/illustrations/index.ts

import { serve } from "https://deno.land/std@0.202.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.15.0";

serve(async (req) => {
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: "Missing prompt" }), {
        status: 400,
      });
    }

    const openai = new OpenAI({
      apiKey: Deno.env.get("OPENAI_API_KEY"),
    });

    // Call GPT-Image-1 correctly (2025 format)
    const imgRes = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
      quality: "high"
    });

    // Try URL first
    const data = imgRes.data?.[0];
    if (!data) {
      return new Response(
        JSON.stringify({ error: "No data returned from OpenAI", raw: imgRes }),
        { status: 500 },
      );
    }

    // Preferred: URL from OpenAI (if account allows)
    if (data.url) {
      return new Response(JSON.stringify({ url: data.url }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Fallback: base64 → data URL
    if (data.b64_json) {
      const dataUrl = `data:image/png;base64,${data.b64_json}`;
      return new Response(JSON.stringify({ url: dataUrl }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "No usable URL or base64 in image response", raw: imgRes }),
      { status: 500 },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
    });
  }
});
