/* ─── Vietnamese Diacritics Removal ─────────────────────────────────────── */

function removeDiacritics(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d");
}

/* ─── Combobox Component ───────────────────────────────────────────────── */

function createCombobox(container, options) {
  const input = container.querySelector("input");
  const clearBtn = container.querySelector(".combo-clear");
  const list = container.querySelector(".combo-list");

  let allOptions = []; // [{value, label, ascii}]
  let selectedValue = "";
  let activeIndex = -1;
  let isOpen = false;

  function setOptions(opts) {
    allOptions = opts.map((o) => ({
      value: o,
      label: o,
      ascii: removeDiacritics(o.toLowerCase()),
    }));
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    renderList(input.value);
    list.classList.remove("hidden");
  }

  function close() {
    isOpen = false;
    activeIndex = -1;
    list.classList.add("hidden");
  }

  function select(value) {
    selectedValue = value;
    input.value = value;
    input.classList.toggle("has-value", !!value);
    clearBtn.classList.toggle("hidden", !value);
    close();
    container.dispatchEvent(new Event("change"));
  }

  function renderList(filter) {
    const query = removeDiacritics((filter || "").toLowerCase().trim());
    const filtered = query
      ? allOptions.filter((o) => o.ascii.includes(query))
      : allOptions;

    if (filtered.length === 0) {
      list.innerHTML = '<div class="combo-empty">Không tìm thấy</div>';
      activeIndex = -1;
      return;
    }

    list.innerHTML = filtered
      .map((o, i) => {
        const highlighted = highlightMatch(o.label, query);
        return `<div class="combo-item${i === activeIndex ? " active" : ""}" data-value="${escapeAttr(o.value)}">${highlighted}</div>`;
      })
      .join("");

    // Click handlers
    list.querySelectorAll(".combo-item").forEach((el) => {
      el.addEventListener("mousedown", (e) => {
        e.preventDefault(); // prevent input blur
        select(el.dataset.value);
      });
    });
  }

  function highlightMatch(label, query) {
    if (!query) return escapeHTML(label);
    const ascii = removeDiacritics(label.toLowerCase());
    const idx = ascii.indexOf(query);
    if (idx === -1) return escapeHTML(label);
    const before = label.slice(0, idx);
    const match = label.slice(idx, idx + query.length);
    const after = label.slice(idx + query.length);
    return escapeHTML(before) + "<mark>" + escapeHTML(match) + "</mark>" + escapeHTML(after);
  }

  // Events
  input.addEventListener("focus", () => {
    open();
  });

  input.addEventListener("input", () => {
    selectedValue = ""; // clear selection while typing
    input.classList.remove("has-value");
    activeIndex = -1;
    open();
    renderList(input.value);
    // Trigger filtering on each keystroke (debounced by main handler)
    container.dispatchEvent(new Event("input"));
  });

  input.addEventListener("blur", () => {
    // If typed text doesn't match any option, revert
    setTimeout(() => {
      if (!selectedValue) {
        input.value = "";
        clearBtn.classList.add("hidden");
        container.dispatchEvent(new Event("change"));
      }
      close();
    }, 150);
  });

  input.addEventListener("keydown", (e) => {
    const items = list.querySelectorAll(".combo-item");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      updateActive(items);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      updateActive(items);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && items[activeIndex]) {
        select(items[activeIndex].dataset.value);
      }
    } else if (e.key === "Escape") {
      close();
      input.blur();
    }
  });

  function updateActive(items) {
    items.forEach((el, i) => el.classList.toggle("active", i === activeIndex));
    if (items[activeIndex]) {
      items[activeIndex].scrollIntoView({ block: "nearest" });
    }
  }

  clearBtn.addEventListener("click", () => {
    select("");
    input.focus();
  });

  return {
    setOptions,
    getValue: () => selectedValue,
    setValue: (v) => select(v),
    clear: () => select(""),
  };
}

/* ─── DOM refs ──────────────────────────────────────────────────────────── */

const searchInput = document.getElementById("searchInput");
const clearBtn = document.getElementById("clearBtn");
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

const provinceCombo = createCombobox(document.getElementById("provinceCombo"));
const districtCombo = createCombobox(document.getElementById("districtCombo"));

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

    // Build Fuse index — name-heavy, location as secondary
    fuse = new Fuse(allHospitals, {
      keys: [
        { name: "name", weight: 4 },
        { name: "nameAscii", weight: 4 },
        { name: "oldDistrict", weight: 2 },
        { name: "oldProvince", weight: 1.5 },
        { name: "aliases", weight: 1.5 },
        { name: "aliasesAscii", weight: 1.5 },
        { name: "newWard", weight: 0.5 },
        { name: "newProvince", weight: 0.5 },
        { name: "address", weight: 0.5 },
      ],
      threshold: 0.35,
      distance: 200,
      ignoreLocation: true,
      includeScore: true,
    });

    populateFilters();
    loadingEl.classList.add("hidden");
    showWelcome();
  } catch (err) {
    loadingEl.innerHTML =
      '<p style="color:#e11d48">Không thể tải dữ liệu. Vui lòng thử lại sau.</p>';
    console.error(err);
  }
}

/* ─── Populate Filter Dropdowns ─────────────────────────────────────────── */

function populateFilters() {
  // Collect old provinces (63 provinces)
  const provinceSet = new Set();
  for (const h of allHospitals) {
    if (h.oldProvince) provinceSet.add(h.oldProvince);
  }
  const provinces = [...provinceSet].sort((a, b) => a.localeCompare(b, "vi"));
  provinceCombo.setOptions(provinces);

  updateDistrictOptions();
}

function updateDistrictOptions() {
  const selectedProvince = provinceCombo.getValue();
  const filtered = selectedProvince
    ? allHospitals.filter((h) => h.oldProvince === selectedProvince)
    : allHospitals;

  const districtSet = new Set();
  for (const h of filtered) {
    if (h.oldDistrict) districtSet.add(h.oldDistrict);
  }
  const districts = [...districtSet].sort((a, b) => a.localeCompare(b, "vi"));
  districtCombo.setOptions(districts);
}

/* ─── Search & Filter ───────────────────────────────────────────────────── */

function getFilteredResults() {
  const query = searchInput.value.trim();
  const province = provinceCombo.getValue();
  const district = districtCombo.getValue();

  let results;

  if (query) {
    const asciiQuery = removeDiacritics(query);
    const fuseResults = fuse.search(asciiQuery);
    results = fuseResults.map((r) => r.item);
  } else {
    results = [...allHospitals];
  }

  // Hard filters: oldProvince and oldDistrict
  if (province) {
    results = results.filter((h) => h.oldProvince === province);
  }
  if (district) {
    results = results.filter((h) => h.oldDistrict === district);
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
    <p class="hint">${allHospitals.length} bệnh viện trong cơ sở dữ liệu. Nhập tên, chọn tỉnh hoặc quận/huyện để bắt đầu.</p>
  `;
}

/* ─── Trigger search/render ─────────────────────────────────────────────── */

function triggerUpdate() {
  const query = searchInput.value.trim();
  const province = provinceCombo.getValue();
  const district = districtCombo.getValue();
  if (!query && !province && !district) {
    showWelcome();
  } else {
    render(getFilteredResults());
  }
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
    emptyState.innerHTML = `
      <p>Không tìm thấy bệnh viện phù hợp.</p>
      <p class="hint">Thử tìm kiếm với từ khoá khác hoặc bỏ bớt bộ lọc.</p>
    `;
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

function escapeAttr(str) {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/* ─── Event Listeners ───────────────────────────────────────────────────── */

searchInput.addEventListener("input", () => {
  clearBtn.classList.toggle("hidden", !searchInput.value);
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(triggerUpdate, 150);
});

clearBtn.addEventListener("click", () => {
  searchInput.value = "";
  clearBtn.classList.add("hidden");
  searchInput.focus();
  triggerUpdate();
});

document.getElementById("provinceCombo").addEventListener("change", () => {
  // Province changed — update district options and clear district selection
  districtCombo.clear();
  updateDistrictOptions();
  triggerUpdate();
});

document.getElementById("districtCombo").addEventListener("change", () => {
  triggerUpdate();
});

toggleUnclassified.addEventListener("click", () => {
  const list = unclassifiedList;
  const chevron = toggleUnclassified.querySelector(".chevron");
  list.classList.toggle("collapsed");
  chevron.classList.toggle("open");
});

/* ─── Boot ──────────────────────────────────────────────────────────────── */

init();
