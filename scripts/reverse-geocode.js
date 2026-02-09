/**
 * Reverse geocodes all hospitals using Nominatim (free, OpenStreetMap).
 * Fills in missing city, district, and address fields from GPS coordinates.
 *
 * Rate limit: 1 request/second (Nominatim policy).
 * Caches results to data/geocode-cache.json so interrupted runs can resume.
 *
 * Run: node scripts/reverse-geocode.js
 */

const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "data", "hospitals.json");
const CACHE_PATH = path.join(__dirname, "..", "data", "geocode-cache.json");
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";
const RATE_LIMIT_MS = 1100; // slightly over 1s to be safe

function removeDiacritics(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Extract lat/lon from mapsUrl ───────────────────────────────────────────

function extractCoords(mapsUrl) {
  if (!mapsUrl) return null;
  const match = mapsUrl.match(/query=([-\d.]+),([-\d.]+)/);
  if (!match) return null;
  return { lat: parseFloat(match[1]), lon: parseFloat(match[2]) };
}

// ─── Reverse geocode a single coordinate ────────────────────────────────────

async function reverseGeocode(lat, lon) {
  const url = `${NOMINATIM_URL}?lat=${lat}&lon=${lon}&format=json&addressdetails=1&accept-language=vi&zoom=16`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "hospital-search-enrichment/1.0 (data enrichment script)",
    },
  });

  if (!res.ok) {
    throw new Error(`Nominatim error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

// ─── Extract structured address from Nominatim response ─────────────────────

function parseNominatimResult(data) {
  const addr = data.address || {};

  // City: try multiple fields Nominatim uses for Vietnamese admin levels
  const city =
    addr.city ||
    addr.town ||
    addr.province ||
    addr.state ||
    addr.county ||
    "";

  // District: Nominatim uses various fields depending on admin level
  const district =
    addr.city_district ||
    addr.suburb ||
    addr.district ||
    addr.quarter ||
    "";

  // Street address
  const road = addr.road || "";
  const houseNumber = addr.house_number || "";
  let streetAddress = "";
  if (houseNumber) streetAddress += houseNumber + " ";
  if (road) streetAddress += road;
  if (district) streetAddress += (streetAddress ? ", " : "") + district;
  if (city) streetAddress += (streetAddress ? ", " : "") + city;

  return {
    city: city.trim(),
    district: district.trim(),
    address: streetAddress.trim(),
    displayName: data.display_name || "",
  };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const hospitals = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));

  // Load or create cache
  let cache = {};
  if (fs.existsSync(CACHE_PATH)) {
    cache = JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
    console.log(`Loaded ${Object.keys(cache).length} cached geocode results.`);
  }

  let updated = 0;
  let skipped = 0;
  let errors = 0;
  const total = hospitals.length;

  for (let i = 0; i < total; i++) {
    const h = hospitals[i];
    const coords = extractCoords(h.mapsUrl);
    if (!coords) {
      skipped++;
      continue;
    }

    const cacheKey = `${coords.lat},${coords.lon}`;

    // Use cache if available
    if (cache[cacheKey]) {
      applyGeocode(h, cache[cacheKey]);
      updated++;
      continue;
    }

    // Rate-limited API call
    try {
      process.stdout.write(
        `\r[${i + 1}/${total}] Geocoding: ${h.name.substring(0, 50).padEnd(50)}`,
      );

      const result = await reverseGeocode(coords.lat, coords.lon);
      const parsed = parseNominatimResult(result);

      cache[cacheKey] = parsed;
      applyGeocode(h, parsed);
      updated++;

      // Save cache periodically (every 50 requests)
      if (updated % 50 === 0) {
        fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");
      }

      await sleep(RATE_LIMIT_MS);
    } catch (err) {
      console.error(`\nError geocoding ${h.name}: ${err.message}`);
      errors++;
      await sleep(RATE_LIMIT_MS * 2); // back off on error
    }
  }

  // Final cache save
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");

  // Update ASCII fields
  for (const h of hospitals) {
    h.cityAscii = removeDiacritics((h.city || "").toLowerCase());
    h.districtAscii = removeDiacritics((h.district || "").toLowerCase());
    h.nameAscii = removeDiacritics((h.name || "").toLowerCase());
  }

  // Save
  fs.writeFileSync(DATA_PATH, JSON.stringify(hospitals, null, 2), "utf-8");

  console.log(`\n\nDone!`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped (no coords): ${skipped}`);
  console.log(`  Errors: ${errors}`);

  // Stats
  const withCity = hospitals.filter((h) => h.city).length;
  const withDistrict = hospitals.filter((h) => h.district).length;
  const withAddress = hospitals.filter((h) => h.address).length;
  console.log(`\nData coverage after geocoding:`);
  console.log(
    `  City:     ${withCity}/${total} (${((withCity / total) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  District: ${withDistrict}/${total} (${((withDistrict / total) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  Address:  ${withAddress}/${total} (${((withAddress / total) * 100).toFixed(1)}%)`,
  );
}

function applyGeocode(hospital, geo) {
  // Only fill in if currently empty or if geocoded data is richer
  if (!hospital.city && geo.city) {
    hospital.city = geo.city;
  }
  if (!hospital.district && geo.district) {
    hospital.district = geo.district;
  }
  if (!hospital.address && geo.address) {
    hospital.address = geo.address;
  }
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
