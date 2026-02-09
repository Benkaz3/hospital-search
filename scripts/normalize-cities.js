/**
 * Normalizes inconsistent city/district names in hospitals.json.
 * Run: node scripts/normalize-cities.js
 */

const fs = require("fs");
const path = require("path");

const jsonPath = path.join(__dirname, "..", "data", "hospitals.json");
const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

function removeDiacritics(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

// ─── City normalization map ─────────────────────────────────────────────────
const CITY_MAP = {
  "ho chi minh city": "Hồ Chí Minh",
  "thành phố hồ chí minh": "Hồ Chí Minh",
  "hồ chí minh": "Hồ Chí Minh",
  "tp. hồ chí minh": "Hồ Chí Minh",
  "tp.hồ chí minh": "Hồ Chí Minh",
  "tp hồ chí minh": "Hồ Chí Minh",
  "thành phố hà nội": "Hà Nội",
  "hà nội": "Hà Nội",
  "tp. hà nội": "Hà Nội",
  "thành phố đà nẵng": "Đà Nẵng",
  "đà nẵng": "Đà Nẵng",
  "thành phố cần thơ": "Cần Thơ",
  "cần thơ": "Cần Thơ",
  "thành phố hải phòng": "Hải Phòng",
  "hải phòng": "Hải Phòng",
  "thành phố biên hòa": "Đồng Nai",
  "biên hòa": "Đồng Nai",
};

// ─── District normalization: strip "Quận ", "quận ", "Huyện " prefix inconsistencies ──
function normalizeDistrict(d) {
  if (!d) return d;
  // If it's just a number like "5", "10", normalize to "Quận 5", "Quận 10"
  if (/^\d+$/.test(d.trim())) {
    return "Quận " + d.trim();
  }
  // Remove redundant "Quận Quận" from data
  return d.replace(/^[Qq]uận\s+[Qq]uận/, "Quận");
}

let cityFixes = 0;
let districtFixes = 0;

for (const h of data) {
  // Normalize city
  const cityKey = h.city.toLowerCase().trim();
  if (CITY_MAP[cityKey] && h.city !== CITY_MAP[cityKey]) {
    h.city = CITY_MAP[cityKey];
    h.cityAscii = removeDiacritics(h.city.toLowerCase());
    cityFixes++;
  }

  // Normalize district
  const newDistrict = normalizeDistrict(h.district);
  if (newDistrict !== h.district) {
    h.district = newDistrict;
    h.districtAscii = removeDiacritics(h.district.toLowerCase());
    districtFixes++;
  }
}

fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), "utf-8");
console.log(`Normalized cities: ${cityFixes} fixes`);
console.log(`Normalized districts: ${districtFixes} fixes`);

// Show current distribution
const cities = {};
data.forEach((h) => {
  const c = h.city || "(trống)";
  cities[c] = (cities[c] || 0) + 1;
});
console.log("\nCity distribution (top 15):");
Object.entries(cities)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .forEach(([c, n]) => console.log(`  ${n} — ${c}`));
