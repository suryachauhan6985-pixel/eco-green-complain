// Location Controller for Postal Pincode & City/District Verification
// Uses api.postalpincode.in with in-memory caching and timeout protection

const pincodeCache = new Map();
const postOfficeCache = new Map();

/**
 * GET /api/location/pincode/:pincode
 * Verifies 6-digit postal pincode and returns District, State, and Post Offices
 */
async function getPincodeDetails(req, res) {
  try {
    const rawPincode = (req.params.pincode || '').trim();

    // Validate 6-digit numeric string
    if (!/^[0-9]{6}$/.test(rawPincode)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or unrecognized pincode'
      });
    }

    // Check cache
    if (pincodeCache.has(rawPincode)) {
      return res.json(pincodeCache.get(rawPincode));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const resp = await fetch(`https://api.postalpincode.in/pincode/${rawPincode}`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      return res.status(502).json({
        success: false,
        message: 'Postal Pincode service error'
      });
    }

    const data = await resp.json();

    if (
      !Array.isArray(data) ||
      data.length === 0 ||
      data[0].Status !== 'Success' ||
      !Array.isArray(data[0].PostOffice) ||
      data[0].PostOffice.length === 0
    ) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or unrecognized pincode'
      });
    }

    const postOfficesRaw = data[0].PostOffice;
    const first = postOfficesRaw[0];
    const district = first.District || '';
    const state = first.State || '';

    // Extract unique post office names
    const postOffices = [...new Set(postOfficesRaw.map(p => p.Name).filter(Boolean))];

    const result = {
      success: true,
      pincode: rawPincode,
      district,
      state,
      postOffices
    };

    // Cache with simple limit
    if (pincodeCache.size > 1000) pincodeCache.clear();
    pincodeCache.set(rawPincode, result);

    return res.json(result);
  } catch (err) {
    console.error('[Location Pincode Error]:', err.message);
    if (err.name === 'AbortError') {
      return res.status(504).json({
        success: false,
        message: 'Postal Pincode service timed out'
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Failed to verify pincode',
      error: err.message
    });
  }
}

/**
 * GET /api/location/search?query=...
 * Bidirectional lookup: Given city, town or post office, returns suggested pincodes, district & state
 */
async function searchByCityOrPostOffice(req, res) {
  try {
    const rawQuery = (req.query.query || req.params.query || '').trim();

    if (!rawQuery || rawQuery.length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 3 characters'
      });
    }

    const cacheKey = rawQuery.toLowerCase();
    if (postOfficeCache.has(cacheKey)) {
      return res.json(postOfficeCache.get(cacheKey));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const resp = await fetch(`https://api.postalpincode.in/postoffice/${encodeURIComponent(rawQuery)}`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      return res.status(502).json({
        success: false,
        message: 'Postal service error'
      });
    }

    const data = await resp.json();

    if (
      !Array.isArray(data) ||
      data.length === 0 ||
      data[0].Status !== 'Success' ||
      !Array.isArray(data[0].PostOffice)
    ) {
      return res.json({
        success: true,
        query: rawQuery,
        results: []
      });
    }

    // Filter, deduplicate and cap at 25 results
    const seen = new Set();
    const results = [];

    for (const po of data[0].PostOffice) {
      const key = `${po.Pincode}_${po.Name}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          postOffice: po.Name,
          pincode: po.Pincode,
          district: po.District,
          state: po.State
        });
      }
      if (results.length >= 25) break;
    }

    const responseData = {
      success: true,
      query: rawQuery,
      results
    };

    if (postOfficeCache.size > 1000) postOfficeCache.clear();
    postOfficeCache.set(cacheKey, responseData);

    return res.json(responseData);
  } catch (err) {
    console.error('[Location Search Error]:', err.message);
    if (err.name === 'AbortError') {
      return res.status(504).json({
        success: false,
        message: 'Postal service timed out'
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Failed to search location',
      error: err.message
    });
  }
}

module.exports = {
  getPincodeDetails,
  searchByCityOrPostOffice
};
