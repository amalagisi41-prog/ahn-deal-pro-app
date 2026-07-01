// Cloudflare Pages Function — proxies ATTOM Data API requests
// Set ATTOM_API_KEY in Cloudflare Pages > Settings > Environment Variables

export async function onRequestGet(context) {
  const apiKey = context.env.ATTOM_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ATTOM API not configured' }), {
      status: 503, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  const url = new URL(context.request.url);
  const path = url.searchParams.get('path') || '';
  const params = new URLSearchParams();
  for (const [k, v] of url.searchParams.entries()) {
    if (k !== 'path') params.set(k, v);
  }

  const attomUrl = `https://api.gateway.attomdata.com/propertyapi/v1.0.0${path}?${params}`;

  const resp = await fetch(attomUrl, {
    headers: { 'apikey': apiKey, 'Accept': 'application/json' }
  });

  const data = await resp.text();
  return new Response(data, {
    status: resp.status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
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
