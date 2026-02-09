/**
 * Converts hospitals.csv back → hospitals.json after editing.
 * Regenerates nameAscii, districtAscii, cityAscii fields automatically.
 * Run: node scripts/csv-to-json.js
 */

const fs = require("fs");
const path = require("path");

const csvPath = path.join(__dirname, "..", "data", "hospitals.csv");
const jsonPath = path.join(__dirname, "..", "data", "hospitals.json");

function removeDiacritics(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function parseCSV(text) {
  const rows = [];
  let current = "";
  let inQuotes = false;
  const lines = text.split("\n");

  for (const line of lines) {
    if (inQuotes) {
      current += "\n" + line;
    } else {
      current = line;
    }

    const quoteCount = (current.match(/"/g) || []).length;
    inQuotes = quoteCount % 2 !== 0;

    if (!inQuotes) {
      rows.push(parseCSVRow(current));
      current = "";
    }
  }

  return rows;
}

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
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

// ─── Main ───────────────────────────────────────────────────────────────────

const csv = fs.readFileSync(csvPath, "utf-8");
const rows = parseCSV(csv);
const header = rows[0];
const dataRows = rows.slice(1).filter((r) => r.length >= 2 && r[0]);

const COLUMNS = ["name", "type", "district", "city", "address", "phone", "website", "mapsUrl"];

const hospitals = dataRows.map((row) => {
  const obj = {};
  COLUMNS.forEach((col, i) => {
    obj[col] = row[i] || "";
  });

  // Auto-generate ASCII search fields
  obj.nameAscii = removeDiacritics(obj.name.toLowerCase());
  obj.districtAscii = removeDiacritics(obj.district.toLowerCase());
  obj.cityAscii = removeDiacritics(obj.city.toLowerCase());

  return obj;
});

// Sort by city → district → name
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
const unc = hospitals.filter((h) => h.type !== "public" && h.type !== "private").length;

fs.writeFileSync(jsonPath, JSON.stringify(hospitals, null, 2), "utf-8");
console.log(`Imported ${hospitals.length} hospitals → ${jsonPath}`);
console.log(`  Public: ${pub}  |  Private: ${priv}  |  Other: ${unc}`);
