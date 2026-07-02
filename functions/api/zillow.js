// Cloudflare Pages Function — Zillow Property Data proxy (Chopper Te async API)
// Set ZILLOW_SCRAPER_KEY or Zillow_prop in Cloudflare Pages env vars
// Modes:
//   ?address=123 Main St, City, ST      → single property lookup
//   ?search=Stamford CT&max_items=9     → area search for-sale listings (cached 6h at edge)

const HOST = 'zillow-property-data1.p.rapidapi.com';

export async function onRequestGet(context) {
  const apiKey = context.env.ZILLOW_SCRAPER_KEY || context.env.Zillow_prop;
  if (!apiKey) {
    return json({ error: 'Zillow API not configured' }, 503);
  }

  const url = new URL(context.request.url);
  const address = url.searchParams.get('address') || '';
  const search = url.searchParams.get('search') || '';
  const listType = url.searchParams.get('type') || 'sale';
  const maxItems = Math.min(parseInt(url.searchParams.get('max_items')) || 9, 12);

  if (!address && !search) {
    return json({ error: 'address or search parameter required' }, 400);
  }

  // Area searches are cached at the edge for 6h to protect API quota
  const isSearch = !!search;
  if (isSearch) {
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), { method: 'GET' });
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  }

  // Build request payload
  const payload = isSearch
    ? (/^\d{5}$/.test(search.trim())
        ? { zipcodes: [search.trim()], type: listType, max_items: maxItems }
        : { search: search.trim(), type: listType, max_items: maxItems })
    : { addresses: [address] };

  try {
    // Step 1: Submit scrape job
    const submitResp = await fetch(`https://${HOST}/v1/properties`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': HOST
      },
      body: JSON.stringify(payload)
    });

    if (!submitResp.ok) {
      const err = await submitResp.text();
      return json({ error: `Zillow submit failed: ${submitResp.status} ${err}` }, submitResp.status);
    }

    const submitData = await submitResp.json();

    // Small requests may return results immediately
    let resultData = null;
    if (submitData.status === 'complete') {
      resultData = submitData;
    } else {
      const jobId = submitData.job_id;
      if (!jobId) {
        return json({ error: 'No job_id returned', raw: submitData }, 502);
      }

      // Step 2: Poll for results (up to ~25s with backoff)
      const delays = [2000, 3000, 4000, 5000, 6000, 5000];
      for (const delay of delays) {
        await sleep(delay);

        const resultResp = await fetch(`https://${HOST}/v1/results/${jobId}`, {
          headers: {
            'X-RapidAPI-Key': apiKey,
            'X-RapidAPI-Host': HOST,
            'Accept': 'application/json'
          }
        });

        if (!resultResp.ok) continue;

        const data = await resultResp.json();
        if (data.status === 'processing') continue;
        resultData = data;
        break;
      }
    }

    if (!resultData) {
      return json({ error: 'Zillow timed out — property data not ready' }, 504);
    }

    const good = (resultData.results || []).filter(r => r.success && r.property);

    if (good.length === 0) {
      return json({ error: 'Zillow property not found', raw: resultData }, 404);
    }

    if (isSearch) {
      const properties = good.map(r => normalizeProperty(r.property, ''));
      const resp = json({ source: HOST, count: properties.length, properties });
      resp.headers.set('Cache-Control', 'public, s-maxage=21600'); // 6h edge cache
      const cache = caches.default;
      context.waitUntil(cache.put(new Request(url.toString(), { method: 'GET' }), resp.clone()));
      return resp;
    }

    const first = good[0];
    return json({ source: HOST, raw: first.property, property: normalizeProperty(first.property, address) });

  } catch (e) {
    return json({ error: e.message }, 502);
  }
}

function normalizeProperty(p, address) {
  return {
    zpid: p.zpid,
    address: p.street_address || address,
    city: p.city,
    state: p.state,
    zip: p.zipcode,
    price: p.price || p.last_sold_price,
    zestimate: p.zestimate,
    rentZestimate: p.rent_zestimate,
    assessedValue: p.tax_assessed_value,
    beds: p.bedrooms,
    baths: p.bathrooms,
    sqft: p.living_area,
    lotSize: p.lot_size,
    yearBuilt: p.year_built,
    stories: p.stories,
    propertyType: p.property_type,
    status: p.home_status,
    hoa: p.hoa_fee,
    daysOnMarket: p.days_on_zillow,
    description: p.description,
    photos: (p.image_urls || []).slice(0, 8),
    priceHistory: p.price_history,
    taxHistory: p.tax_history,
    schools: p.nearby_schools,
    interiorFeatures: p.interior_features,
    exteriorFeatures: p.exterior_features,
    agent: p.listing_agent,
    broker: p.listing_broker,
    virtualTour: p.virtual_tour_url,
    lat: p.latitude,
    lng: p.longitude,
    url: p.url
  };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
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
