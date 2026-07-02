// Cloudflare Pages Function — Zillow Property Data proxy
// Reads ZILLOW_SCRAPER_KEY or Zillow_prop from Cloudflare env vars
// Primary: zillow-property-data1.p.rapidapi.com (Chopper Te, 69ms)
// Fallback: zillow-working-api, zillow56, zillowcom-api

export async function onRequestGet(context) {
  const apiKey = context.env.ZILLOW_SCRAPER_KEY || context.env.Zillow_prop;
  if (!apiKey) {
    return json({ error: 'Zillow API not configured' }, 503);
  }

  const url = new URL(context.request.url);
  const address = url.searchParams.get('address') || '';
  const zpid = url.searchParams.get('zpid');
  const enc = encodeURIComponent(address);

  // Primary: zillow-property-data1 (Chopper Te) — try address search then property detail
  try {
    // Search by address to get zpid
    const searchResp = await fetch(
      `https://zillow-property-data1.p.rapidapi.com/v1/property?address=${enc}`,
      {
        headers: {
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': 'zillow-property-data1.p.rapidapi.com',
          'Accept': 'application/json'
        }
      }
    );

    if (searchResp.ok) {
      const data = await searchResp.json();
      console.log('[Zillow proxy] primary response:', JSON.stringify(data).slice(0, 300));
      // Check for valid data (not an error or empty)
      if (data && !data.error && (data.price || data.zestimate || data.bedrooms || data.zpid)) {
        const normalized = normalizeZillowResponse(data, address);
        return json({ source: 'zillow-property-data1.p.rapidapi.com', raw: data, property: normalized });
      }
      // If response has a results array
      if (data?.results?.length > 0 || data?.data?.length > 0) {
        const first = (data.results || data.data)[0];
        const normalized = normalizeZillowResponse(first, address);
        return json({ source: 'zillow-property-data1.p.rapidapi.com', raw: first, property: normalized });
      }
    }
  } catch (e) {
    console.log('[Zillow proxy] primary failed:', e.message);
  }

  // Fallback hosts
  const fallbacks = [
    { host: 'zillow-working-api.p.rapidapi.com', buildUrl: (a, z) => `https://zillow-working-api.p.rapidapi.com/pro/byaddress?propertyaddress=${encodeURIComponent(a)}` },
    { host: 'zillow56.p.rapidapi.com',           buildUrl: (a, z) => `https://zillow56.p.rapidapi.com/pro/byaddress?propertyaddress=${encodeURIComponent(a)}` },
    { host: 'zillowcom-api.p.rapidapi.com',      buildUrl: (a, z) => `https://zillowcom-api.p.rapidapi.com/properties/detail?address=${encodeURIComponent(a)}` },
  ];

  for (const { host, buildUrl } of fallbacks) {
    try {
      const resp = await fetch(buildUrl(address, zpid), {
        headers: {
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': host,
          'Accept': 'application/json'
        }
      });

      if (resp.status === 403 || resp.status === 404) continue;

      const data = await resp.json();
      if (data?.message?.includes('not subscribed') || data?.message?.includes('not found')) continue;

      const normalized = normalizeZillowResponse(data, address);
      return json({ source: host, raw: data, property: normalized });
    } catch (e) {
      continue;
    }
  }

  return json({ error: 'Zillow property not found or API limit reached' }, 404);
}

function normalizeZillowResponse(data, address) {
  const p = data?.property || data?.propertyDetails || data?.data?.property || data || {};
  const hdp = p?.hdpData?.homeInfo || p?.homeInfo || p;

  return {
    zpid: p.zpid || hdp.zpid,
    address: p.address || p.streetAddress || address,
    price: p.price || p.listPrice || p.unformattedPrice || hdp.price || hdp.listPrice,
    zestimate: p.zestimate || p.zestimateAmount || hdp.zestimate,
    rentZestimate: p.rentZestimate || p.rentZestimateAmount || hdp.rentZestimate,
    beds: p.bedrooms || p.beds || p.bedroomsCount || hdp.bedrooms,
    baths: p.bathrooms || p.baths || p.bathroomsCount || hdp.bathrooms,
    sqft: p.livingArea || p.sqft || p.livingAreaValue || hdp.livingArea,
    lotSize: p.lotSize || p.lotAreaValue || hdp.lotSize,
    yearBuilt: p.yearBuilt || hdp.yearBuilt,
    propertyType: p.propertyType || p.homeType || p.propertyTypeDimension || hdp.homeType,
    daysOnMarket: p.daysOnZillow || p.daysOnMarket || hdp.daysOnZillow,
    status: p.homeStatus || p.listingStatus || p.status || hdp.homeStatus,
    photos: (p.originalPhotos || p.photos || p.images || []).slice(0, 8).map(ph =>
      typeof ph === 'string' ? ph : ph?.mixedSources?.jpeg?.[0]?.url || ph?.url || ph
    ).filter(Boolean),
    description: p.description,
    lat: p.latitude || p.lat || hdp.latitude,
    lng: p.longitude || p.lng || hdp.longitude,
    url: p.hdpUrl ? `https://zillow.com${p.hdpUrl}` : (p.url || null)
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
