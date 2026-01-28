// netlify/functions/cloud-stories.js

exports.handler = async (event, context) => {
const user = context.clientContext && context.clientContext.user;

if (!user) {
return {
statusCode: 401,
body: JSON.stringify({ error: "Not authenticated" })
};
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TABLE = process.env.SUPABASE_TABLE || "stories";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
return {
statusCode: 500,
body: JSON.stringify({ error: "Supabase env vars not configured" })
};
}

const userId = user.sub || user.email; // Netlify Identity user id

if (event.httpMethod === "GET") {
// List stories for this user
const url = `${SUPABASE_URL}/rest/v1/${TABLE}?user_id=eq.${encodeURIComponent(
     userId
   )}&order=created_at.desc`;

try {
const res = await fetch(url, {
headers: {
apikey: SUPABASE_SERVICE_KEY,
Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
Accept: "application/json"
}
});

const data = await res.json();

if (!res.ok) {
        console.error("Supabase GET error:", data);
        return {
          statusCode: res.status,
          body: JSON.stringify({ error: "Supabase fetch error" })
        };
      }
  console.error("Supabase POST error:", data);
  const message =
    (Array.isArray(data) && data[0] && data[0].message) ||
    data.message ||
    JSON.stringify(data);
  return {
    statusCode: res.status,
    body: JSON.stringify({ error: message || "Supabase insert error" })
  };
}


return {
statusCode: 200,
body: JSON.stringify({ stories: data })
};
} catch (err) {
console.error("GET error:", err);
return {
statusCode: 500,
body: JSON.stringify({ error: err.message })
};
}
}

if (event.httpMethod === "POST") {
// Save a new story
let body;
try {
body = JSON.parse(event.body || "{}");
} catch (e) {
return {
statusCode: 400,
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

if (!pages || !Array.isArray(pages) || !pages.length) {
return {
statusCode: 400,
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

try {
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

const data = await res.json();

if (!res.ok) {
console.error("Supabase POST error:", data);
return {
statusCode: res.status,
body: JSON.stringify({ error: "Supabase insert error" })
};
}

return {
statusCode: 200,
body: JSON.stringify({ story: data && data[0] })
};
} catch (err) {
console.error("POST error:", err);
return {
statusCode: 500,
body: JSON.stringify({ error: err.message })
};
}
}

return {
statusCode: 405,
body: JSON.stringify({ error: "Method not allowed" })
};
};
