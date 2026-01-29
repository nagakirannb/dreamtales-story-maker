// netlify/functions/cloud-stories.js
// Save + load stories in Supabase using REST (no SDK dependency)
// Always returns JSON (prevents Netlify "Internal Error. ID: ...")

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || "";
}

function getSupabaseTable() {
  return process.env.SUPABASE_TABLE || "stories";
}

function getSupabaseAdminKey() {
  // support common env var names (you have both in Netlify)
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_ROLE_SECRET ||
    ""
  );
}

async function readJsonSafe(res) {
  const text = await res.text();
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null, text };
  }
}

exports.handler = async (event, context) => {
  // Always respond with JSON
  const jsonResponse = (statusCode, payload) => ({
    statusCode,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  try {
    // Preflight
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 200, headers: CORS_HEADERS, body: "ok" };
    }

    // Auth (Netlify Identity)
    const user = context.clientContext && context.clientContext.user;
    if (!user) {
      return jsonResponse(401, { error: "Not authenticated" });
    }

    const SUPABASE_URL = getSupabaseUrl();
    const SUPABASE_ADMIN_KEY = getSupabaseAdminKey();
    const TABLE = getSupabaseTable();

    if (!SUPABASE_URL || !SUPABASE_ADMIN_KEY) {
      return jsonResponse(500, {
        error: "Supabase env vars not configured",
        details: {
          hasUrl: Boolean(SUPABASE_URL),
          hasAdminKey: Boolean(SUPABASE_ADMIN_KEY),
          table: TABLE,
        },
      });
    }

    const userId = user.sub || user.email;
    if (!userId) {
      return jsonResponse(400, { error: "User id missing in token" });
    }

    // Helpers for calling Supabase REST
    const supabaseFetch = async (url, options = {}) => {
      return fetch(url, {
        ...options,
        headers: {
          apikey: SUPABASE_ADMIN_KEY,
          Authorization: `Bearer ${SUPABASE_ADMIN_KEY}`,
          ...options.headers,
        },
      });
    };

    // ---------------- GET: list stories ----------------
    if (event.httpMethod === "GET") {
      const url =
        `${SUPABASE_URL}/rest/v1/${TABLE}` +
        `?user_id=eq.${encodeURIComponent(userId)}` +
        `&order=created_at.desc`;

      const res = await supabaseFetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      const { json, text } = await readJsonSafe(res);

      if (!res.ok) {
        console.error("Supabase GET error:", res.status, json || text);
        return jsonResponse(res.status, {
          error: "Supabase GET failed",
          details: json || text,
        });
      }

      return jsonResponse(200, { stories: json || [] });
    }

    // ---------------- POST: insert story ----------------
    if (event.httpMethod === "POST") {
      let body = {};
      try {
        body = JSON.parse(event.body || "{}");
      } catch {
        return jsonResponse(400, { error: "Invalid JSON body" });
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
        return jsonResponse(400, { error: "Missing story pages" });
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

      const url = `${SUPABASE_URL}/rest/v1/${TABLE}`;

      const res = await supabaseFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation",
          Accept: "application/json",
        },
        body: JSON.stringify(insertPayload),
      });

      const { json, text } = await readJsonSafe(res);

      if (!res.ok) {
        console.error("Supabase POST error:", res.status, json || text);
        return jsonResponse(res.status, {
          error: "Supabase insert failed",
          details: json || text,
        });
      }

      // Supabase returns an array when Prefer: return=representation
      const inserted = Array.isArray(json) ? json[0] : json;
      return jsonResponse(200, { story: inserted });
    }

    // ---------------- Not allowed ----------------
    return jsonResponse(405, { error: "Method not allowed" });
  } catch (err) {
    console.error("cloud-stories function crashed:", err);
    // This prevents Netlify generic "Internal Error. ID: ..."
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Cloud stories function exception",
        details: String(err?.message || err),
        stack: err?.stack || null,
      }),
    };
  }
};
