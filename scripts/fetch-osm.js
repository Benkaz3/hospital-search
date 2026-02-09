/**
 * One-time script to fetch hospital data from OpenStreetMap via Overpass API.
 * Run with: node scripts/fetch-osm.js
 *
 * Outputs data/hospitals.json with classified public/private hospitals.
 */

const fs = require("fs");
const path = require("path");

// ─── Overpass query ─────────────────────────────────────────────────────────
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

const OVERPASS_QUERY = `
[out:json][timeout:120];
area["name"="Việt Nam"]["admin_level"="2"]->.vn;
(
  node["amenity"="hospital"](area.vn);
  way["amenity"="hospital"](area.vn);
  relation["amenity"="hospital"](area.vn);
);
out center body;
`;

// ─── Classification heuristics ──────────────────────────────────────────────

const PUBLIC_KEYWORDS = [
  // General hospital patterns (đa khoa = general, mostly public)
  "đa khoa",
  // Government/district/province indicators
  "nhân dân",
  "trung ương",
  "bộ công an",
  "công an",
  // Specialty public hospitals
  "chợ rẫy",
  "bạch mai",
  "nhi đồng",
  "phụ sản",
  "ung bướu",
  "y học cổ truyền",
  "từ dũ",
  "việt đức",
  "thống nhất",
  "nhiệt đới",
  "da liễu",
  "tâm thần",
  "tai mũi họng",
  "răng hàm mặt",
  "phổi",
  "quân y",
  "quân đội",
  "đại học",
  "y dược",
  "hữu nghị",
  "phục hồi chức năng",
  "điều dưỡng",
  "lão khoa",
  "chấn thương",
  "chỉnh hình",
  "sản nhi",
  "chuyên khoa",
  "giao thông",
  "gang thép",
  "nông nghiệp",
  "bưu điện",
  "dệt may",
  "nguyễn tri phương",
  "hùng vương",
  "việt tiệp",
  "kiến an",
  "dã chiến",
  "30 tháng 4",
  "27 tháng 2",
  // Specialty public hospitals commonly missed
  "sản -",
  "sản nhi",
  "nội tiết",
  "mắt",
  "tim mạch",
  "tim hà",
  "truyền máu",
  "nhi hải",
  "nhi thái",
  "nhi thanh",
  "nhi tỉnh",
  "phạm ngọc",
  "lao và bệnh phổi",
  "bệnh phổi",
  "sông hồng",
  // More public patterns
  "thể thao",
  "việt nam - cuba",
  "việt nam - thụy điển",
  "xây dựng",
  "than -",
  "than vàng",
  "tai-mũi-họng",
  "trẻ em",
  "tuệ tĩnh",
  "thành phố",
  "bệnh xá",
  "tĩnh túc",
];

// Regex for numbered hospitals (military/police) like "Bệnh viện 175", "Bệnh viện 199"
const NUMBERED_HOSPITAL_RE = /^bệnh viện\s+\d+/;

const PRIVATE_KEYWORDS = [
  "quốc tế",
  "international",
  "vinmec",
  "fv ",
  "hoàn mỹ",
  "thu cúc",
  "tâm anh",
  "medlatec",
  "hồng ngọc",
  "việt pháp",
  "columbia",
  "phyathai",
  "mỹ đức",
  "an sinh",
  "hạnh phúc",
  "phòng khám",
  "clinic",
  "medical center",
  "medical centre",
  "thẩm mỹ",
  "vạn hạnh",
  "triều an",
  "đại phước",
  "gia an",
  "emg",
  "tâm trí",
  "hoàn hảo",
  "lâm hoa",
  "xuyên á",
  "thiện hạnh",
  "kinh bắc",
  "tràng an",
  "hợp lực",
  "nam am",
  "minh đức",
  "ngọc phú",
  "phenikaa",
  "domedic",
  "lê văn việt",
  "bác sĩ",
  "sài gòn",
  "hòa hảo",
  "nhật tân",
  "phước an",
  "bình an",
  "cát lâm",
];

// Known hospitals that are hard to classify by keyword
const KNOWN_MAP = {
  "bệnh viện chợ rẫy": "public",
  "bệnh viện bạch mai": "public",
  "bệnh viện việt đức": "public",
  "bệnh viện từ dũ": "public",
  "bệnh viện nhi đồng 1": "public",
  "bệnh viện nhi đồng 2": "public",
  "bệnh viện nhi trung ương": "public",
  "bệnh viện 115": "public",
  "bệnh viện 175": "public",
  "bệnh viện hùng vương": "public",
  "bệnh viện nguyễn tri phương": "public",
  "bệnh viện bình dân": "public",
  "bệnh viện a thái nguyên": "public",
  "bệnh viện bãi cháy": "public",
  "bệnh viện bến sắn": "public",
  "bệnh viện fv": "private",
  "bệnh viện vinmec": "private",
  "bệnh viện hoàn mỹ": "private",
  "bệnh viện tâm anh": "private",
  "benh vien da khoa binh dan": "public",
  "benh vien y hoc co truyen tp da nang": "public",
  "benh vien y hoc co truyen tp.da nang": "public",
  "benh vien phu nu tp.da nang": "public",
  "benh vien tu binh dan": "private",
  "benh vien ngoai khoa nguyen van thai": "private",
};

// ─── Vietnamese diacritics removal ──────────────────────────────────────────

function removeDiacritics(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

// ─── Classification ─────────────────────────────────────────────────────────

function classify(name) {
  const lower = name.toLowerCase().trim();

  // Check known map first (exact substring matches)
  for (const [key, type] of Object.entries(KNOWN_MAP)) {
    if (lower.includes(key)) return type;
  }

  // Private keywords checked BEFORE public, so "đa khoa" brands get caught
  for (const kw of PRIVATE_KEYWORDS) {
    if (lower.includes(kw)) return "private";
  }

  // Numbered hospitals (military/police): "Bệnh viện 199", "Bệnh viện 09"
  if (NUMBERED_HOSPITAL_RE.test(lower)) return "public";

  // Public keyword heuristics
  for (const kw of PUBLIC_KEYWORDS) {
    if (lower.includes(kw)) return "public";
  }

  // Also match non-diacritics versions common in OSM data
  const ascii = removeDiacritics(lower);
  if (ascii.includes("benh vien da khoa")) return "public";
  if (ascii.includes("benh vien quan") || ascii.includes("benh vien huyen")) return "public";

  return "unclassified";
}

// ─── Extract district/city from address tags ────────────────────────────────

function extractLocation(tags) {
  const district =
    tags["addr:district"] ||
    tags["addr:suburb"] ||
    tags["addr:subdistrict"] ||
    "";
  const city =
    tags["addr:city"] || tags["addr:province"] || tags["addr:state"] || "";
  const street = tags["addr:street"] || "";
  const housenumber = tags["addr:housenumber"] || "";

  let address = "";
  if (housenumber) address += housenumber + " ";
  if (street) address += street;
  if (district) address += (address ? ", " : "") + district;
  if (city) address += (address ? ", " : "") + city;

  return { district, city, address };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("Fetching hospital data from OpenStreetMap...");
  console.log("This may take a minute...\n");

  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(OVERPASS_QUERY),
  });

  if (!res.ok) {
    throw new Error(`Overpass API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  console.log(`Received ${data.elements.length} raw elements from OSM.\n`);

  const hospitals = [];
  const seen = new Set();

  for (const el of data.elements) {
    const tags = el.tags || {};
    const name = tags.name || tags["name:vi"] || "";
    if (!name) continue;

    // Filter out non-hospital entries that OSM sometimes tags as hospital
    const nameLower = name.toLowerCase();
    const ascii = removeDiacritics(nameLower);
    const skipPatterns = [
      "bãi đậu xe", "parking", "cổng bảo vệ", "nhà thuốc", "pharmacy",
      "sân bóng", "cơ sở điều trị methadone", "công ty cổ phần dược",
      "stories ", "điểm sơ cấp cứu", "đơn nguyên",
    ];
    if (skipPatterns.some((p) => nameLower.includes(p) || ascii.includes(removeDiacritics(p)))) continue;
    // Only keep entries that look like hospitals
    const isHospitalName = nameLower.includes("bệnh viện") || ascii.includes("benh vien") ||
        nameLower.includes("hospital") || ascii.includes("bv ");
    if (!isHospitalName) {
      // If name doesn't mention hospital, skip unless it has explicit hospital metadata
      if (!tags.healthcare && !tags.beds) continue;
    }

    // Deduplicate by name + district
    const { district, city, address } = extractLocation(tags);
    const dedupeKey = removeDiacritics(name.toLowerCase()) + "|" + removeDiacritics(district.toLowerCase());
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    // Classification: prefer OSM tag, then heuristic
    let type = "unclassified";
    if (tags["operator:type"] === "public" || tags["operator:type"] === "government") {
      type = "public";
    } else if (tags["operator:type"] === "private") {
      type = "private";
    } else {
      type = classify(name);
    }

    const lat = el.lat || el.center?.lat;
    const lon = el.lon || el.center?.lon;

    hospitals.push({
      name,
      nameAscii: removeDiacritics(name.toLowerCase()),
      type,
      district,
      districtAscii: removeDiacritics(district.toLowerCase()),
      city,
      cityAscii: removeDiacritics(city.toLowerCase()),
      address,
      phone: tags.phone || tags["contact:phone"] || "",
      website: tags.website || tags["contact:website"] || "",
      mapsUrl:
        lat && lon
          ? `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`
          : "",
    });
  }

  // Sort by city then district then name
  hospitals.sort((a, b) => {
    return (
      a.city.localeCompare(b.city, "vi") ||
      a.district.localeCompare(b.district, "vi") ||
      a.name.localeCompare(b.name, "vi")
    );
  });

  // Stats
  const pub = hospitals.filter((h) => h.type === "public").length;
  const priv = hospitals.filter((h) => h.type === "private").length;
  const unc = hospitals.filter((h) => h.type === "unclassified").length;

  console.log(`Processed ${hospitals.length} unique hospitals:`);
  console.log(`  Public:       ${pub}`);
  console.log(`  Private:      ${priv}`);
  console.log(`  Unclassified: ${unc}`);

  const outPath = path.join(__dirname, "..", "data", "hospitals.json");
  fs.writeFileSync(outPath, JSON.stringify(hospitals, null, 2), "utf-8");
  console.log(`\nSaved to ${outPath}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
