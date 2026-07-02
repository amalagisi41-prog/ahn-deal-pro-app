// Cloudflare Pages Function — Zillow Property Data proxy (Chopper Te async API)
// Set ZILLOW_SCRAPER_KEY or Zillow_prop in Cloudflare Pages env vars

const HOST = 'zillow-property-data1.p.rapidapi.com';

export async function onRequestGet(context) {
  const apiKey = context.env.ZILLOW_SCRAPER_KEY || context.env.Zillow_prop;
  if (!apiKey) {
    return json({ error: 'Zillow API not configured' }, 503);
  }

  const url = new URL(context.request.url);
  const address = url.searchParams.get('address') || '';

  if (!address) {
    return json({ error: 'address parameter required' }, 400);
  }

  try {
    // Step 1: Submit scrape job — /v1/properties accepts addresses directly
    const submitResp = await fetch(`https://${HOST}/v1/properties`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': HOST
      },
      body: JSON.stringify({ addresses: [address] })
    });

    if (!submitResp.ok) {
      const err = await submitResp.text();
      return json({ error: `Zillow submit failed: ${submitResp.status} ${err}` }, submitResp.status);
    }

    const submitData = await submitResp.json();

    // Small requests may return results immediately
    if (submitData.status === 'complete' && submitData.results?.length > 0) {
      const first = submitData.results[0];
      if (first.success && first.property) {
        return json({ source: HOST, raw: first.property, property: normalizeProperty(first.property, address) });
      }
    }

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

      const resultData = await resultResp.json();

      if (resultData.status === 'processing') continue;

      if (resultData.status === 'complete' && resultData.results?.length > 0) {
        const first = resultData.results[0];
        if (first.success && first.property) {
          const normalized = normalizeProperty(first.property, address);
          return json({ source: HOST, raw: first.property, property: normalized });
        }
      }

      // failed or empty
      return json({ error: 'Zillow property not found', raw: resultData }, 404);
    }

    return json({ error: 'Zillow timed out — property data not ready' }, 504);

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
