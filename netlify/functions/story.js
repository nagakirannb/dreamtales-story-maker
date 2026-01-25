// netlify/functions/story.js
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function utcDayString() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`; // YYYY-MM-DD (UTC)
}

async function getOrCreateProfile(userId) {
  const { data: existing, error: selErr } = await supabase
    .from("profiles")
    .select("plan")
    .eq("user_id", userId)
    .maybeSingle();

  if (selErr) throw selErr;

  if (existing?.plan) return existing.plan;

  // Create profile (default free)
  const { error: insErr } = await supabase
    .from("profiles")
    .insert({ user_id: userId, plan: "free" });

  if (insErr) throw insErr;
  return "free";
}

async function incrementUsageAtomic(userId, dayUtc) {
  // Atomic upsert: story_count = story_count + 1
  // Using Postgres "upsert then update" pattern via RPC-like SQL is best,
  // but Supabase JS doesn't expose raw "ON CONFLICT DO UPDATE story_count=story_count+1" cleanly without SQL.
  // We can do it with a single SQL RPC. We'll create one small function in Supabase.
  const { data, error } = await supabase.rpc("increment_daily_usage", {
    p_user_id: userId,
    p_day_utc: dayUtc
  });

  if (error) throw error;
  return data; // returns new_count
}

exports.handler = async (event, context) => {
  
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  return {
    statusCode: 500,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({
      error: "Missing Supabase env vars",
      missing: {
        SUPABASE_URL: !process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: !process.env.SUPABASE_SERVICE_ROLE_KEY
      }
    })
  };
}
    
  // CORS / preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      },
      body: "ok"
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  /*/ ✅ Mandatory login enforcement
  const user = context.clientContext && context.clientContext.user;
  if (!user || !user.sub) {
    return {
      statusCode: 401,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Please sign in to generate stories." })
    };
  }*/

  const userId = user.sub; // Netlify Identity user UUID
  const dayUtc = utcDayString();

  try {
    const plan = await getOrCreateProfile(userId);

    /*/ ✅ limits (free=2/day, paid=10/day)
    const dailyLimit = plan === "paid" ? 10 : 2;*/

    // IMPORTANT: We only want to count successful stories.
    // So we do story generation first, THEN increment usage.
    // But we still need to block early if user already at limit.
    // We'll read current usage first.

    const { data: usageRow, error: usageErr } = await supabase
      .from("daily_usage")
      .select("story_count")
      .eq("user_id", userId)
      .eq("day_utc", dayUtc)
      .maybeSingle();

    if (usageErr) throw usageErr;

    const currentCount = usageRow?.story_count || 0;
    if (currentCount >= dailyLimit) {
      return {
        statusCode: 429,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          error: `Daily limit reached (${dailyLimit}/day). Please upgrade to generate more stories.`,
          code: "DAILY_LIMIT_REACHED",
          plan,
          dailyLimit
        })
      };
    }

    // -----------------------------
    // ✅ YOUR EXISTING STORY GENERATION LOGIC GOES HERE
    // It should return the normal { choices: [...] } payload you currently send back.
    // -----------------------------

    // Example placeholder:
    // const storyResponse = await yourOpenAiCall(...);
    // const storyPayload = storyResponse;

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
  } 
  
  catch (err) {
    console.error("Function error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
// 🔴 Replace this with your real response:
    const storyPayload = { ok: true, message: "REPLACE_WITH_REAL_STORY_RESPONSE" };

    // If story generation succeeded, NOW increment usage atomically
    const newCount = await incrementUsageAtomic(userId, dayUtc);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        ...storyPayload,
        usage: {
          dayUtc,
          plan,
          dailyLimit,
          usedToday: newCount
        }
      })
    };
  } catch (err) {
  console.error("Story function fatal error:", err);
  console.error("Stack:", err?.stack);

  return {
    statusCode: 500,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({
      error: "Server crashed in story function",
      details: err?.message || String(err),
    }),
  };
}

};



