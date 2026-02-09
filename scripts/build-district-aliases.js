/**
 * Builds old district alias mapping from the vietnamadminunits data.
 *
 * For each hospital, determines which OLD district (pre-2025 reform) it belongs to
 * using GPS bounding boxes, then adds the old district name as a searchable alias.
 *
 * Also builds a district_aliases.json lookup file for reference.
 *
 * Run: node scripts/build-district-aliases.js
 */

const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "data", "hospitals.json");
const LEGACY_PATH = path.join(__dirname, "..", "data", "mapping", "legacy_63province.csv");
const CONVERT_PATH = path.join(__dirname, "..", "data", "mapping", "convert_legacy_2025.csv");
const ALIASES_PATH = path.join(__dirname, "..", "data", "district_aliases.json");

function removeDiacritics(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

// ─── CSV Parser (handles quoted fields) ─────────────────────────────────────

function parseCSVRow(row) {
  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (inQuotes) {
      if (ch === '"' && row[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

function parseCSV(filePath) {
  const text = fs.readFileSync(filePath, "utf-8");
  const lines = text.split("\n").filter((l) => l.trim());
  const header = parseCSVRow(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVRow(lines[i]);
    const obj = {};
    header.forEach((h, idx) => {
      obj[h.trim()] = (fields[idx] || "").trim();
    });
    rows.push(obj);
  }
  return rows;
}

// ─── Extract coords from hospital mapsUrl ───────────────────────────────────

function extractCoords(mapsUrl) {
  if (!mapsUrl) return null;
  const match = mapsUrl.match(/query=([-\d.]+),([-\d.]+)/);
  if (!match) return null;
  return { lat: parseFloat(match[1]), lon: parseFloat(match[2]) };
}

// ─── Parse bounding box "lat1,lon1 – lat2,lon2" ────────────────────────────

function parseBounds(boundsStr) {
  if (!boundsStr) return null;
  const parts = boundsStr.split("–").map((s) => s.trim());
  if (parts.length !== 2) return null;

  const [lat1, lon1] = parts[0].split(",").map(Number);
  const [lat2, lon2] = parts[1].split(",").map(Number);

  if ([lat1, lon1, lat2, lon2].some(isNaN)) return null;

  return {
    minLat: Math.min(lat1, lat2),
    maxLat: Math.max(lat1, lat2),
    minLon: Math.min(lon1, lon2),
    maxLon: Math.max(lon1, lon2),
  };
}

function isInBounds(lat, lon, bounds) {
  return (
    lat >= bounds.minLat &&
    lat <= bounds.maxLat &&
    lon >= bounds.minLon &&
    lon <= bounds.maxLon
  );
}

// ─── Haversine distance (km) ────────────────────────────────────────────────

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log("Loading data...");

  // 1. Extract unique old districts from legacy CSV
  const legacyRows = parseCSV(LEGACY_PATH);
  const districtMap = new Map(); // key: "provinceCode|districtCode" → district info

  for (const row of legacyRows) {
    const key = `${row.provinceCode}|${row.districtCode}`;
    if (!districtMap.has(key)) {
      districtMap.set(key, {
        province: row.province,
        provinceShort: row.provinceShort,
        district: row.district,
        districtShort: row.districtShort,
        districtType: row.districtType,
        lat: parseFloat(row.districtLat),
        lon: parseFloat(row.districtLon),
        bounds: parseBounds(row.districtBounds),
        provinceCode: row.provinceCode,
        districtCode: row.districtCode,
      });
    }
  }

  const oldDistricts = [...districtMap.values()].filter(
    (d) => !isNaN(d.lat) && !isNaN(d.lon),
  );

  console.log(`Loaded ${oldDistricts.length} unique old districts.`);

  // 2. Build old→new province mapping from conversion CSV
  const convertRows = parseCSV(CONVERT_PATH);
  const districtToNewProvince = new Map(); // "provinceCode|districtCode" → new province

  for (const row of convertRows) {
    const key = `${row.provinceCode}|${row.districtCode}`;
    if (!districtToNewProvince.has(key)) {
      districtToNewProvince.set(key, {
        newProvince: row.newProvince,
        newProvinceShort: row.newProvinceShort,
        isMergedProvince: row.isMergedProvince === "True",
      });
    }
  }

  // 3. Build the alias mapping: for districts whose province changed,
  //    or districts that were merged, track old name as alias
  const aliasData = {};

  for (const d of oldDistricts) {
    const key = `${d.provinceCode}|${d.districtCode}`;
    const newInfo = districtToNewProvince.get(key);

    aliasData[key] = {
      oldProvince: d.provinceShort,
      oldDistrict: d.district,
      oldDistrictShort: d.districtShort,
      oldDistrictType: d.districtType,
      newProvince: newInfo ? newInfo.newProvinceShort : d.provinceShort,
      provinceChanged: newInfo ? newInfo.isMergedProvince : false,
      lat: d.lat,
      lon: d.lon,
      bounds: d.bounds,
    };
  }

  // Save alias reference file
  fs.writeFileSync(ALIASES_PATH, JSON.stringify(aliasData, null, 2), "utf-8");
  console.log(`Saved ${Object.keys(aliasData).length} district alias entries.`);

  // 4. For each hospital, find which old district it belongs to
  const hospitals = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
  let matched = 0;
  let unmatched = 0;

  for (const h of hospitals) {
    const coords = extractCoords(h.mapsUrl);
    if (!coords) {
      unmatched++;
      continue;
    }

    // First try: bounding box containment
    let bestMatch = null;
    let bestDist = Infinity;

    for (const d of oldDistricts) {
      // Check bounding box first (fast)
      if (d.bounds && isInBounds(coords.lat, coords.lon, d.bounds)) {
        const dist = haversine(coords.lat, coords.lon, d.lat, d.lon);
        if (dist < bestDist) {
          bestDist = dist;
          bestMatch = d;
        }
      }
    }

    // Fallback: nearest district center (within 15km)
    if (!bestMatch) {
      for (const d of oldDistricts) {
        const dist = haversine(coords.lat, coords.lon, d.lat, d.lon);
        if (dist < bestDist && dist < 15) {
          bestDist = dist;
          bestMatch = d;
        }
      }
    }

    if (bestMatch) {
      const key = `${bestMatch.provinceCode}|${bestMatch.districtCode}`;
      const alias = aliasData[key];

      // Set old district info
      h.oldDistrict = bestMatch.districtShort;
      h.oldProvince = bestMatch.provinceShort;

      // Build aliases array: all name variants users might search
      const aliases = new Set();
      aliases.add(bestMatch.district); // "Quận 2"
      aliases.add(bestMatch.districtShort); // "2" or "Ba Đình"
      aliases.add(bestMatch.provinceShort); // "Hồ Chí Minh"

      // If province changed, add old province name
      if (alias && alias.provinceChanged) {
        aliases.add(alias.oldProvince);
      }
      // Add new province too
      if (alias && alias.newProvince) {
        aliases.add(alias.newProvince);
      }

      // Remove empty strings
      aliases.delete("");

      h.aliases = [...aliases];
      h.aliasesAscii = [...aliases].map((a) =>
        removeDiacritics(a.toLowerCase()),
      );

      matched++;
    } else {
      h.aliases = [];
      h.aliasesAscii = [];
      unmatched++;
    }
  }

  // Update ASCII fields
  for (const h of hospitals) {
    h.cityAscii = removeDiacritics((h.city || "").toLowerCase());
    h.districtAscii = removeDiacritics((h.district || "").toLowerCase());
    h.nameAscii = removeDiacritics((h.name || "").toLowerCase());
  }

  fs.writeFileSync(DATA_PATH, JSON.stringify(hospitals, null, 2), "utf-8");

  console.log(`\nHospital alias matching:`);
  console.log(`  Matched to old district: ${matched}`);
  console.log(`  Unmatched: ${unmatched}`);

  // Show sample
  const samples = hospitals.filter((h) => h.aliases && h.aliases.length > 0).slice(0, 5);
  console.log(`\nSample matches:`);
  for (const s of samples) {
    console.log(`  ${s.name} → old: ${s.oldDistrict}, ${s.oldProvince} | aliases: [${s.aliases.join(", ")}]`);
  }
}

main();
