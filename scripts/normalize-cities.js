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
// Lowercase key → canonical Vietnamese province/city name
const CITY_MAP = {
  // ── Major cities: English & variant forms ──
  "ho chi minh city": "Hồ Chí Minh",
  "thành phố hồ chí minh": "Hồ Chí Minh",
  "tp. hồ chí minh": "Hồ Chí Minh",
  "tp.hồ chí minh": "Hồ Chí Minh",
  "tp hồ chí minh": "Hồ Chí Minh",
  "thành phố thủ đức": "Hồ Chí Minh",    // Thủ Đức is within HCM
  "thành phố dĩ an": "Bình Dương",         // Dĩ An city in Bình Dương
  "thuận an": "Bình Dương",                 // Thuận An city in Bình Dương
  "hanoi": "Hà Nội",
  "ha noi": "Hà Nội",
  "thành phố hà nội": "Hà Nội",
  "tp. hà nội": "Hà Nội",
  "da nang": "Đà Nẵng",
  "da nanag": "Đà Nẵng",
  "thành phố đà nẵng": "Đà Nẵng",
  "thành phố cần thơ": "Cần Thơ",
  "thành phố hải phòng": "Hải Phòng",
  "thành phố biên hòa": "Đồng Nai",
  "biên hòa": "Đồng Nai",
  "thành phố hải dương": "Hải Dương",
  "thành phố tây ninh": "Tây Ninh",

  // ── Special economic zones → provinces ──
  "đặc khu vân đồn": "Quảng Ninh",
  "đặc khu cô tô": "Quảng Ninh",
  "đặc khu phú quốc": "Kiên Giang",

  // ── City-level names → provinces ──
  "tuy hòa": "Phú Yên",
  "buôn ma thuột": "Đắk Lắk",
  "đăk lăk": "Đắk Lắk",
  "rạch giá": "Kiên Giang",
  "mỹ tho": "Tiền Giang",
  "trà vinh": "Trà Vinh",
  "yên bái": "Yên Bái",
  "bắc giang": "Bắc Giang",
  "thái nguyên": "Thái Nguyên",
  "vinh": "Nghệ An",
  "đà lạt": "Lâm Đồng",
  "việt trì": "Phú Thọ",
  "phúc yên": "Vĩnh Phúc",
  "vĩnh yên": "Vĩnh Phúc",
  "phan thiết": "Bình Thuận",
  "châu đốc": "An Giang",
  "long xuyên": "An Giang",
  "hòa bình": "Hòa Bình",
  "vĩnh long": "Vĩnh Long",
  "kon tum": "Kon Tum",
  "sơn la": "Sơn La",
  "cà mau": "Cà Mau",
  "bến tre": "Bến Tre",
  "lào cai": "Lào Cai",
  "lạng sơn": "Lạng Sơn",
  "lai châu": "Lai Châu",
  "quảng ngãi": "Quảng Ngãi",
  "sa đéc": "Đồng Tháp",
  "cao lãnh": "Đồng Tháp",
  "tân an": "Long An",
  "long an": "Long An",
  "bạc liêu": "Bạc Liêu",
  "đồng xoài": "Bình Phước",
  "đồng hới": "Quảng Bình",
  "tam kỳ": "Quảng Nam",
  "cam ranh": "Khánh Hòa",
  "nha trang": "Khánh Hòa",
  "ninh bình": "Ninh Bình",
  "hà tĩnh": "Hà Tĩnh",
  "sầm sơn": "Thanh Hóa",
  "sông công": "Thái Nguyên",
  "phổ yên": "Thái Nguyên",
  "hoàng mai": "Nghệ An",
  "điện biên phủ": "Điện Biên",
  "điện biên": "Điện Biên",
  "bình dương": "Bình Dương",
  "đắk nông": "Đắk Nông",
  "quảng ninh": "Quảng Ninh",
  "quảng nam": "Quảng Nam",
  "quảng trị": "Quảng Trị",
  "tây ninh": "Tây Ninh",
  "long khánh": "Đồng Nai",
  "bến cát": "Bình Dương",
  "phan rang – tháp chàm": "Ninh Thuận",
  "ninh hòa": "Khánh Hòa",
  "homestead, fl": "",  // bad geocode data, clear it

  // ── Phường (ward) names → correct province ──
  // These appear because Nominatim returned ward names as "city"
  "phường trần lãm": "Thái Bình",
  "phường hoa lư": "Ninh Bình",
  "phường lê thanh nghị": "Hải Dương",
  "phường trường vinh": "Nghệ An",
  "phường gia viên": "Ninh Bình",
  "phường đông quang": "Thanh Hóa",
  "phường lê chân": "Hải Phòng",
  "phường thanh khê": "Đà Nẵng",
  "phường an hải": "Đà Nẵng",
  "phường thiên trường": "Nam Định",
  "phường vinh phú": "Bình Dương",
  "phường hạc thành": "Thanh Hóa",
  "phường nam định": "Nam Định",
  "phường thành sen": "Hà Tĩnh",
  "phường hồng bàng": "Hải Phòng",
  "phường hải châu": "Đà Nẵng",
  "phường hòa cường": "Đà Nẵng",
  "phường nha trang": "Khánh Hòa",
  "phường hòa khánh": "Đà Nẵng",
  "phường pleiku": "Gia Lai",
  "phường nam đông hà": "Quảng Trị",
  "phường minh xuân": "Tuyên Quang",
  "minh xuân": "Tuyên Quang",
  "phường cẩm lệ": "Đà Nẵng",
  "phường quy nhơn nam": "Bình Định",
  "phường quy nhơn": "Bình Định",
  "phường quy nhơn bắc": "Bình Định",
  "phường đồng hới": "Quảng Bình",
  "phường an biên": "Kiên Giang",
  "phường tân giang": "Hà Tĩnh",
  "phường cửa lò": "Nghệ An",
  "phường quảng phú": "Bình Định",
  "phường vỹ dạ": "Thừa Thiên Huế",
  "phường tam kỳ": "Quảng Nam",
  "phường bắc giang": "Bắc Giang",
  "phường bắc gianh": "Bắc Giang",
  "phường uông bí": "Quảng Ninh",
  "phường sầm sơn": "Thanh Hóa",
  "phường hồng gai": "Quảng Ninh",
  "phường phù liễn": "Hải Phòng",
  "phường quang hanh": "Quảng Ninh",
  "phường tuần châu": "Quảng Ninh",
  "phường phủ lý": "Hà Nam",
  "phường thạch khôi": "Hải Dương",
  "phường hoàng mai": "Nghệ An",
  "phường ngũ hành sơn": "Đà Nẵng",
  "phường hòa xuân": "Đà Nẵng",
  "phường phú xuân": "Thừa Thiên Huế",
  "phường thống nhất": "Đồng Nai",
  "phường phổ yên": "Thái Nguyên",
  "phường liêm tuyền": "Hà Nam",
  "phường kim long": "Thừa Thiên Huế",
  "phường bàn thạch": "Phú Yên",
  "phường kiến an": "Hải Phòng",
  "phường sông công": "Thái Nguyên",
  "phường hải an": "Hải Phòng",
  "phường hưng đạo": "Quảng Ninh",
  "phường hương trà": "Thừa Thiên Huế",
  "phường việt hưng": "Hà Nội",
  "phường quang trung": "Hà Nội",
  "phường cẩm phả": "Quảng Ninh",
  "phường hàm rồng": "Thanh Hóa",
  "phường đông sơn": "Thanh Hóa",
  "phường sa pa": "Lào Cai",
  "phường thái bình": "Thái Bình",
  "phường thủy nguyên": "Hải Phòng",
  "phường đức xuân": "Bắc Kạn",
  "phường nùng trí cao": "Lạng Sơn",
  "phường hoành bồ": "Quảng Ninh",
  "phường cao xanh": "Quảng Ninh",
  "phường hải dương": "Hải Dương",
  "phường yên sơn": "Tuyên Quang",
  "phường thành đông": "Hải Dương",
  "phường thuận hoá": "Thừa Thiên Huế",
  "phường liên chiểu": "Đà Nẵng",
  "phường vàng danh": "Quảng Ninh",
  "phường hạ long": "Quảng Ninh",
  "phường trần phú": "Hà Nội",
  "phường tân hưng": "Long An",
  "phường phong thái": "Thừa Thiên Huế",
  "phường hội an tây": "Quảng Nam",
  "phường hội an": "Quảng Nam",
  "phường đông hải": "Bạc Liêu",
  "phường dương kinh": "Hải Phòng",
  "phường đồng thuận": "Bình Dương",
  "phường an dương": "Hải Phòng",
  "phường an nhơn đông": "Bình Định",
  "phường duy tân": "Phú Yên",
  "phường đồ sơn": "Hải Phòng",
  "phường tam quan": "Bình Định",
  "phường sông trí": "Hà Tĩnh",
  "phường bắc hồng lĩnh": "Hà Tĩnh",
  "phường đường hào": "Hưng Yên",
  "phường mỹ lộc": "Nam Định",
  "phường phong điền": "Thừa Thiên Huế",
  "phường phố hiến": "Hưng Yên",
  "phường hà nam": "Hà Nam",
  "phường kim bảng": "Hà Nam",
  "phường kinh môn": "Hải Dương",
  "phường đào duy từ": "Thanh Hóa",
  "phường quảng yên": "Quảng Ninh",
  "phường tây hiếu": "Nghệ An",
  "phường quảng trị": "Quảng Trị",
  "phường bắc kạn": "Bắc Kạn",
  "phường diên hồng": "Gia Lai",
  "phường tam điệp": "Ninh Bình",
  "phường an khê": "Gia Lai",
  "phường ayun pa": "Gia Lai",
  "phường hoài nhơn nam": "Bình Định",
  "phường đức phổ": "Quảng Ngãi",
  "phường tĩnh gia": "Thanh Hóa",
  "phường bỉm sơn": "Thanh Hóa",
  "phường cửa ông": "Quảng Ninh",
  "phường trần hưng đạo": "Hải Dương",
  "phường hoá châu": "Thừa Thiên Huế",
  "phường hương thủy": "Thừa Thiên Huế",
  "phường vinh hưng": "Long An",
  "phường tân mai": "Đồng Nai",
  "phường an phú": "Bình Dương",
  "phường bình hưng hòa": "Hồ Chí Minh",
  "phường bưởi": "Hà Nội",
  "phường linh chiểu": "Hồ Chí Minh",
  "phường rạch ông": "Hồ Chí Minh",
  "phường tây mỗ": "Hà Nội",
  "phường chu văn an": "Bắc Ninh",
  "phường móng cái 2": "Quảng Ninh",

  // ── Xã (commune) names → correct province ──
  "xã thiệu trung": "Thanh Hóa",
  "xã hưng hà": "Thái Bình",
  "xã ninh châu": "Ninh Bình",
  "xã bến lức": "Long An",
  "xã bình điền": "Thừa Thiên Huế",
  "xã phú riềng": "Bình Phước",
  "xã đông hưng": "Thái Bình",
  "xã hà trung": "Thanh Hóa",
  "xã hậu lộc": "Thanh Hóa",
  "xã diễn châu": "Nghệ An",
  "xã đô lương": "Nghệ An",
  "xã trường hà": "Cao Bằng",
  "xã hải hưng": "Hải Dương",
  "xã phát diệm": "Ninh Bình",
  "xã đông lộc": "Hà Tĩnh",
  "xã nho quan": "Ninh Bình",
  "xã quỳnh văn": "Nghệ An",
  "xã đại đồng": "Quảng Nam",
  "xã trùng khánh": "Cao Bằng",
  "xã vũ thư": "Thái Bình",
  "xã yên thành": "Nghệ An",
  "xã trung sơn": "Thanh Hóa",
  "xã hoàn lão": "Quảng Bình",
  "xã đồng văn": "Hà Giang",
  "xã hậu nghĩa": "Long An",
  "xã khe sanh": "Quảng Trị",
  "xã hồng sơn": "Hà Tĩnh",
  "xã lệ thủy": "Quảng Bình",
  "xã mèo vạc": "Hà Giang",
  "xã minh hóa": "Quảng Bình",
  "xã quảng hà": "Quảng Ninh",
  "xã đầm hà": "Quảng Ninh",
  "xã khuôn lùng": "Hà Giang",
  "xã nam lý": "Quảng Bình",
  "xã con cuông": "Nghệ An",
  "xã tiên yên": "Quảng Ninh",
  "xã ba chẽ": "Quảng Ninh",
  "xã bình liêu": "Quảng Ninh",
  "xã đồng lê": "Quảng Bình",
  "xã vị xuyên": "Hà Giang",
  "xã vĩnh linh": "Quảng Trị",
  "xã yên hoa": "Tuyên Quang",
  "xã yên minh": "Hà Giang",
  "xã kiến xương": "Thái Bình",
  "xã mai phụ": "Hà Tĩnh",
  "xã mường lát": "Thanh Hóa",
  "xã vĩnh am": "Thừa Thiên Huế",
  "xã hưng phú": "Sóc Trăng",
  "xã nga sơn": "Thanh Hóa",
  "xã ngọc lặc": "Thanh Hóa",
  "xã nông cống": "Thanh Hóa",
  "xã hồi xuân": "Thanh Hóa",
  "xã kim tân": "Thanh Hóa",
  "xã thái ninh": "Thái Bình",
  "xã thọ xuân": "Thanh Hóa",
  "xã thủ thừa": "Long An",
  "xã thường xuân": "Thanh Hóa",
  "xã ái quốc": "Hải Dương",
  "xã triệu sơn": "Thanh Hóa",
  "xã vĩnh lộc": "Thanh Hóa",
  "xã bến cầu": "Tây Ninh",
  "xã dương minh châu": "Tây Ninh",
  "xã nghi lộc": "Nghệ An",
  "xã tân trụ": "Long An",
  "xã tĩnh túc": "Cao Bằng",
  "xã cửa tùng": "Quảng Trị",
  "xã thạnh hóa": "Long An",
  "xã sen ngư": "Nghệ An",
  "xã thống nhất": "Đồng Nai",
  "xã quang thiện": "Ninh Bình",
  "xã a lưới 2": "Thừa Thiên Huế",
  "xã ân thi": "Hưng Yên",
  "xã bình mỹ": "Bình Dương",
  "xã can lộc": "Hà Tĩnh",
  "xã cẩm xuyên": "Hà Tĩnh",
  "xã đức thọ": "Hà Tĩnh",
  "xã chợ rã": "Bắc Kạn",
  "xã phủ thông": "Bắc Kạn",
  "xã bảo lâm": "Cao Bằng",
  "xã tà rụt": "Quảng Trị",
  "xã giao thủy": "Nam Định",
  "xã hạ lang": "Cao Bằng",
  "xã hòa an": "Cao Bằng",
  "xã hưng nguyên": "Nghệ An",
  "xã hữu kiệm": "Nghệ An",
  "xã vạn an": "Bắc Ninh",
  "xã nam trực": "Nam Định",
  "xã nghĩa đàn": "Nghệ An",
  "xã nguyên bình": "Cao Bằng",
  "xã bằng thành": "Bắc Kạn",
  "xã quế phong": "Nghệ An",
  "xã quỳ châu": "Nghệ An",
  "xã quỳ hợp": "Nghệ An",
  "xã tân kỳ": "Nghệ An",
  "xã tri tôn": "An Giang",
  "xã cổ lễ": "Nam Định",
  "xã tương dương": "Nghệ An",
  "xã minh tân": "Hải Dương",
  "xã xuân lộc": "Đồng Nai",
  "xã xuân hồng": "Nam Định",
  "xã yên khánh": "Ninh Bình",
  "xã hương khê": "Hà Tĩnh",
  "xã hương sơn": "Hà Tĩnh",
  "xã phú nghĩa": "Hà Nội",
  "xã cam lộ": "Quảng Trị",
  "xã hướng hiệp": "Quảng Trị",
  "xã gio linh": "Quảng Trị",
  "xã diên sanh": "Quảng Trị",
  "xã hòa trạch": "Quảng Bình",
  "xã sơn dương": "Tuyên Quang",
  "xã triệu phong": "Quảng Trị",
  "xã nam cửa việt": "Quảng Trị",
  "xã vĩnh trụ": "Hà Nam",
  "xã đoàn đào": "Hưng Yên",
  "xã phú lộc": "Thừa Thiên Huế",
  "xã khe tre": "Quảng Bình",
  "xã phú vang": "Thừa Thiên Huế",
  "xã quảng điền": "Thừa Thiên Huế",
  "xã thạch hà": "Hà Tĩnh",
  "xã tiên điền": "Hà Tĩnh",
  "xã vũ quang": "Hà Tĩnh",
  "xã yên mỹ": "Hưng Yên",
  "xã phụng công": "Hưng Yên",
  "xã lạc đạo": "Hưng Yên",
  "xã khoái châu": "Hưng Yên",
  "xã lê minh xuân": "Hồ Chí Minh",
  "xã tân thạnh": "Long An",
  "xã hồng sơn": "Hà Tĩnh",
  "xã quỹ nhất": "Nam Định",
  "xã chân mây - lăng cô": "Thừa Thiên Huế",

  // ── Town/township names → provinces ──
  "hưng yên": "Hưng Yên",
  "gia lai": "Gia Lai",
  "lâm đồng": "Lâm Đồng",
  "phú yên": "Phú Yên",
  "khánh hòa": "Khánh Hòa",
  "huế": "Thừa Thiên Huế",
  "mỹ thọ": "Tiền Giang",
  "trường sa": "Khánh Hòa",
  "từ sơn": "Bắc Ninh",
  "quế võ": "Bắc Ninh",
  "lim": "Bắc Ninh",
  "đại lộc": "Quảng Nam",
  "tiên phước": "Quảng Nam",
  "thị trấn cần giuộc": "Long An",
  "thị trấn tràm chim": "Đồng Tháp",
  "thị trấn tân thanh": "Lạng Sơn",
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
  if (!h.city) continue;

  let city = h.city.trim();

  // 1. Strip "Tỉnh " prefix (e.g., "Tỉnh Đồng Nai" → "Đồng Nai")
  if (/^tỉnh\s+/i.test(city)) {
    city = city.replace(/^tỉnh\s+/i, "");
  }

  // 2. Check explicit mapping
  const cityKey = city.toLowerCase();
  if (CITY_MAP[cityKey] !== undefined) {
    city = CITY_MAP[cityKey];
  }

  // Apply if changed
  if (city !== h.city) {
    h.city = city;
    h.cityAscii = removeDiacritics((h.city || "").toLowerCase());
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
