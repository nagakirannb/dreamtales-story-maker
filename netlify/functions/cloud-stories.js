// netlify/functions/cloud-stories.js

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  };
}

function getSupabaseAdminKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_ROLE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY_SECRET ||
    ""
  );
}

exports.handler = async (event, context) => {
  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders(),
      body: ""
    };
  }

  try {
    const user = context.clientContext && context.clientContext.user;
    if (!user) {
      return {
        statusCode: 401,
        headers: corsHeaders(),
        body: JSON.stringify({ error: "Not authenticated" })
      };
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = getSupabaseAdminKey();
    const TABLE = process.env.SUPABASE_TABLE || "stories";

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return {
        statusCode: 500,
        headers: corsHeaders(),
        body: JSON.stringify({
          error: "Supabase env vars not configured",
          details: {
            hasUrl: Boolean(SUPABASE_URL),
            hasServiceKey: Boolean(SUPABASE_SERVICE_KEY),
            table: TABLE
          }
        })
      };
    }

    const userId = user.sub || user.email;
    if (!userId) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: "User id missing in identity context" })
      };
    }

    // ---------- GET: list stories ----------
    if (event.httpMethod === "GET") {
      const url =
        `${SUPABASE_URL}/rest/v1/${TABLE}` +
        `?user_id=eq.${encodeURIComponent(userId)}` +
        `&order=created_at.desc`;

      const res = await fetch(url, {
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          Accept: "application/json"
        }
      });

      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 400) }; }

      if (!res.ok) {
        console.error("Supabase GET error:", data);
        return {
          statusCode: res.status,
          headers: corsHeaders(),
          body: JSON.stringify({
            error: "Supabase fetch error",
            details: data
          })
        };
      }

      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({ stories: data })
      };
    }

    // ---------- POST: insert story ----------
    if (event.httpMethod === "POST") {
      let body;
      try {
        body = JSON.parse(event.body || "{}");
      } catch {
        return {
          statusCode: 400,
          headers: corsHeaders(),
          body: JSON.stringify({ error: "Invalid JSON body" })
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
        coverImageUrl
      } = body;

      if (!pages || !Array.isArray(pages) || pages.length === 0) {
        return {
          statusCode: 400,
          headers: corsHeaders(),
          body: JSON.stringify({ error: "Missing story pages" })
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
        cover_image_url: coverImageUrl || null
      };

      const url = `${SUPABASE_URL}/rest/v1/${TABLE}`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify(insertPayload)
      });

      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 400) }; }

      if (!res.ok) {
        console.error("Supabase POST error:", data);
        return {
          statusCode: res.status,
          headers: corsHeaders(),
          body: JSON.stringify({
            error: "Supabase insert error",
            details: data
          })
        };
      }

      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({ story: data && data[0] })
      };
    }

    return {
      statusCode: 405,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Method not allowed" })
    };
  } catch (err) {
    console.error("cloud-stories fatal:", err?.stack || err);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({
        error: "Cloud stories fatal",
        details: String(err?.message || err)
      })
    };
  }
};
