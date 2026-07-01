// Cloudflare Pages Function — proxies AnyProp MLS API requests
// Set ANYPROP_USERNAME and ANYPROP_PASSWORD in Cloudflare Pages > Settings > Environment Variables

let tokenCache = { token: null, expires: 0 };

async function getToken(username, password) {
  if (tokenCache.token && Date.now() < tokenCache.expires) return tokenCache.token;

  const resp = await fetch('https://api.anyprop.com/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username, password })
  });

  if (!resp.ok) throw new Error('AnyProp auth failed');
  const data = await resp.json();
  tokenCache = { token: data.access_token, expires: Date.now() + (data.expires_in - 60) * 1000 };
  return tokenCache.token;
}

export async function onRequestGet(context) {
  const username = context.env.ANYPROP_USERNAME;
  const password = context.env.ANYPROP_PASSWORD;

  if (!username || !password) {
    return new Response(JSON.stringify({ error: 'AnyProp credentials not configured' }), {
      status: 503, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const token = await getToken(username, password);
    const url = new URL(context.request.url);
    const mlsPath = url.searchParams.get('mlspath') || '/Property';
    const params = new URLSearchParams();
    for (const [k, v] of url.searchParams.entries()) {
      if (k !== 'mlspath') params.set(k, v);
    }

    const resp = await fetch(`https://api.anyprop.com${mlsPath}?${params}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    });

    const data = await resp.text();
    return new Response(data, {
      status: resp.status,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
