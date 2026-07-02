// Cloudflare Pages Function — Zillow Scraper proxy
// Set ZILLOW_SCRAPER_KEY in Cloudflare Pages > Settings > Environment Variables
// Supports RapidAPI Zillow scrapers: zillow-working-api, zillow56, zillowcom-api

export async function onRequestGet(context) {
  const apiKey = context.env.ZILLOW_SCRAPER_KEY;
  if (!apiKey) {
    return json({ error: 'Zillow API not configured' }, 503);
  }

  const url = new URL(context.request.url);
  const address = url.searchParams.get('address');
  const zpid = url.searchParams.get('zpid');
  const action = url.searchParams.get('action') || 'property'; // property | search | zestimate

  // Try primary host, fall back to secondary
  const hosts = [
    'zillow-working-api.p.rapidapi.com',
    'zillow56.p.rapidapi.com',
    'zillowcom-api.p.rapidapi.com'
  ];

  // Build endpoint based on action
  function buildUrl(host, action, address, zpid) {
    const enc = encodeURIComponent(address || '');
    switch(action) {
      case 'search':
        if (host.includes('zillow56')) return `https://${host}/search?location=${enc}`;
        if (host.includes('zillowcom')) return `https://${host}/properties/search?address=${enc}`;
        return `https://${host}/pro/byaddress?propertyaddress=${enc}`;
      case 'zestimate':
        if (zpid) return `https://${host}/pro/zestimate?zpid=${zpid}`;
        return `https://${host}/pro/byaddress?propertyaddress=${enc}`;
      default:
        if (host.includes('zillow56')) return `https://${host}/pro/byaddress?propertyaddress=${enc}`;
        if (host.includes('zillowcom')) return `https://${host}/properties/detail?address=${enc}`;
        return `https://${host}/pro/byaddress?propertyaddress=${enc}`;
    }
  }

  for (const host of hosts) {
    try {
      const endpoint = buildUrl(host, action, address, zpid);
      const resp = await fetch(endpoint, {
        headers: {
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': host,
          'Accept': 'application/json'
        }
      });

      if (resp.status === 403 || resp.status === 404) continue; // wrong host, try next

      const data = await resp.json();
      if (data?.message?.includes('not subscribed') || data?.message?.includes('not found')) continue;

      // Normalize response into a consistent shape
      const normalized = normalizeZillowResponse(data, address);
      return json({ source: host, raw: data, property: normalized }, resp.status);

    } catch (e) {
      continue; // try next host
    }
  }

  return json({ error: 'Zillow property not found or API limit reached' }, 404);
}

function normalizeZillowResponse(data, address) {
  // Handle various Zillow API response shapes
  const p = data?.property || data?.propertyDetails || data?.data?.property || data || {};
  const hdp = p?.hdpData?.homeInfo || p?.homeInfo || p;

  return {
    zpid: p.zpid || hdp.zpid,
    address: p.address || address,
    price: p.price || p.listPrice || hdp.price || hdp.listPrice,
    zestimate: p.zestimate || hdp.zestimate,
    rentZestimate: p.rentZestimate || hdp.rentZestimate,
    beds: p.bedrooms || p.beds || hdp.bedrooms,
    baths: p.bathrooms || p.baths || hdp.bathrooms,
    sqft: p.livingArea || p.sqft || hdp.livingArea,
    lotSize: p.lotSize || hdp.lotSize,
    yearBuilt: p.yearBuilt || hdp.yearBuilt,
    propertyType: p.propertyType || p.homeType || hdp.homeType,
    daysOnMarket: p.daysOnZillow || p.daysOnMarket || hdp.daysOnZillow,
    status: p.homeStatus || p.status || hdp.homeStatus,
    photos: (p.originalPhotos || p.photos || []).slice(0, 8).map(ph => ph?.mixedSources?.jpeg?.[0]?.url || ph?.url || ph),
    description: p.description,
    priceHistory: p.priceHistory,
    taxHistory: p.taxHistory,
    schools: p.schools,
    walkscore: p.walkScore,
    lat: p.latitude || hdp.latitude,
    lng: p.longitude || hdp.longitude,
    url: p.hdpUrl ? `https://zillow.com${p.hdpUrl}` : null
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
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
