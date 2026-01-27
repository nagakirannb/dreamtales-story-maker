// netlify/functions/cloud-stories.js
// Cloud save/load for stories using Supabase.
// Requires Netlify Identity JWT (Authorization: Bearer <token>) so that
// context.clientContext.user is populated.

const { createClient } = require("@supabase/supabase-js");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

function json(statusCode, bodyObj, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(bodyObj),
  };
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
    const user = context?.clientContext?.user;
    if (!user || !(user.sub || user.email)) {
      return json(401, { error: "Not authenticated" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ADMIN_KEY = getSupabaseAdminKey();
    const TABLE = process.env.SUPABASE_TABLE || "stories";

    if (!SUPABASE_URL || !SUPABASE_ADMIN_KEY) {
      return json(500, {
        error:
          "Supabase env vars not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY).",
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ADMIN_KEY, {
      auth: { persistSession: false },
    });

    const userId = user.sub || user.email;

    if (event.httpMethod === "GET") {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("cloud-stories GET error:", error);
        return json(500, {
          error: "Supabase fetch failed",
          details: error.message || String(error),
        });
      }

      return json(200, { stories: data || [] });
    }

    if (event.httpMethod === "POST") {
      let body;
      try {
        body = JSON.parse(event.body || "{}") || {};
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

      if (!Array.isArray(pages) || pages.length === 0) {
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
        pages,
        cover_image_url: coverImageUrl || null,
      };

      const { data, error } = await supabase
        .from(TABLE)
        .insert(insertPayload)
        .select("*")
        .single();

      if (error) {
        console.error("cloud-stories POST error:", error);
        return json(500, {
          error: "Supabase insert failed",
          details: error.message || String(error),
        });
      }

      return json(200, { story: data });
    }

    if (event.httpMethod === "DELETE") {
      // Optional delete support: /cloud-stories?id=<uuid>
      const id = event.queryStringParameters?.id;
      if (!id) return json(400, { error: "Missing id" });

      const { error } = await supabase
        .from(TABLE)
        .delete()
        .eq("id", id)
        .eq("user_id", userId);

      if (error) {
        console.error("cloud-stories DELETE error:", error);
        return json(500, {
          error: "Supabase delete failed",
          details: error.message || String(error),
        });
      }

      return json(200, { ok: true });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    console.error("cloud-stories fatal error:", err);
    return json(500, {
      error: "Cloud stories error",
      details: err?.message ? err.message : String(err),
    });
  }
};
