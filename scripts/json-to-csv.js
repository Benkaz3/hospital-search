/**
 * Converts hospitals.json → hospitals.csv for editing in Google Sheets / Excel.
 * Run: node scripts/json-to-csv.js
 */

const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "..", "data", "hospitals.json");
const csvPath = path.join(__dirname, "..", "data", "hospitals.csv");

const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

const COLUMNS = ["name", "type", "district", "city", "oldDistrict", "oldProvince", "newWard", "newProvince", "address", "phone", "website", "mapsUrl"];

function escapeCSV(val) {
  if (!val) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

const header = COLUMNS.join(",");
const rows = data.map((h) => COLUMNS.map((col) => escapeCSV(h[col])).join(","));

fs.writeFileSync(csvPath, [header, ...rows].join("\n"), "utf-8");
console.log(`Exported ${data.length} hospitals → ${csvPath}`);
