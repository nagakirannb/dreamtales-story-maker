// netlify/functions/cloud-stories.js
const { createClient } = require("@supabase/supabase-js");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || "";
}

function getSupabaseAdminKey() {
  // Support common env var names
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_ROLE_SECRET ||
    ""
  );
}

exports.handler = async (event, context) => {
  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "ok" };
  }

  try {
    const user = context.clientContext && context.clientContext.user;

    if (!user) {
      return {
        statusCode: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Not authenticated" }),
      };
    }

    const SUPABASE_URL = getSupabaseUrl();
    const SUPABASE_ADMIN_KEY = getSupabaseAdminKey();
    const TABLE = process.env.SUPABASE_TABLE || "stories";

    if (!SUPABASE_URL || !SUPABASE_ADMIN_KEY) {
      console.error("Missing Supabase env vars", {
        SUPABASE_URL_present: !!SUPABASE_URL,
        SUPABASE_ADMIN_KEY_present: !!SUPABASE_ADMIN_KEY,
      });
      return {
        statusCode: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Supabase env vars not configured",
          details: {
            SUPABASE_URL_present: !!SUPABASE_URL,
            SUPABASE_ADMIN_KEY_present: !!SUPABASE_ADMIN_KEY,
          },
        }),
      };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ADMIN_KEY, {
      auth: { persistSession: false },
    });

    const userId = user.sub || user.email;
    if (!userId) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "User id not found in identity token" }),
      };
    }

    // ---------- GET (list) ----------
    if (event.httpMethod === "GET") {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Supabase GET error:", error);
        return {
          statusCode: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          body: JSON.stringify({
            error: "Supabase fetch error",
            details: error,
          }),
        };
      }

      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ stories: data || [] }),
      };
    }

    // ---------- POST (insert) ----------
    if (event.httpMethod === "POST") {
      let body = {};
      try {
        body = JSON.parse(event.body || "{}");
      } catch {
        return {
          statusCode: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Invalid JSON body" }),
        };
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
        return {
          statusCode: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Missing story pages" }),
        };
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
        pages,
        cover_image_url: coverImageUrl || null,
      };

      const { data, error } = await supabase
        .from(TABLE)
        .insert(insertPayload)
        .select("*")
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Supabase POST error:", error, "Payload:", {
          ...insertPayload,
          pages: `Array(${pages.length})`,
        });

        return {
          statusCode: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          body: JSON.stringify({
            error: "Supabase insert error",
            details: error,
          }),
        };
      }

      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ story: data }),
      };
    }

    return {
      statusCode: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  } catch (err) {
    console.error("cloud-stories unhandled error:", err);
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Cloud stories server error",
        details: String(err?.message || err),
      }),
    };
  }
};
