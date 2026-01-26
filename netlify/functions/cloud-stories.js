// netlify/functions/cloud-stories.js
// Uses Supabase JS client (recommended) instead of REST calls

const { createClient } = require("@supabase/supabase-js");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

exports.handler = async (event, context) => {
  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "ok" };
  }

  // Auth (Netlify Identity)
  const user = context.clientContext && context.clientContext.user;
  if (!user || !(user.sub || user.email)) {
    return json(401, { error: "Not authenticated" });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;

  // Prefer service role key (most common name)
  const SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY || // if you used this name earlier
    process.env.SUPABASE_SERVICE_ROLE_KEY; // fallback (same)

  const TABLE = process.env.SUPABASE_TABLE || "stories";

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json(500, {
      error: "Supabase env vars not configured",
      details:
        "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY).",
    });
  }

  // Use Netlify Identity stable id
  const userId = user.sub || user.email;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  try {
    // -------- GET: list stories ----------
    if (event.httpMethod === "GET") {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Supabase GET error:", error);
        return json(500, {
          error: "Supabase select error",
          details: error.message || error,
        });
      }

      return json(200, { stories: data || [] });
    }

    // -------- POST: insert story ----------
    if (event.httpMethod === "POST") {
      let body = {};
      try {
        body = JSON.parse(event.body || "{}");
      } catch {
        return json(400, { error: "Invalid JSON body" });
      }

      const {
        title,
        childName,
        age,
        theme,
        style,
        length,
        moral,
        pages,
        coverImageUrl,
      } = body;

      if (!pages || !Array.isArray(pages) || pages.length === 0) {
        return json(400, { error: "Missing story pages" });
      }

      const insertPayload = {
        user_id: userId,
        title: title || (childName ? `Story for ${childName}` : "Bedtime story"),
        child_name: childName || null,
        age: age || null,
        theme: theme || null,
        style: style || null,
        length: length || null,
        moral: moral || null,
        pages, // jsonb column
        cover_image_url: coverImageUrl || null,
      };

      const { data, error } = await supabase
        .from(TABLE)
        .insert(insertPayload)
        .select("*")
        .single();

      if (error) {
        console.error("Supabase INSERT error:", error);
        return json(500, {
          error: "Supabase insert error",
          details: error.message || error,
        });
      }

      return json(200, { story: data });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    console.error("cloud-stories handler exception:", err);
    return json(500, { error: "Server error", details: String(err) });
  }
};
