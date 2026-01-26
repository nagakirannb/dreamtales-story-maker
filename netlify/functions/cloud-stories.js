// netlify/functions/cloud-stories.js
// Stores + fetches stories per Netlify Identity user from Supabase via REST API

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(statusCode, bodyObj, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(bodyObj),
  };
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

exports.handler = async (event, context) => {
  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "ok" };
  }

  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  // ---- Netlify Identity user (requires Authorization: Bearer <token> from client) ----
  const user = context?.clientContext?.user;
  if (!user || !user.sub) {
    // IMPORTANT: require user.sub so we always use a stable UUID-like identifier
    return json(401, { error: "Not authenticated" });
  }
  const userId = user.sub;

  // ---- Supabase env vars ----
  const SUPABASE_URL = process.env.SUPABASE_URL;
  // Support multiple possible env var names to avoid “it works locally but not on Netlify”
  const SUPABASE_SERVICE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_KEY; // (kept for backward compatibility)

  const TABLE = process.env.SUPABASE_TABLE || "stories";

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return json(500, {
      error: "Supabase env vars not configured",
      missing: {
        SUPABASE_URL: !SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY_or_SUPABASE_SERVICE_KEY: !SUPABASE_SERVICE_KEY,
      },
    });
  }

  // Ensure no trailing slash
  const baseUrl = SUPABASE_URL.replace(/\/+$/, "");

  // ---- GET: list stories for this user ----
  if (event.httpMethod === "GET") {
    const url =
      `${baseUrl}/rest/v1/${encodeURIComponent(TABLE)}` +
      `?user_id=eq.${encodeURIComponent(userId)}` +
      `&order=created_at.desc`;

    try {
      const res = await fetch(url, {
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          Accept: "application/json",
        },
      });

      const data = await safeJson(res);

      if (!res.ok) {
        console.error("Supabase GET error:", data || (await res.text()));
        return json(res.status, {
          error: "Supabase fetch error",
          details: data || null,
        });
      }

      return json(200, { stories: Array.isArray(data) ? data : [] });
    } catch (err) {
      console.error("Cloud stories GET exception:", err);
      return json(500, { error: "Cloud stories GET exception", details: String(err) });
    }
  }

  // ---- POST: save a story ----
  if (event.httpMethod === "POST") {
    let body;
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
      pages, // must be JSON/JSONB in Supabase table
      cover_image_url: coverImageUrl || null,
    };

    const url = `${baseUrl}/rest/v1/${encodeURIComponent(TABLE)}`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(insertPayload),
      });

      const data = await safeJson(res);

      if (!res.ok) {
        console.error("Supabase POST error:", data || (await res.text()));
        return json(res.status, {
          error: "Supabase insert error",
          details: data || null,
        });
      }

      // Supabase returns an array when Prefer: return=representation
      const story = Array.isArray(data) ? data[0] : data;

      return json(200, { story });
    } catch (err) {
      console.error("Cloud stories POST exception:", err);
      return json(500, { error: "Cloud stories POST exception", details: String(err) });
    }
  }

  return json(405, { error: "Method not allowed" });
};
