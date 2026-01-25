// netlify/functions/story.js
console.log("clientContext:", JSON.stringify(context.clientContext));
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  
  process.env.SUPABASE_SERVICE_KEY; // fallback

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function utcDayString() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function getOrCreateProfile(userId) {
  const { data: existing, error: selErr } = await supabase
    .from("profiles")
    .select("plan")
    .eq("user_id", userId)
    .maybeSingle();

  if (selErr) throw selErr;
  if (existing?.plan) return existing.plan;

  const { error: insErr } = await supabase
    .from("profiles")
    .insert({ user_id: userId, plan: "free" });

  if (insErr) throw insErr;
  return "free";
}

async function getCurrentUsageCount(userId, dayUtc) {
  const { data: usageRow, error: usageErr } = await supabase
    .from("daily_usage")
    .select("story_count")
    .eq("user_id", userId)
    .eq("day_utc", dayUtc)
    .maybeSingle();

  if (usageErr) throw usageErr;
  return usageRow?.story_count || 0;
}

async function incrementUsageAtomic(userId, dayUtc) {
  const { data, error } = await supabase.rpc("increment_daily_usage", {
    p_user_id: userId,
    p_day_utc: dayUtc,
  });
  if (error) throw error;
  return Number(data || 0);
}

function isSuccessfulStoryPayload(openAiPayload) {
  const content =
    openAiPayload?.choices?.[0]?.message?.content ||
    openAiPayload?.choices?.[0]?.text ||
    "";
  return typeof content === "string" && content.trim().length >= 50;
}

exports.handler = async (event, context) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "ok" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    // ✅ Mandatory login enforcement (Netlify Identity)
    const user = context.clientContext && context.clientContext.user;
    if (!user || !user.sub) {
      return {
        statusCode: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Please sign in to generate stories." }),
      };
    }

    const userId = user.sub;
    const dayUtc = utcDayString();

    const plan = await getOrCreateProfile(userId);
    const dailyLimit = plan === "paid" ? 10 : 2;

    const currentCount = await getCurrentUsageCount(userId, dayUtc);
    if (currentCount >= dailyLimit) {
      return {
        statusCode: 429,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          error: `Daily limit reached (${dailyLimit}/day). Please upgrade to generate more stories.`,
          code: "DAILY_LIMIT_REACHED",
          plan,
          dailyLimit,
          usedToday: currentCount,
          dayUtc,
        }),
      };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Missing OPENAI_API_KEY on server. Set it in Netlify Environment Variables.",
        }),
      };
    }

    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Invalid JSON body." }),
      };
    }

    const messages = body.messages || [];
    if (!Array.isArray(messages) || messages.length === 0) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "No messages provided to story function." }),
      };
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages,
        temperature: 0.9,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("OpenAI API error:", data);
      return {
        statusCode: response.status,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          error: data?.error?.message || data?.error || "OpenAI API error",
        }),
      };
    }

    if (!isSuccessfulStoryPayload(data)) {
      console.error("OpenAI payload missing story content:", data);
      return {
        statusCode: 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Story generation returned an unexpected response. Not counted.",
        }),
      };
    }

    const newCount = await incrementUsageAtomic(userId, dayUtc);

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        ...data,
        usage: {
          dayUtc,
          plan,
          dailyLimit,
          usedToday: newCount,
        },
      }),
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



