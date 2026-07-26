// ==UserScript==
// @name         v7.2 Bin check Overlay
// @namespace    https://gist.github.com/1Sirkkris
// @version      7.2
// @description  Overlay-only P-level sorter for FCResearch inventory, with highest-quantity P2/P3/P4 lazy bin copy.
// @author       mojordaq / ChatGPT edit
// @include      /^https?:\/\/.*fcresearch.*\//
// @include      /^https?:\/\/qifcr\.fe\.aftx\.amazonoperations\.app\//
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Bin_check_Overlay.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Bin_check_Overlay.user.js
// @require      https://drive-render.corp.amazon.com/view/mojordaq@/js%20src%20files/jquery-3.6.0.js
// @require      https://drive-render.corp.amazon.com/view/mojordaq@/js%20src%20files/jstools.js
// @grant        GM_xmlhttpRequest
// @connect      *
// ==/UserScript==

/*eslint-env jquery*/

/** globals from jstools.js **/
var waitForKeyElements = waitForKeyElements;
var createElement = createElement;

/** detect pod ids like P-3-A123B456 (two segments) **/
const podRegex = /P\-\d\-([A-Z]\d{3}){2}/g;

let container;
let totalRows = 0;
let totalPods = 0;
let processedPods = 0;
let activeTable = null;

/** retry + speed controls **/
const RETRY_DELAY_MS = 5000;
const MAX_RETRIES = 1;                  // retry failed P- containers this many times
const MAX_CONCURRENT_REQUESTS = 12;      // keeps FCResearch happier on large inventory pages

/** overlay state **/
let overlayFilter = "ALL";
let overlayBuilt = false;

const overlayRows = [];                  // completed rows shown in overlay
const podBuckets = new Map();            // pod -> inventory row records that share this pod
const podResultCache = new Map();         // pod -> floor result; avoids repeat hierarchy reads
const attemptByPod = new Map();           // pod -> attempt count
const fetchQueue = [];
const queuedPods = new Set();
let activeRequests = 0;
let refreshTimer = null;
let scanPaused = false;

/** styles **/
(function injectStyle () {
  const s = document.createElement('style');
  s.textContent = `
    #pLevelOverlay {
      position:fixed;
      right:14px;
      bottom:14px;
      width:620px;
      max-width:calc(100vw - 28px);
      max-height:78vh;
      z-index:999999;
      background:#ffffff;
      border:2px solid #111827;
      border-radius:10px;
      box-shadow:0 10px 30px rgba(0,0,0,.35);
      font-family:Arial, Helvetica, sans-serif;
      color:#111827;
      overflow:hidden;
    }

    #pLevelOverlay.minimized {
      width:300px;
      max-height:58px;
    }

    #pLevelOverlayHeader {
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:8px;
      background:#111827;
      color:#ffffff;
      padding:8px 10px;
      font-weight:800;
      cursor:default;
    }

    #pLevelOverlayTitle {
      font-size:14px;
      line-height:1.15;
    }

    #pLevelOverlayStatus {
      font-size:12px;
      font-weight:700;
      opacity:.95;
      margin-left:6px;
    }

    #pLevelOverlayActions {
      display:flex;
      gap:6px;
      flex-shrink:0;
    }

    #pLevelOverlay button {
      cursor:pointer;
      border:1px solid #374151;
      border-radius:6px;
      padding:5px 8px;
      font-size:12px;
      font-weight:800;
      background:#f3f4f6;
      color:#111827;
    }

    #pLevelOverlay button:hover { background:#e5e7eb; }

    #pLevelOverlayBody {
      padding:9px;
      overflow:auto;
      max-height:calc(78vh - 46px);
    }

    #pLevelOverlay.minimized #pLevelOverlayBody { display:none; }

    #pLevelOverlayFilters {
      display:flex;
      flex-wrap:wrap;
      gap:6px;
      margin-bottom:8px;
      align-items:center;
    }

    #pLevelOverlayFilters button.active {
      outline:3px solid #111827;
      outline-offset:1px;
    }

    #pLevelOverlayFilters .p2btn { background:#009E73; color:#fff; }
    #pLevelOverlayFilters .p3btn { background:#E69F00; color:#111; }
    #pLevelOverlayFilters .p4btn { background:#0072B2; color:#fff; }
    #pLevelOverlayFilters .p1btn { background:#F0E442; color:#111; }

    #pLevelPauseBtn.paused {
      background:#F59E0B;
      color:#111827;
      border-color:#92400E;
    }

    #pLevelOverlayTable {
      width:100%;
      border-collapse:collapse;
      font-size:12px;
    }

    #pLevelOverlayTable th,
    #pLevelOverlayTable td {
      border-bottom:1px solid #e5e7eb;
      padding:6px 5px;
      text-align:left;
      vertical-align:middle;
      white-space:nowrap;
    }

    #pLevelOverlayTable th {
      position:sticky;
      top:0;
      background:#f9fafb;
      z-index:1;
      font-weight:900;
    }

    #pLevelOverlayTable tr:hover { background:#f3f4f6; }

    .p-sort-pill {
      display:inline-block;
      min-width:28px;
      text-align:center;
      border-radius:7px;
      padding:3px 7px;
      font-weight:900;
      box-shadow:0 0 0 1.5px rgba(0,0,0,.25) inset;
    }
    .p-sort-pill.p1 { background:#F0E442; color:#111; }
    .p-sort-pill.p2 { background:#009E73; color:#fff; }
    .p-sort-pill.p3 { background:#E69F00; color:#111; }
    .p-sort-pill.p4 { background:#0072B2; color:#fff; }
    .p-sort-pill.px {
      background:repeating-linear-gradient(135deg,#E5E7EB 0 8px,#CBD5E1 8px 16px);
      color:#111;
    }

    .p-level-copy {
      color:#005eb8;
      font-weight:800;
      text-decoration:none;
      cursor:pointer;
    }

    .p-level-muted {
      color:#6b7280;
      font-size:12px;
      font-weight:700;
    }
  `;
  document.head.appendChild(s);
})();

/** main entry: wait for search box, decide page mode **/
waitForKeyElements("#search", (e) => {
  container = e[0].placeholder;
  try {
    if ((container.match(podRegex) || [])[0] === container) {
      waitForContainerHierarchy();
      return;
    }
  } catch (_) {}

  // Inventory results page -> add overlay button
  waitForKeyElements("#table-inventory", (tbl) => {
    const table = tbl[0];
    activeTable = table;

    let invNav = document.getElementById("inventory-nav");
    if (invNav && invNav.tagName === "A") {
      invNav.replaceWith(copyAttributes(invNav, createElement("span")));
      invNav = document.getElementById("inventory-nav");
    }
    if (!invNav) return;
    if (document.getElementById("p-level-overlay-start-btn")) return;

    const btn = createElement("button", {
      id: "p-level-overlay-start-btn",
      onclick: function () {
        this.style.display = "none";
        buildOverlayShell();
        scrollToLoadAll(table);
      },
      style: {
        order: 5, backgroundColor: "orange", color: "black",
        marginLeft: "8px", padding: "6px 10px", borderRadius: "6px",
        fontWeight: "700", cursor: "pointer", border: "1px solid #92400E"
      },
      innerHTML: "P-level overlay sorter"
    });
    invNav.appendChild(btn);
  }, true);
}, true);

/** helpers **/
function copyAttributes(source, target) {
  while (source.firstChild) target.append(source.firstChild);
  Array.from(source.attributes).forEach(attr => {
    target.setAttribute(attr.nodeName, attr.nodeValue);
  });
  return target;
}

function getStatus(div) {
  try {
    const node = document.querySelector(`[id=${div}-status]`);
    if (node.className === "loading failure") return "failed";
    return (getComputedStyle(document.querySelector(`[id=${div}-status] > i`)).display === "block") ? "loading" : "none";
  } catch (e) {
    if (!!document.querySelector(`[id=${div}-status]`)) return "found";
    return "loading";
  }
}

function waitForContainerHierarchy() {
  switch (getStatus("container-hierarchy")) {
    case "loading": window.setTimeout(waitForContainerHierarchy, 1000); break;
    case "found": break;
    default: break;
  }
}

function scrollToLoadAll(tableEl) {
  if (scanPaused) {
    updateOverlayStatus("Paused");
    window.setTimeout(() => { scrollToLoadAll(tableEl); }, 300);
    return;
  }

  const info = document.getElementById("table-inventory_info");
  if (!info) return;

  const parts = info.textContent.split(" "); // e.g., "Showing 1 to 50 of 321 entries"
  if (parseInt(parts[3], 10) < parseInt(parts[5], 10) && parseInt(parts[3], 10) < 1000) {
    const scroller = document.getElementById("table-inventory").parentElement;
    scroller.scrollTop = scroller.scrollHeight;
    window.setTimeout(() => { scrollToLoadAll(tableEl); }, 1);
  } else {
    document.getElementById("table-inventory").parentElement.scrollTop = 0;
    startOverlayOnlyRun(tableEl);
  }
}

function startOverlayOnlyRun(tableEl) {
  overlayRows.length = 0;
  podBuckets.clear();
  attemptByPod.clear();
  fetchQueue.length = 0;
  queuedPods.clear();
  activeRequests = 0;
  scanPaused = false;
  updatePauseButton();
  processedPods = 0;
  totalRows = 0;
  totalPods = 0;

  const bodyRows = tableEl.tBodies && tableEl.tBodies[0]
    ? Array.from(tableEl.tBodies[0].rows)
    : Array.from(tableEl.rows).slice(1);

  const columnIndexes = getInventoryColumnIndexes(tableEl);

  bodyRows.forEach(row => {
    const record = makeRowRecord(row, columnIndexes);
    if (!record) return;

    totalRows++;
    if (!podBuckets.has(record.pod)) podBuckets.set(record.pod, []);
    podBuckets.get(record.pod).push(record);
  });

  totalPods = podBuckets.size;
  updateOverlayStatus();
  refreshOverlay();

  podBuckets.forEach((_records, pod) => {
    if (podResultCache.has(pod)) {
      applyPodResult(pod, podResultCache.get(pod));
      processedPods++;
      scheduleOverlayRefresh();
      updateOverlayStatus();
    } else {
      enqueuePodFetch(pod);
    }
  });

  pumpFetchQueue();
}

function makeRowRecord(row, columnIndexes) {
  if (!row || !row.cells || !row.cells[0]) return null;

  let pod;
  try {
    pod = (row.cells[0].textContent.match(podRegex) || [])[0];
    if (!pod) return null;
  } catch (_) {
    return null;
  }

  const cells = Array.from(row.cells);
  const containerLink = cells[0] ? cells[0].querySelector("a") : null;

  return {
    pod,
    floorLabel: "",
    floorClass: "px",
    floorNum: 99,
    rawFloor: "",
    containerText: cleanCellText(cells[columnIndexes.container]),
    containerHref: containerLink ? containerLink.href : "",
    quantity: cleanCellText(cells[columnIndexes.quantity]),
    fnsku: cleanCellText(cells[columnIndexes.fnsku]),
    fcsku: cleanCellText(cells[columnIndexes.fcsku]),
    sourceCell: cells[columnIndexes.container]
  };
}

function getInventoryColumnIndexes(tableEl) {
  const fallback = { container: 0, fnsku: 2, fcsku: 3, quantity: 5 };
  const headerRow = tableEl && tableEl.tHead && tableEl.tHead.rows[0]
    ? tableEl.tHead.rows[0]
    : (tableEl && tableEl.rows ? tableEl.rows[0] : null);

  if (!headerRow || !headerRow.cells) return fallback;

  const indexes = { ...fallback };
  Array.from(headerRow.cells).forEach((cell, idx) => {
    const text = cleanCellText(cell).toLowerCase();

    if (text === "container") indexes.container = idx;
    if (text === "fnsku") indexes.fnsku = idx;
    if (text === "fcsku") indexes.fcsku = idx;
    if (text.startsWith("quantity")) indexes.quantity = idx;
  });

  return indexes;
}

function enqueuePodFetch(pod) {
  if (!pod || queuedPods.has(pod)) return;
  queuedPods.add(pod);
  fetchQueue.push(pod);
}

function pumpFetchQueue() {
  if (scanPaused) {
    updateOverlayStatus("Paused");
    return;
  }

  while (activeRequests < MAX_CONCURRENT_REQUESTS && fetchQueue.length > 0) {
    const pod = fetchQueue.shift();
    queuedPods.delete(pod);
    fetchPodFloor(pod);
  }
}

function fetchPodFloor(pod) {
  activeRequests++;

  GM_xmlhttpRequest({
    url: window.location.href.replaceAll(/\?.+/g, "/container-hierarchy?s=" + pod),
    method: "GET",
    onload: function (r) {
      activeRequests--;

      const result = parseFloorResult(r.responseText);
      if (!result.num && shouldRetryPod(pod)) {
        setTimeout(() => {
          enqueuePodFetch(pod);
          pumpFetchQueue();
        }, RETRY_DELAY_MS);
        pumpFetchQueue();
        return;
      }

      finalizePodResult(pod, result);
      pumpFetchQueue();
    },
    onerror: function () {
      activeRequests--;

      if (shouldRetryPod(pod)) {
        setTimeout(() => {
          enqueuePodFetch(pod);
          pumpFetchQueue();
        }, RETRY_DELAY_MS);
        pumpFetchQueue();
        return;
      }

      finalizePodResult(pod, {
        num: "",
        label: "P-",
        cls: "px",
        floorNum: 99,
        rawFloor: "request failed"
      });
      pumpFetchQueue();
    }
  });
}

function shouldRetryPod(pod) {
  const tries = attemptByPod.get(pod) || 0;
  if (tries < MAX_RETRIES) {
    attemptByPod.set(pod, tries + 1);
    return true;
  }
  return false;
}

function parseFloorResult(htmlText) {
  const tmp = createElement("span", { innerHTML: htmlText });
  const cell = tmp.querySelector("div.a-span6:nth-child(1) > table:nth-child(1) > tbody:nth-child(1) > tr:nth-child(4) > td:nth-child(2)");
  const raw = (cell ? cell.textContent : "").split(",")[0]; // e.g., "Floor: 4"
  const num = (raw.match(/\b(\d+)\b/) || [,''])[1];

  return {
    num,
    label: num ? `P${num}` : "P-",
    cls: num ? `p${num}` : "px",
    floorNum: num ? Number(num) : 99,
    rawFloor: raw || ""
  };
}

function finalizePodResult(pod, result) {
  podResultCache.set(pod, result);
  applyPodResult(pod, result);
  processedPods++;
  scheduleOverlayRefresh();
  updateOverlayStatus();

  if (processedPods >= totalPods) {
    updateOverlayStatus("Done");
  }
}

function applyPodResult(pod, result) {
  const records = podBuckets.get(pod) || [];
  records.forEach(record => {
    record.floorLabel = result.label;
    record.floorClass = result.cls;
    record.floorNum = result.floorNum;
    record.rawFloor = result.rawFloor;
    overlayRows.push(record);
  });
}

function cleanCellText(cell) {
  if (!cell) return "";
  return cell.textContent.replace(/\s+/g, " ").trim();
}

function buildOverlayShell() {
  let existing = document.getElementById("pLevelOverlay");
  if (existing) {
    existing.style.display = "block";
    existing.classList.remove("minimized");
    return;
  }

  overlayBuilt = true;

  const overlay = document.createElement("div");
  overlay.id = "pLevelOverlay";
  overlay.innerHTML = `
    <div id="pLevelOverlayHeader">
      <div>
        <span id="pLevelOverlayTitle">P-level Overlay Sorter</span>
        <span id="pLevelOverlayStatus">Starting...</span>
      </div>
      <div id="pLevelOverlayActions">
        <button type="button" id="pLevelPauseBtn">Pause</button>
        <button type="button" id="pLevelMinBtn">Min</button>
        <button type="button" id="pLevelCloseBtn">Hide</button>
      </div>
    </div>
    <div id="pLevelOverlayBody">
      <div id="pLevelOverlayFilters">
        <button type="button" data-filter="ALL" class="active">All</button>
        <button type="button" data-filter="P2" class="p2btn">P2</button>
        <button type="button" data-filter="P3" class="p3btn">P3</button>
        <button type="button" data-filter="P4" class="p4btn">P4</button>
        <button type="button" data-filter="P1" class="p1btn">P1</button>
        <button type="button" id="pLevelLazyBtn" title="Copies FNSKU, then the highest-quantity bin from P2, P3 and P4">Lazy bin check</button>
        <button type="button" id="pLevelCopyBtn">Copy visible</button>
      </div>
      <div class="p-level-muted" id="pLevelOverlayHint">Overlay-only mode. Dedupes container hierarchy checks, then groups here. FCResearch table remains unchanged.</div>
      <table id="pLevelOverlayTable">
        <thead>
          <tr>
            <th>Floor</th>
            <th>Container</th>
            <th>Qty</th>
            <th>FNSKU</th>
            <th>FcSku</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById("pLevelCloseBtn").onclick = () => {
    overlay.style.display = "none";
    const btn = document.getElementById("p-level-overlay-start-btn");
    if (btn) {
      btn.style.display = "inline-block";
      btn.innerHTML = "Show P-level overlay";
    }
  };

  document.getElementById("pLevelMinBtn").onclick = () => {
    overlay.classList.toggle("minimized");
    document.getElementById("pLevelMinBtn").textContent = overlay.classList.contains("minimized") ? "Open" : "Min";
  };

  document.getElementById("pLevelPauseBtn").onclick = () => {
    scanPaused = !scanPaused;
    updatePauseButton();

    if (!scanPaused) {
      updateOverlayStatus("Resuming");
      pumpFetchQueue();
    } else {
      updateOverlayStatus("Paused");
    }
  };

  document.querySelectorAll("#pLevelOverlayFilters button[data-filter]").forEach(btn => {
    btn.onclick = () => {
      overlayFilter = btn.getAttribute("data-filter");
      document.querySelectorAll("#pLevelOverlayFilters button[data-filter]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      refreshOverlay();
    };
  });


  document.getElementById("pLevelLazyBtn").onclick = copyLazyBinCheck;
  document.getElementById("pLevelCopyBtn").onclick = copyVisibleOverlayRows;

  refreshOverlay();
}

function getVisibleOverlayRows() {
  let rows = overlayRows.slice();

  if (overlayFilter !== "ALL") {
    rows = rows.filter(r => r.floorLabel === overlayFilter);
  }

  rows.sort((a, b) => {
    const floorCompare = a.floorNum - b.floorNum;
    if (floorCompare !== 0) return floorCompare;
    return a.containerText.localeCompare(b.containerText);
  });

  return rows;
}

function scheduleOverlayRefresh() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    refreshOverlay();
  }, 120);
}

function refreshOverlay() {
  if (!overlayBuilt) return;

  const tbody = document.querySelector("#pLevelOverlayTable tbody");
  if (!tbody) return;

  const rows = getVisibleOverlayRows();
  tbody.innerHTML = "";

  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" class="p-level-muted">No rows yet.</td>`;
    tbody.appendChild(tr);
    updateOverlayStatus();
    return;
  }

  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="p-sort-pill ${escapeHtml(r.floorClass)}">${escapeHtml(r.floorLabel)}</span></td>
      <td>${r.containerHref ? `<a class="p-level-copy" href="${escapeAttr(r.containerHref)}" target="_blank">${escapeHtml(r.containerText)}</a>` : `<span class="p-level-copy">${escapeHtml(r.containerText)}</span>`}</td>
      <td>${escapeHtml(r.quantity)}</td>
      <td>${escapeHtml(r.fnsku)}</td>
      <td>${escapeHtml(r.fcsku)}</td>
    `;

    tbody.appendChild(tr);
  });

  updateOverlayStatus();
}


function updatePauseButton() {
  const btn = document.getElementById("pLevelPauseBtn");
  if (!btn) return;

  btn.textContent = scanPaused ? "Resume" : "Pause";
  btn.classList.toggle("paused", scanPaused);
}

function updateOverlayStatus(forcedText) {
  const status = document.getElementById("pLevelOverlayStatus");
  if (!status) return;

  if (forcedText) {
    status.textContent = `- ${forcedText} (${processedPods}/${Math.max(totalPods, 0)} containers | active ${activeRequests} | queued ${fetchQueue.length} | ${overlayRows.length}/${Math.max(totalRows, 0)} rows) | showing ${getVisibleOverlayRows().length}`;
    return;
  }

  if (scanPaused) {
    status.textContent = `- Paused (${processedPods}/${Math.max(totalPods, 0)} containers | active ${activeRequests} | queued ${fetchQueue.length} | ${overlayRows.length}/${Math.max(totalRows, 0)} rows) | showing ${getVisibleOverlayRows().length}`;
    return;
  }

  if (!totalPods) {
    status.textContent = `- ${overlayRows.length} rows`;
    return;
  }

  status.textContent = `- ${processedPods}/${totalPods} containers checked | ${overlayRows.length}/${totalRows} rows | showing ${getVisibleOverlayRows().length}`;
}

function copyLazyBinCheck() {
  if (!overlayRows.length) {
    flashCopyButton("pLevelLazyBtn", "No bins");
    return;
  }

  // Wait for the full scan so the chosen bin really is the highest quantity on each floor.
  if (totalPods && processedPods < totalPods) {
    flashCopyButton("pLevelLazyBtn", "Wait for scan");
    return;
  }

  // Usually there is one FNSKU on the page. If there are several, copy one Excel row per FNSKU.
  const rowsByFnsku = new Map();
  overlayRows.forEach(row => {
    const fnsku = cleanCopyField(row.fnsku || row.fcsku);
    if (!fnsku) return;
    if (!rowsByFnsku.has(fnsku)) rowsByFnsku.set(fnsku, []);
    rowsByFnsku.get(fnsku).push(row);
  });

  if (!rowsByFnsku.size) {
    flashCopyButton("pLevelLazyBtn", "No FNSKU");
    return;
  }

  const floors = ["P2", "P3", "P4"];
  const lines = [];

  rowsByFnsku.forEach((rows, fnsku) => {
    const selectedBins = floors.map(floor => getHighestQuantityBin(rows, floor));
    lines.push([fnsku].concat(selectedBins).map(cleanCopyField).join("\t"));
  });

  // No headers: paste directly into the existing ASIN / P2 / P3 / P4 Excel row.
  copyTextToClipboard(lines.join("\n"), "pLevelLazyBtn");
}

function getHighestQuantityBin(rows, floorLabel) {
  const candidates = rows
    .filter(row => row.floorLabel === floorLabel && row.containerText)
    .slice()
    .sort((a, b) => {
      const quantityDifference = getNumericQuantity(b.quantity) - getNumericQuantity(a.quantity);
      if (quantityDifference !== 0) return quantityDifference;
      return a.containerText.localeCompare(b.containerText);
    });

  // Blank cell when the FNSKU has no bin on this floor.
  return candidates.length ? candidates[0].containerText : "";
}

function getNumericQuantity(value) {
  const match = String(value || "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function copyVisibleOverlayRows() {
  const rows = getVisibleOverlayRows();

  // Excel-friendly TSV. Includes visible table headers + only currently visible/filter-matched rows.
  const header = ["Floor", "Container", "Qty", "FNSKU", "FcSku"];
  const lines = [header].concat(rows.map(r => [
    r.floorLabel,
    r.containerText,
    r.quantity,
    r.fnsku,
    r.fcsku
  ]));

  const text = lines.map(cols => cols.map(cleanCopyField).join("\t")).join("\n");
  copyTextToClipboard(text, "pLevelCopyBtn");
}

function cleanCopyField(value) {
  return String(value || "")
    .replace(/\r?\n/g, " ")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function copyTextToClipboard(text, buttonId) {
  // navigator.clipboard can fail on some Amazon/internal pages or browser permission states.
  // Hidden textarea + execCommand is more reliable for Tampermonkey and copies straight into Excel.
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "readonly");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  ta.style.top = "0";
  ta.style.opacity = "0";
  document.body.appendChild(ta);

  ta.focus();
  ta.select();
  ta.setSelectionRange(0, ta.value.length);

  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch (_) {
    ok = false;
  }

  document.body.removeChild(ta);

  if (!ok && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => flashCopyButton(buttonId, "Copied"))
      .catch(() => window.prompt("Copy visible rows:", text));
    return;
  }

  if (ok) {
    flashCopyButton(buttonId, "Copied");
  } else {
    window.prompt("Copy visible rows:", text);
  }
}

function flashCopyButton(buttonId, msg) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  const old = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => { btn.textContent = old; }, 1000);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
