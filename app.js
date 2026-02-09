/* ─── Vietnamese Diacritics Removal ─────────────────────────────────────── */

function removeDiacritics(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d");
}

/* ─── DOM refs ──────────────────────────────────────────────────────────── */

const searchInput = document.getElementById("searchInput");
const clearBtn = document.getElementById("clearBtn");
const cityFilter = document.getElementById("cityFilter");
const districtFilter = document.getElementById("districtFilter");
const publicList = document.getElementById("publicList");
const privateList = document.getElementById("privateList");
const publicCount = document.getElementById("publicCount");
const privateCount = document.getElementById("privateCount");
const unclassifiedSection = document.getElementById("unclassifiedSection");
const unclassifiedList = document.getElementById("unclassifiedList");
const unclassifiedCount = document.getElementById("unclassifiedCount");
const toggleUnclassified = document.getElementById("toggleUnclassified");
const resultSummary = document.getElementById("resultSummary");
const emptyState = document.getElementById("emptyState");
const loadingEl = document.getElementById("loading");

/* ─── State ─────────────────────────────────────────────────────────────── */

let allHospitals = [];
let fuse = null;
let debounceTimer = null;

/* ─── Init ──────────────────────────────────────────────────────────────── */

async function init() {
  try {
    const res = await fetch("data/hospitals.json");
    if (!res.ok) throw new Error("Failed to load data");
    allHospitals = await res.json();

    // Build Fuse index — search on Vietnamese, ASCII, and alias fields
    fuse = new Fuse(allHospitals, {
      keys: [
        { name: "name", weight: 3 },
        { name: "nameAscii", weight: 3 },
        { name: "district", weight: 2 },
        { name: "districtAscii", weight: 2 },
        { name: "oldDistrict", weight: 2 },
        { name: "oldProvince", weight: 1 },
        { name: "newWard", weight: 2 },
        { name: "newProvince", weight: 1 },
        { name: "aliases", weight: 2 },
        { name: "aliasesAscii", weight: 2 },
        { name: "city", weight: 1 },
        { name: "cityAscii", weight: 1 },
        { name: "address", weight: 1 },
      ],
      threshold: 0.35,
      distance: 200,
      ignoreLocation: true,
      includeScore: true,
    });

    populateFilters();
    loadingEl.classList.add("hidden");
    // Show prompt to search instead of rendering all 1400+ cards
    showWelcome();
  } catch (err) {
    loadingEl.innerHTML =
      '<p style="color:#e11d48">Không thể tải dữ liệu. Vui lòng thử lại sau.</p>';
    console.error(err);
  }
}

/* ─── Populate Filter Dropdowns ─────────────────────────────────────────── */

function populateFilters() {
  // Collect cities: current + old provinces from aliases
  const citySet = new Set();
  for (const h of allHospitals) {
    if (h.city) citySet.add(h.city);
    if (h.oldProvince) citySet.add(h.oldProvince);
  }
  const cities = [...citySet].sort((a, b) => a.localeCompare(b, "vi"));

  for (const city of cities) {
    const opt = document.createElement("option");
    opt.value = city;
    opt.textContent = city;
    cityFilter.appendChild(opt);
  }

  updateDistrictFilter();
}

function updateDistrictFilter() {
  const selectedCity = cityFilter.value;
  const filtered = selectedCity
    ? allHospitals.filter(
        (h) =>
          h.city === selectedCity ||
          h.oldProvince === selectedCity ||
          (h.aliases && h.aliases.includes(selectedCity)),
      )
    : allHospitals;

  // Collect only old district names (familiar to users)
  const districtSet = new Set();
  for (const h of filtered) {
    if (h.oldDistrict) districtSet.add(h.oldDistrict);
  }
  const districts = [...districtSet].sort((a, b) => a.localeCompare(b, "vi"));

  // Preserve current selection if still valid
  const current = districtFilter.value;
  districtFilter.innerHTML = '<option value="">Tất cả quận/huyện</option>';

  for (const d of districts) {
    const opt = document.createElement("option");
    opt.value = d;
    opt.textContent = d;
    districtFilter.appendChild(opt);
  }

  if (districts.includes(current)) {
    districtFilter.value = current;
  }
}

/* ─── Search & Filter ───────────────────────────────────────────────────── */

function getFilteredResults() {
  const query = searchInput.value.trim();
  const city = cityFilter.value;
  const district = districtFilter.value;

  let results;

  if (query) {
    // Fuse search — also search the ASCII version of the query
    const asciiQuery = removeDiacritics(query);
    const fuseResults = fuse.search(asciiQuery);
    results = fuseResults.map((r) => r.item);
  } else {
    results = [...allHospitals];
  }

  // Apply dropdown filters (match current names OR old aliases)
  if (city) {
    results = results.filter(
      (h) =>
        h.city === city ||
        h.oldProvince === city ||
        (h.aliases && h.aliases.includes(city)),
    );
  }
  if (district) {
    results = results.filter(
      (h) =>
        h.district === district ||
        h.oldDistrict === district ||
        (h.aliases && h.aliases.includes(district)),
    );
  }

  return results;
}

const MAX_RESULTS = 50;

/* ─── Welcome State ─────────────────────────────────────────────────────── */

function showWelcome() {
  publicList.innerHTML = "";
  privateList.innerHTML = "";
  publicCount.textContent = "0";
  privateCount.textContent = "0";
  unclassifiedSection.classList.add("hidden");
  resultSummary.classList.add("hidden");
  emptyState.classList.remove("hidden");
  emptyState.innerHTML = `
    <p>Tìm kiếm bệnh viện trên toàn quốc</p>
    <p class="hint">${allHospitals.length} bệnh viện trong cơ sở dữ liệu. Nhập tên, quận, hoặc thành phố để bắt đầu.</p>
  `;
}

/* ─── Render ────────────────────────────────────────────────────────────── */

function render(hospitals) {
  const pub = hospitals.filter((h) => h.type === "public");
  const priv = hospitals.filter((h) => h.type === "private");
  const unc = hospitals.filter((h) => h.type === "unclassified");

  publicCount.textContent = pub.length;
  privateCount.textContent = priv.length;
  unclassifiedCount.textContent = unc.length;

  const pubCapped = pub.slice(0, MAX_RESULTS);
  const privCapped = priv.slice(0, MAX_RESULTS);

  publicList.innerHTML = pubCapped.map((h) => cardHTML(h)).join("") +
    (pub.length > MAX_RESULTS ? `<p class="more-hint">và ${pub.length - MAX_RESULTS} bệnh viện khác...</p>` : "");
  privateList.innerHTML = privCapped.map((h) => cardHTML(h)).join("") +
    (priv.length > MAX_RESULTS ? `<p class="more-hint">và ${priv.length - MAX_RESULTS} bệnh viện khác...</p>` : "");

  // Unclassified section
  if (unc.length > 0) {
    const uncCapped = unc.slice(0, MAX_RESULTS);
    unclassifiedSection.classList.remove("hidden");
    unclassifiedList.innerHTML = uncCapped.map((h) => cardHTML(h)).join("") +
      (unc.length > MAX_RESULTS ? `<p class="more-hint">và ${unc.length - MAX_RESULTS} bệnh viện khác...</p>` : "");
  } else {
    unclassifiedSection.classList.add("hidden");
  }

  // Summary
  const total = hospitals.length;
  if (total > 0) {
    resultSummary.textContent = `${total} bệnh viện`;
    resultSummary.classList.remove("hidden");
    emptyState.classList.add("hidden");
  } else {
    resultSummary.classList.add("hidden");
    emptyState.classList.remove("hidden");
  }

  // Show/hide columns when empty
  document.getElementById("publicCol").classList.toggle("hidden", pub.length === 0 && priv.length > 0);
  document.getElementById("privateCol").classList.toggle("hidden", priv.length === 0 && pub.length > 0);
}

function cardHTML(h) {
  const typeClass =
    h.type === "public"
      ? "card-public"
      : h.type === "private"
      ? "card-private"
      : "";

  const phonePart = h.phone
    ? `<a href="tel:${h.phone.replace(/\s/g, "")}" class="phone-link">${h.phone}</a>`
    : "";

  const mapPart = h.mapsUrl
    ? `<a href="${h.mapsUrl}" target="_blank" rel="noopener">Bản đồ</a>`
    : "";

  const webPart = h.website
    ? `<a href="${h.website}" target="_blank" rel="noopener">Website</a>`
    : "";

  // Build location lines: old district name (familiar) + new ward (official)
  const locParts = [];
  if (h.oldDistrict) locParts.push(h.oldDistrict);
  else if (h.district) locParts.push(h.district);
  if (h.oldProvince) locParts.push(h.oldProvince);
  else if (h.city) locParts.push(h.city);
  const locationLine = locParts.length > 0 ? locParts.join(", ") : "";

  // Show new ward if different from old district
  let newLocLine = "";
  if (h.newWard && h.newWard !== h.oldDistrict) {
    const newParts = [h.newWard];
    if (h.newProvince && h.newProvince !== h.oldProvince) newParts.push(h.newProvince);
    newLocLine = newParts.join(", ");
  }

  return `
    <div class="card ${typeClass}">
      <div class="card-name">${escapeHTML(h.name)}</div>
      ${locationLine ? `<div class="card-location">${escapeHTML(locationLine)}</div>` : ""}
      ${newLocLine ? `<div class="card-new-location">${escapeHTML(newLocLine)} (mới)</div>` : ""}
      ${h.address ? `<div class="card-address">${escapeHTML(h.address)}</div>` : ""}
      <div class="card-meta">
        ${phonePart}${mapPart}${webPart}
      </div>
    </div>
  `;
}

function escapeHTML(str) {
  const el = document.createElement("span");
  el.textContent = str;
  return el.innerHTML;
}

/* ─── Event Listeners ───────────────────────────────────────────────────── */

searchInput.addEventListener("input", () => {
  clearBtn.classList.toggle("hidden", !searchInput.value);
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const query = searchInput.value.trim();
    const city = cityFilter.value;
    const district = districtFilter.value;
    if (!query && !city && !district) {
      showWelcome();
    } else {
      render(getFilteredResults());
    }
  }, 150);
});

clearBtn.addEventListener("click", () => {
  searchInput.value = "";
  clearBtn.classList.add("hidden");
  searchInput.focus();
  if (!cityFilter.value && !districtFilter.value) {
    showWelcome();
  } else {
    render(getFilteredResults());
  }
});

cityFilter.addEventListener("change", () => {
  updateDistrictFilter();
  render(getFilteredResults());
});

districtFilter.addEventListener("change", () => {
  render(getFilteredResults());
});

toggleUnclassified.addEventListener("click", () => {
  const list = unclassifiedList;
  const chevron = toggleUnclassified.querySelector(".chevron");
  list.classList.toggle("collapsed");
  chevron.classList.toggle("open");
});

/* ─── Boot ──────────────────────────────────────────────────────────────── */

init();
