// netlify/functions/cloud-stories.js
const { createClient } = require("@supabase/supabase-js");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
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
  // Always show we reached the handler (so logs won't be empty)
  console.log("[cloud-stories] hit", event.httpMethod);

  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "ok" };
  }

  try {
    // Auth (Netlify Identity)
    const user = context.clientContext && context.clientContext.user;
    if (!user) {
      console.warn("[cloud-stories] no user in context");
      return json(401, { error: "Not authenticated" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ADMIN_KEY = getSupabaseAdminKey();
    const TABLE = process.env.SUPABASE_TABLE || "stories";

    if (!SUPABASE_URL || !SUPABASE_ADMIN_KEY) {
      console.error("[cloud-stories] missing env", {
        hasUrl: !!SUPABASE_URL,
        hasKey: !!SUPABASE_ADMIN_KEY,
      });
      return json(500, {
        error: "Supabase env vars not configured",
        details:
          "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY) in Netlify env vars.",
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ADMIN_KEY, {
      auth: { persistSession: false },
    });

    const userId = user.sub || user.id || user.email;
    if (!userId) {
      console.error("[cloud-stories] could not derive userId", user);
      return json(400, { error: "Could not determine user id" });
    }

    // -------- GET: list stories --------
    if (event.httpMethod === "GET") {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[cloud-stories] supabase GET error", error);
        return json(500, {
          error: "Cloud stories error",
          details: error.message || String(error),
        });
      }

      return json(200, { stories: data || [] });
    }

    // -------- POST: insert story --------
    if (event.httpMethod === "POST") {
      let body = {};
      try {
        body = JSON.parse(event.body || "{}");
      } catch (e) {
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
        console.error("[cloud-stories] supabase POST error", error);
        return json(500, {
          error: "Cloud stories error",
          details: error.message || String(error),
        });
      }

      return json(200, { story: data });
    }

    // -------- DELETE (optional): delete story by id --------
    if (event.httpMethod === "DELETE") {
      const id = event.queryStringParameters && event.queryStringParameters.id;
      if (!id) return json(400, { error: "Missing id" });

      const { error } = await supabase
        .from(TABLE)
        .delete()
        .eq("id", id)
        .eq("user_id", userId);

      if (error) {
        console.error("[cloud-stories] supabase DELETE error", error);
        return json(500, {
          error: "Cloud stories error",
          details: error.message || String(error),
        });
      }

      return json(200, { ok: true });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    // This guarantees you NEVER get Netlify's generic Internal Error again (in most cases)
    console.error("[cloud-stories] fatal", err);
    return json(500, {
      error: "Cloud stories fatal error",
      details: err?.message || String(err),
    });
  }
};
