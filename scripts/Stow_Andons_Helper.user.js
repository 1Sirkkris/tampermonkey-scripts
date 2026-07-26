// ==UserScript==
// @name         v5.3 Stow Andons Helper
// @namespace    Violentmonkey Scripts
// @include     /^https?:\/\/.*fcresearch.*\//
// @include     /^https?:\/\/qifcr\.fe\.aftx\.amazonoperations\.app\//
// @grant        GM_xmlhttpRequest
// @connect      aft-fud-reports.iad.amazon.com
// @connect      aft-moveapp-nrt-nrt.nrt.proxy.amazon.com
// @connect      fcresearch-fe.aka.amazon.com
// @connect      localhost
// @version      5.3
// @description  Stow Andons Helper with Root Cause Tracker + sortable hover + FUD Firefox selection fix + clearer sussy row/FNSKU border + post-dropzone search refocus
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Stow_Andons_Helper.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Stow_Andons_Helper.user.js
// ==/UserScript==

/* =========================================================
 *  IIFE 1 — FUD Urgency Highlighting
 *  v5.0 — Firefox selection visibility + FUD non-selectable
 * ========================================================= */
(function () {
  'use strict';

  const FUD_URL = 'https://aft-fud-reports.iad.amazon.com/fudService/reports/BWU2.json';
  const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

  let fudMap = new Map();
  let highlightTimer = null;

  const coerceMs = v => (v < 1e12 ? v * 1000 : v);

  function debounceHighlight() {
    if (highlightTimer) return;
    highlightTimer = setTimeout(() => {
      highlightTimer = null;
      highlightInventoryRows();
    }, 200);
  }

  function getUrgencyClass(needByMs) {
    const diff = (needByMs - Date.now()) / 3600000;
    if (diff <= 2) return 'vm-fud-red';
    if (diff <= 8) return 'vm-fud-yellow';
    return 'vm-fud-green';
  }

  function formatRemaining(needByMs) {
    let diff = needByMs - Date.now();
    const pos = diff >= 0;
    diff = Math.abs(diff);

    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);

    return pos ? `${h}h ${m}m` : `OVERDUE: ${h}h ${m}m`;
  }

  function gmFetchJson(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        headers: { Accept: 'application/json' },
        timeout: 30000,
        onload: r => {
          try {
            r.status < 300
              ? resolve(JSON.parse(r.responseText))
              : reject(new Error(`HTTP ${r.status}`));
          } catch (e) {
            reject(e);
          }
        },
        onerror: e => reject(e),
        ontimeout: () => reject(new Error('Timeout'))
      });
    });
  }

  async function refreshFudList() {
    try {
      const json = await gmFetchJson(FUD_URL);
      const list = Array.isArray(json?.reportEntityList) ? json.reportEntityList : [];
      const m = new Map();

      for (const r of list) {
        const c = String(r.scannableId || '').trim();
        const f = String(r.fnSku || '').trim();
        const n = r.needByDate ? coerceMs(r.needByDate) : null;

        if (c && f && n) {
          m.set(c + '||' + f, n);
        }
      }

      fudMap = m;
      highlightInventoryRows();
    } catch (err) {
      console.error('[FUD] refresh failed:', err);
    }
  }

  function getInventoryTbody() {
    const section = document.querySelector('div[data-section-type="inventory"]');
    return section?.querySelector('#table-inventory')?.querySelector('tbody') || null;
  }

  function getCleanSkuFromCell(cell) {
    // Important: only return the real link text.
    // Do NOT use cell.textContent here, because FUD text is appended inside this cell.
    return cell?.querySelector('a')?.textContent?.trim() || '';
  }

  function clearFudState(tr, cell, fudEl) {
    tr.classList.remove('vm-fud-red', 'vm-fud-yellow', 'vm-fud-green');
    cell?.classList.remove('vm-fud-cell');
    fudEl?.remove();
  }

  function highlightInventoryRows() {
    const tbody = getInventoryTbody();
    if (!tbody) return;

    for (const tr of tbody.rows) {
      const c = tr.cells;
      if (!c || c.length < 3) continue;

      const container = c[0].querySelector('a')?.textContent.trim() || '';
      const cell = c[2];
      const fnSku = getCleanSkuFromCell(cell);
      let fudEl = cell.querySelector('.vm-fud-needby');

      if (!container || !fnSku) {
        clearFudState(tr, cell, fudEl);
        continue;
      }

      const needByMs = fudMap.get(container + '||' + fnSku);

      if (!needByMs) {
        clearFudState(tr, cell, fudEl);
        continue;
      }

      tr.classList.remove('vm-fud-red', 'vm-fud-yellow', 'vm-fud-green');
      tr.classList.add(getUrgencyClass(needByMs));
      cell.classList.add('vm-fud-cell');

      if (!fudEl) {
        fudEl = document.createElement('div');
        fudEl.className = 'vm-fud-needby';
        fudEl.setAttribute('aria-hidden', 'true');
        fudEl.setAttribute('tabindex', '-1');
        cell.appendChild(fudEl);
      }

      fudEl.textContent = `FUD: ${formatRemaining(needByMs)}`;
    }
  }

  function injectStyles() {
    if (document.getElementById('vm-fud-css-v5')) return;

    const s = document.createElement('style');
    s.id = 'vm-fud-css-v5';

    s.textContent = `
      .vm-fud-red{background-color:#fecaca!important}
      .vm-fud-yellow{background-color:#fef9c3!important}
      .vm-fud-green{background-color:#bbf7d0!important}

      #table-inventory tr,
      #table-inventory td{
        height:auto!important;
        white-space:nowrap!important;
        vertical-align:middle!important;
      }

      .vm-fud-cell{
        position:relative!important;
      }

      .vm-fud-needby{
        display:block!important;
        font-size:11px!important;
        line-height:1.2!important;
        margin-top:2px!important;
        white-space:nowrap!important;
        color:#111827!important;

        user-select:none!important;
        -moz-user-select:none!important;
        -webkit-user-select:none!important;
        -ms-user-select:none!important;

        pointer-events:none!important;
      }

      .vm-fud-needby::selection{
        background:transparent!important;
        color:inherit!important;
      }

      .vm-fud-cell a{
        position:relative!important;
        z-index:1!important;
      }

      .vm-fud-cell a::selection{
        background:#2563eb!important;
        color:#ffffff!important;
      }

      /* Firefox/control-select visibility help */
      .vm-fud-cell:focus,
      .vm-fud-cell:focus-within,
      .vm-fud-cell.selected,
      .vm-fud-cell.a-selected,
      .vm-fud-cell.vm-selected,
      .vm-fud-cell.vm-cell-selected,
      .vm-fud-cell[aria-selected="true"]{
        outline:3px solid #f97316!important;
        outline-offset:-3px!important;
        box-shadow:inset 0 0 0 2px #fff7ed!important;
      }

      /* When dragging/selecting text inside FNSKU link, keep selection obvious */
      #table-inventory td.vm-fud-cell ::selection{
        background:#2563eb!important;
        color:#ffffff!important;
      }

      #table-inventory td.vm-fud-cell .vm-fud-needby::selection{
        background:transparent!important;
        color:#111827!important;
      }

      div[data-section-type="inventory"] div[style*="overflow-y"]{
        overflow-y:visible!important;
        max-height:none!important;
        height:auto!important;
      }
    `;

    document.head.appendChild(s);
  }

  function init() {
    injectStyles();
    refreshFudList();
    setInterval(refreshFudList, REFRESH_INTERVAL_MS);

    setTimeout(() => {
      const tb = getInventoryTbody();

      if (tb) {
        new MutationObserver(() => debounceHighlight()).observe(tb, {
          childList: true,
          subtree: true
        });
      }

      highlightInventoryRows();
    }, 1500);
  }

  document.readyState !== 'loading'
    ? init()
    : window.addEventListener('DOMContentLoaded', init);
})();

/* =========================================================
 *  IIFE 2 — FCResearch Helper (Main UI)
 * ========================================================= */
(function () {
  'use strict';

  /* ============ CONSTANTS ============ */
  const MOVE_ENDPOINT = 'https://aft-moveapp-nrt-nrt.nrt.proxy.amazon.com/api/move-container';
  const PRODUCT_ENDPOINT = 'https://fcresearch-fe.aka.amazon.com/BWU2/results/product';

  const CK = {
    floor: 'vm_fc_floor', printDz: 'vm_fc_print_dropzone', printQty: 'vm_fc_print_dz_qty',
    showImg: 'vm_fc_show_img_hover', imgW: 'vm_fc_img_width', showTitle: 'vm_fc_show_title_hover',
    showDims: 'vm_fc_show_dims_hover', showWeight: 'vm_fc_show_weight_hover', showSortable: 'vm_fc_show_sortable_hover'
  };
  const SK = { moves: 'vm_fc_drop_moves_v1', sos: 'vm_fc_sos_report_v1', rc: 'vm_fc_root_causes_v1', adj: 'vm_fc_tote_adj_v1' };

  const FLOORS = ['P1','P2','P3','P4'];
  const DROP_TYPES_UPPER = [
    { key: 'Cubiscan', label: 'Cubiscan', pattern: 'dz-Pcubiscan-{floor}' },
    { key: 'Damages', label: 'Damages', pattern: 'dz-P-Damages-{floor}' },
    { key: 'Hazmat', label: 'Hazmat', pattern: 'dz-P-Hazmat-{floor}' },
    { key: 'ISS', label: 'ISS', pattern: 'dz-P-ISS-{floor}' },
    { key: 'Non-Sort', label: 'Non-Sort', pattern: 'dz-Pnonsort-{floor}' },
    { key: 'Prep', label: 'Prep', pattern: 'dz-P-Prep-{floor}' }
  ];
  const DROP_TYPES_P1 = [
    { key: 'P1-Hazmat', label: 'Hazmat', dest: 'dz-P-HAZMAT_OUT' },
    { key: 'P1-Ticketland', label: 'Ticketland', dest: 'dz-P-Ticketland' },
    { key: 'P1-Consolidation', label: 'Consolidation', dest: 'dz-P-issconsol' },
    { key: 'P1-ISS-WIP', label: 'ISS WIP', dest: 'dz-S-ISSWIP1' },
    { key: 'P1-Nonsort', label: 'Nonsort', dest: 'dz-P-IB-nonsort' },
    { key: 'P1-Shipdock', label: 'Shipdock', dest: 'dz-P-ISS-Shipdock' },
    { key: 'P1-Damageland', label: 'Damageland', dest: 'dz-Pdamageland' },
    { key: 'P1-Receive-Damages', label: 'Receive Damages', dest: 'dz-P-rcv-Damages' }
  ];
  const DROP_TYPES = [...DROP_TYPES_UPPER.map(x => x.key), 'Prime', ...DROP_TYPES_P1.map(x => x.key)];
  const SOS_CATEGORIES = ['Problem Totes','Cubiscan','Prep','Damages','ISS','Hazmat','Non Sort'];

  const RC_TREE = {
    'Damage': [
      { code: 'Defective', desc: 'Unit/s were flipped to defective using the INACTS tool by the Product Compliance team.' },
      { code: 'Warehouse Damaged', desc: 'Unit/s were in unsellable condition due to fault during Amazon warehouse process.' },
      { code: 'Distributor Damaged', desc: 'Unit/s were in unsellable condition due to fault during vendor distributor process.' },
      { code: 'Broken Set - Unsellable', desc: 'Unit/s were split from master-pack and are unable to be made sellable.' }
    ],
    'Prep': [
      { code: 'Stickering - UPC/EAN not Linked', desc: 'Barcode on item does not link to an ASIN.', modal: { prompt: 'Enter barcode on item:', field: 'barcode' } },
      { code: 'Stickering - Similiar Asin (No PO)', desc: 'Barcode on item links to wrong ASIN with no active POs.', modal: { prompt: 'Enter the correct ASIN:', field: 'correctAsin' } },
      { code: 'Stickering - FNSKU Required', desc: 'Item requires FNSKU labelling.' },
      { code: 'Stickering - Unscannable Barcode', desc: 'Barcode on item unscannable due to being faded, damaged or too small.' },
      { code: 'Stickering - Incorrect Barcode', desc: 'Barcode on item incorrect due to vendor error.', modal: { prompt: 'Enter incorrect barcode applied:', field: 'incorrectBarcode' } },
      { code: 'Stickering - Missing Barcode', desc: 'No barcode present on item, item is missing X00/B00 label on item.' },
      { code: 'Stickering - Invalid LPN', desc: 'Direct import LPN label on item not linked to ASIN.' },
      { code: 'Stickering - Covered Barcode', desc: 'Barcode on item covered by labels.' },
      { code: 'Bagging - Vendor Required Prep', desc: 'Item not prepped by vendor (Liquid/Sharps/Clothing).' },
      { code: 'Bagging - Damaged Packaging or Broken Set', desc: 'Item still sellable, however original packaging/bagging is ripped/damaged.' }
    ],
    'Cubiscan': [
      { code: 'Incorrect Dimensions - Wrong Pod Size', desc: 'ASIN has incorrect sizing for the pod.' },
      { code: 'Incorrect Dimensions - Virtually Non-sortable', desc: 'ASIN has virtually non-sortable dimensions but is physically sortable.' },
      { code: 'Incorrect Weight', desc: 'ASIN has incorrect weight causing bin filter violations.' }
    ],
    'Non-sort': [
      { code: 'Over-sized Dimensions', desc: 'ASIN does not physically fit within a tote\'s dimensions and exceeds 18 inches.' },
      { code: 'Over-sized Weight', desc: 'ASIN exceeds our FC\'s weight threshold of 10kgs.' }
    ],
    'ISS': [
      { code: 'Quarantine Status', desc: 'Unit/s are under "Quarantine" status and unable to stow.' },
      { code: 'Ticket Required - No Expiration', desc: 'ASIN requires an expiration date which is not provided on item.' },
      { code: 'Ticket Required - Unsure ASIN', desc: 'Item has no barcode and unable to find ASIN after utilising all tools available.' }
    ],
    'Hazmat': [
      { code: 'Level 0 Hazmat', desc: 'Item is a grey hazmat and requires TT.' },
      { code: 'Level 5 Hazmat', desc: 'Item is a level 5 hazmat and needs to be transhiped to a hazmat FC.' },
      { code: 'Level 6/7 Hazmat', desc: 'Item cannot be sold and requires a TT & Disposal' }
    ],
    'General': [
      { code: 'Unopened Box', desc: 'Box was not opened during the decant process.' },
      { code: 'Physical/Virtual Mismatch', desc: 'Unit/s are physically in tote but not virtually.' }
    ]
  };

  /* ============ COOKIE / STORAGE HELPERS ============ */
  function setCookie(n, v, d) {
    let e = '';
    if (d) { const dt = new Date(); dt.setTime(dt.getTime() + d * 864e5); e = '; expires=' + dt.toUTCString(); }
    document.cookie = n + '=' + encodeURIComponent(v) + e + '; path=/';
  }
  function getCookie(n) {
    for (let c of document.cookie.split(';')) { c = c.trim(); if (c.startsWith(n + '=')) return decodeURIComponent(c.slice(n.length + 1)); }
    return null;
  }

  /* ---- Dropzone Moves ---- */
  let dzMoves = loadDz();
  function loadDz() { try { const p = JSON.parse(localStorage.getItem(SK.moves)); if (!p || typeof p !== 'object') return {}; Object.keys(p).forEach(k => { if (!p[k]?.containers) delete p[k]; }); return p; } catch { return {}; } }
  function saveDz() { try { localStorage.setItem(SK.moves, JSON.stringify(dzMoves)); } catch {} }
  function dzKey(t, f) { return `${t}::${f}`; }
  function recordDz(t, f, id) { const k = dzKey(t, f); if (!dzMoves[k]) dzMoves[k] = { dropType: t, floor: f, containers: [] }; if (!dzMoves[k].containers.includes(id)) { dzMoves[k].containers.push(id); saveDz(); renderDzList(); renderEos(); } }
  function removeDz(k, id) { const e = dzMoves[k]; if (!e) return; e.containers = e.containers.filter(c => c !== id); if (!e.containers.length) delete dzMoves[k]; saveDz(); renderDzList(); renderEos(); }
  function clearDz() { dzMoves = {}; saveDz(); renderDzList(); renderEos(); }

  /* ---- SOS Report ---- */
  let sosData = loadSos();
  function loadSos() { try { const p = JSON.parse(localStorage.getItem(SK.sos)); if (!p || typeof p !== 'object') return { P1: {}, P2: {}, P3: {}, P4: {} }; FLOORS.forEach(f => { if (!p[f]) p[f] = {}; }); return p; } catch { return { P1: {}, P2: {}, P3: {}, P4: {} }; } }
  function saveSos() { try { localStorage.setItem(SK.sos, JSON.stringify(sosData)); } catch {} }
  function getSos(f, c) { return sosData[f]?.[c] || 0; }
  function setSos(f, c, v) { if (!sosData[f]) sosData[f] = {}; sosData[f][c] = v; saveSos(); }
  function getDropCount(f, c) { const m = { 'Cubiscan':'Cubiscan','Prep':'Prep','Damages':'Damages','ISS':'ISS','Hazmat':'Hazmat','Non Sort':'Non-Sort' }; const t = m[c]; if (!t) return 0; return dzMoves[dzKey(t, f)]?.containers?.length || 0; }
  function getEos(f, c) { return getSos(f, c) + getDropCount(f, c) - getAdj(f, c, 'moved') + getAdj(f, c, 'injected'); }

  /* ---- Tote Count Adjustments (moved / injected) ---- */
  let adjData = loadAdj();
  function loadAdj() { try { const p = JSON.parse(localStorage.getItem(SK.adj)); if (!p || typeof p !== 'object') return { P1:{}, P2:{}, P3:{}, P4:{} }; FLOORS.forEach(f => { if (!p[f]) p[f] = {}; }); return p; } catch { return { P1:{}, P2:{}, P3:{}, P4:{} }; } }
  function saveAdj() { try { localStorage.setItem(SK.adj, JSON.stringify(adjData)); } catch {} }
  function getAdj(f, c, type) { return adjData[f]?.[c + '::' + type] || 0; }
  function setAdj(f, c, type, v) { if (!adjData[f]) adjData[f] = {}; adjData[f][c + '::' + type] = v; saveAdj(); }

  /* ---- Root Causes ---- */
  let rcList = loadRc();
  function loadRc() { try { const p = JSON.parse(localStorage.getItem(SK.rc)); return Array.isArray(p) ? p : []; } catch { return []; } }
  function saveRc() { try { localStorage.setItem(SK.rc, JSON.stringify(rcList)); } catch {} }
  function addRc(e) { rcList.push(e); saveRc(); }
  function updateRc(i, e) { if (i >= 0 && i < rcList.length) { rcList[i] = e; saveRc(); } }
  function removeRc(i) { if (i >= 0 && i < rcList.length) { rcList.splice(i, 1); saveRc(); } }
  function clearRc() { rcList = []; saveRc(); }

  /* ============ URL HELPERS ============ */
  function isTsCs(u = location.href) { try { const x = new URL(u); if (!x.pathname.startsWith('/BWU2/results')) return false; const s = x.searchParams.get('s') || ''; return /^(ts|cs)X/i.test(s); } catch { return false; } }
  function getContainerId(u = location.href) { try { return new URL(u).searchParams.get('s') || null; } catch { return null; } }

  function getTopSearchInput() {
    const inputs = [...document.querySelectorAll('input[type="search"], input[type="text"], input:not([type])')];
    return inputs.find(input => {
      const r = input.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      if (r.top < 0 || r.top > 90) return false;
      if (r.width < 250) return false;
      return true;
    }) || null;
  }

  function refocusTopSearchInput(delay = 80) {
    setTimeout(() => {
      const input = getTopSearchInput();
      if (!input) return;
      input.focus({ preventScroll: true });
      try { input.select(); } catch {}
    }, delay);
  }

  /* ============ SETTINGS GETTERS ============ */
  function getFloor() { const a = document.querySelector('.vm-floor-btn.active'); return a ? a.dataset.floor : getCookie(CK.floor) || null; }
  function getActiveDropTypes() { return getFloor() === 'P1' ? DROP_TYPES_P1 : DROP_TYPES_UPPER; }
  function setFloor(f, silent = false) {
    if (!FLOORS.includes(f)) return;
    setCookie(CK.floor, f, 365);
    document.querySelectorAll('.vm-floor-btn').forEach(b => b.classList.toggle('active', b.dataset.floor === f));
    refreshInlineDropButtons();
    if (document.getElementById('vm-sos-body')) renderSos();
    if (!silent) toast('Floor set to ' + f, 's');
  }
  function ckBool(id, ck) { const el = document.getElementById(id); if (el) return el.checked; return getCookie(ck) !== '0'; }
  function showImg() { return ckBool('vm-set-img', CK.showImg); }
  function showTitle() { return ckBool('vm-set-title', CK.showTitle); }
  function showDims() { return ckBool('vm-set-dims', CK.showDims); }
  function showWeight() { return ckBool('vm-set-weight', CK.showWeight); }
  function showSortable() { return ckBool('vm-set-sortable', CK.showSortable); }
  function imgWidth() { const el = document.getElementById('vm-set-imgw'); let v = parseInt(el?.value || getCookie(CK.imgW) || '150', 10); return (!Number.isFinite(v) || v < 50) ? 150 : v; }
  function printEnabled() { const el = document.getElementById('vm-set-print'); return !!(el?.checked); }
  function printQty() { const el = document.getElementById('vm-set-qty'); let v = parseInt(el?.value || '2', 10); return (!Number.isFinite(v) || v < 1) ? 1 : v; }

  /* ============ PANEL MANAGEMENT ============ */
  const PANELS = ['vm-settings-pop','vm-dz-pop','vm-sos-pop','vm-rc-pop'];
  function closeAll() { PANELS.forEach(id => document.getElementById(id)?.classList.add('hidden')); }
  function toggle(id) { const p = document.getElementById(id); if (!p) return; const was = p.classList.contains('hidden'); closeAll(); if (was) p.classList.remove('hidden'); }

  /* ============ DESTINATION MAPPING ============ */
  function buildDest(t, f) {
    if (t === 'Prime') return 'dz-P-PRIME';
    if (!f) return null;
    if (f === 'P1') {
      const hit = DROP_TYPES_P1.find(x => x.key === t);
      return hit ? hit.dest : null;
    }
    const hit = DROP_TYPES_UPPER.find(x => x.key === t);
    return hit ? hit.pattern.replace('{floor}', f) : null;
  }
  function dropLabel(t) {
    if (t === 'Prime') return 'Prime';
    return DROP_TYPES_UPPER.find(x => x.key === t)?.label || DROP_TYPES_P1.find(x => x.key === t)?.label || t;
  }

  /* ============ INJECT GLOBAL STYLES ============ */
  let toastTimer = null;

  function injectAllStyles() {
    if (document.getElementById('vm-fc-global-css')) return;
    const s = document.createElement('style');
    s.id = 'vm-fc-global-css';
    s.textContent = `
/* ---- Design Tokens ---- */
:root {
  --vm-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --vm-bg: #ffffff;
  --vm-bg-subtle: #f8f9fa;
  --vm-bg-muted: #f1f3f5;
  --vm-border: #dee2e6;
  --vm-border-light: #e9ecef;
  --vm-text: #212529;
  --vm-text-secondary: #6c757d;
  --vm-text-muted: #adb5bd;
  --vm-primary: #1971c2;
  --vm-primary-hover: #1864ab;
  --vm-primary-bg: #e7f5ff;
  --vm-success: #2b8a3e;
  --vm-success-bg: #ebfbee;
  --vm-danger: #c92a2a;
  --vm-danger-hover: #e03131;
  --vm-purple: #7048e8;
  --vm-orange: #e8590c;
  --vm-teal: #0c8599;
  --vm-radius: 6px;
  --vm-radius-lg: 10px;
  --vm-shadow-sm: 0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.06);
  --vm-shadow: 0 4px 16px rgba(0,0,0,.1), 0 1px 3px rgba(0,0,0,.06);
  --vm-shadow-lg: 0 8px 30px rgba(0,0,0,.12), 0 2px 8px rgba(0,0,0,.06);
  --vm-transition: 150ms cubic-bezier(.4,0,.2,1);
}

/* ---- Toast ---- */
#vm-toast-wrap { position:fixed; bottom:20px; left:50%; transform:translateX(-50%); z-index:1000010; pointer-events:none; font-family:var(--vm-font); font-size:13px; }
#vm-toast { display:inline-block; padding:8px 14px; border-radius:var(--vm-radius); color:#fff; opacity:0; max-width:340px; text-align:center; box-shadow:var(--vm-shadow); }
#vm-toast.s { background:#2b8a3e; } #vm-toast.e { background:#c92a2a; } #vm-toast.i { background:#343a40; }

/* ---- FAB Toolbar ---- */
#vm-fab-bar {
  position:fixed; bottom:16px; left:16px; z-index:999998;
  display:flex; flex-direction:column-reverse; gap:6px;
}
.vm-fab {
  width:34px; height:34px; border-radius:50%; border:1px solid var(--vm-border);
  background:var(--vm-bg); cursor:pointer; display:flex; align-items:center; justify-content:center;
  box-shadow:var(--vm-shadow-sm); transition:all var(--vm-transition); font-size:15px; padding:0;
}
.vm-fab:hover { box-shadow:var(--vm-shadow); border-color:#adb5bd; transform:scale(1.08); }
.vm-fab.active { background:var(--vm-primary); border-color:var(--vm-primary); }
.vm-fab.active svg { stroke:#fff; }

/* ---- Popout Panels ---- */
.vm-panel {
  position:fixed; bottom:56px; left:58px; background:var(--vm-bg);
  border:1px solid var(--vm-border); border-radius:var(--vm-radius-lg);
  box-shadow:var(--vm-shadow-lg); font-family:var(--vm-font); font-size:13px;
  color:var(--vm-text); z-index:1000001; overflow:hidden;
  animation: vm-panel-in 120ms ease-out;
}
@keyframes vm-panel-in { from { opacity:0; transform:translateY(6px) scale(.97); } to { opacity:1; transform:none; } }
.vm-panel.hidden { display:none !important; }
.vm-panel-head {
  display:flex; align-items:center; justify-content:space-between;
  padding:12px 16px; border-bottom:1px solid var(--vm-border-light);
  background:var(--vm-bg-subtle);
}
.vm-panel-title { font-size:14px; font-weight:600; letter-spacing:-.01em; }
.vm-panel-body { padding:14px 16px; overflow-y:auto; }

/* ---- Shared Controls ---- */
.vm-btn {
  display:inline-flex; align-items:center; gap:5px; padding:6px 12px;
  border-radius:var(--vm-radius); border:1px solid var(--vm-border);
  background:var(--vm-bg); cursor:pointer; font:500 12px var(--vm-font);
  color:var(--vm-text); transition:all var(--vm-transition);
}
.vm-btn:hover { background:var(--vm-bg-muted); border-color:#adb5bd; }
.vm-btn-primary { background:var(--vm-primary); color:#fff; border-color:var(--vm-primary); }
.vm-btn-primary:hover { background:var(--vm-primary-hover); }
.vm-btn-success { background:var(--vm-success); color:#fff; border-color:var(--vm-success); }
.vm-btn-success:hover { background:#237032; }
.vm-btn-danger { color:var(--vm-danger); border-color:transparent; background:none; padding:4px 6px; }
.vm-btn-danger:hover { background:#fff5f5; }
.vm-btn-ghost { border-color:transparent; background:none; color:var(--vm-text-secondary); }
.vm-btn-ghost:hover { background:var(--vm-bg-muted); color:var(--vm-text); }
.vm-btn-sm { padding:4px 8px; font-size:11px; }

.vm-input, .vm-select {
  padding:6px 10px; border:1px solid var(--vm-border); border-radius:var(--vm-radius);
  font:13px var(--vm-font); color:var(--vm-text); background:var(--vm-bg);
  transition:border-color var(--vm-transition);
}
.vm-input:focus, .vm-select:focus { outline:none; border-color:var(--vm-primary); box-shadow:0 0 0 3px var(--vm-primary-bg); }
.vm-input-sm { padding:4px 8px; font-size:12px; }

.vm-checkbox { display:flex; align-items:center; gap:7px; font-size:12px; color:var(--vm-text); cursor:pointer; }
.vm-checkbox input { accent-color:var(--vm-primary); margin:0; }

.vm-section-label {
  font-size:10px; font-weight:700; letter-spacing:.6px; text-transform:uppercase;
  color:var(--vm-text-muted); margin:12px 0 6px; padding-top:10px; border-top:1px solid var(--vm-border-light);
}
.vm-section-label:first-child { margin-top:0; padding-top:0; border-top:none; }

.vm-number-row { display:flex; align-items:center; gap:8px; margin-top:4px; font-size:12px; }
.vm-number-row .vm-input { width:64px; text-align:center; }

/* ---- Floor Selector (shared) ---- */
.vm-floor-bar { display:flex; gap:4px; }
.vm-floor-btn {
  padding:5px 14px; border-radius:var(--vm-radius); border:1px solid var(--vm-border);
  background:var(--vm-bg); cursor:pointer; font:600 12px var(--vm-font); color:var(--vm-text-secondary);
  transition:all var(--vm-transition);
}
.vm-floor-btn:hover { background:var(--vm-bg-muted); }
.vm-floor-btn.active { background:var(--vm-primary); color:#fff; border-color:var(--vm-primary); }

/* ---- SOS/EOS Tables ---- */
.vm-sos-grid { display:flex; gap:10px; align-items:flex-start; }
.vm-sos-col { flex:1; min-width:0; }
.vm-sos-col.vm-adj-col { flex:0 0 auto; min-width:140px; }
.vm-sos-col-title { font:600 13px var(--vm-font); text-align:center; margin-bottom:4px; color:var(--vm-text); }
.vm-tbl { width:100%; border-collapse:collapse; font-size:12px; }
.vm-tbl th, .vm-tbl td { padding:7px 10px; text-align:left; border-bottom:1px solid var(--vm-border-light); }
.vm-tbl th { background:var(--vm-bg-subtle); font-weight:600; color:var(--vm-text-secondary); font-size:11px; text-transform:uppercase; letter-spacing:.3px; }
.vm-tbl td:last-child { text-align:center; }
.vm-tbl .vm-eos-val { font-weight:700; color:var(--vm-primary); }
.vm-tbl .vm-input { width:56px; }
.vm-sos-actions { display:flex; gap:6px; justify-content:flex-end; margin-top:12px; flex-wrap:wrap; }
.vm-adj-tbl th { font-size:10px; padding:7px 4px; text-align:center; }
.vm-adj-tbl td { text-align:center; padding:4px 2px; }
.vm-adj-tbl .vm-input { width:50px; }

/* ---- Dropzone List ---- */
.vm-dz-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(170px, 1fr)); gap:8px; }
.vm-dz-col { border:1px solid var(--vm-border-light); border-radius:var(--vm-radius); padding:8px; }
.vm-dz-col-head { font:600 12px var(--vm-font); margin-bottom:4px; color:var(--vm-text); }
.vm-dz-empty { font-size:11px; color:var(--vm-text-muted); }
.vm-dz-floor-title { font-size:11px; font-weight:600; margin:4px 0 2px; color:var(--vm-text-secondary); }
.vm-dz-list { list-style:none; padding:0; margin:0; }
.vm-dz-item { display:flex; align-items:center; justify-content:space-between; font-size:11px; padding:2px 0; }
.vm-dz-item span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:monospace; }

/* ---- Settings Panel ---- */
#vm-settings-pop { width:280px; }
#vm-settings-pop .vm-panel-body { padding:10px 16px 14px; }

/* ---- DZ Panel ---- */
#vm-dz-pop { min-width:420px; max-width:680px; max-height:70vh; display:flex; flex-direction:column; }
#vm-dz-pop .vm-panel-body { flex:1; overflow-y:auto; }

/* ---- SOS Panel ---- */
#vm-sos-pop { min-width:620px; max-width:780px; max-height:80vh; display:flex; flex-direction:column; }
#vm-sos-pop .vm-panel-body { flex:1; overflow-y:auto; }

/* ---- Root Cause Panel ---- */
#vm-rc-pop { min-width:520px; max-width:720px; max-height:80vh; display:flex; flex-direction:column; }
#vm-rc-pop .vm-panel-body { flex:1; overflow-y:auto; }

.vm-rc-form { display:flex; flex-direction:column; gap:8px; padding:10px 12px; background:var(--vm-bg-subtle); border:1px solid var(--vm-border-light); border-radius:var(--vm-radius); margin-bottom:12px; }
.vm-rc-form-row { display:flex; align-items:center; gap:8px; }
.vm-rc-form-row label { font:500 12px var(--vm-font); min-width:64px; color:var(--vm-text-secondary); }
.vm-rc-form-row .vm-input, .vm-rc-form-row .vm-select { flex:1; }

.vm-rc-table { width:100%; border-collapse:collapse; font-size:11px; }
.vm-rc-table th { background:var(--vm-bg-subtle); padding:6px 8px; text-align:left; font:600 10px var(--vm-font); text-transform:uppercase; letter-spacing:.4px; color:var(--vm-text-muted); border-bottom:1px solid var(--vm-border); position:sticky; top:0; }
.vm-rc-table td { padding:6px 8px; border-bottom:1px solid var(--vm-border-light); vertical-align:middle; }
.vm-rc-table tr:hover td { background:var(--vm-bg-subtle); }
.vm-rc-asin { font-family:monospace; font-weight:600; font-size:11px; }
.vm-rc-badge { display:inline-block; padding:2px 7px; border-radius:3px; font:700 9px var(--vm-font); letter-spacing:.3px; color:#fff; text-transform:uppercase; }
.vm-rc-badge-damage{background:var(--vm-danger)} .vm-rc-badge-prep{background:var(--vm-primary)} .vm-rc-badge-cubiscan{background:var(--vm-purple)} .vm-rc-badge-nonsort{background:var(--vm-orange)} .vm-rc-badge-iss{background:var(--vm-teal)} .vm-rc-badge-hazmat{background:#e67700} .vm-rc-badge-general{background:#868e96}
.vm-rc-list-wrap { max-height:240px; overflow-y:auto; border:1px solid var(--vm-border-light); border-radius:var(--vm-radius); }
.vm-rc-empty { padding:20px; text-align:center; color:var(--vm-text-muted); font-size:12px; }
.vm-rc-desc { font-size:11px; line-height:1.45; color:var(--vm-text-secondary); padding:6px 10px; background:var(--vm-primary-bg); border-left:3px solid var(--vm-primary); border-radius:0 var(--vm-radius) var(--vm-radius) 0; display:none; }
.vm-rc-desc.visible { display:block; }
.vm-rc-actions { display:flex; justify-content:space-between; margin-top:10px; }
.vm-rc-modal-info { color:var(--vm-orange); font-size:10px; font-style:italic; }

/* ---- Modals (damages, hazmat, generic, edit) ---- */
.vm-modal-overlay {
  position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,.4);
  z-index:1000005; display:flex; align-items:center; justify-content:center;
  animation: vm-fade-in 100ms ease;
}
@keyframes vm-fade-in { from { opacity:0; } }
.vm-modal-overlay.hidden { display:none !important; }
.vm-modal {
  background:var(--vm-bg); border-radius:var(--vm-radius-lg); padding:20px 24px;
  box-shadow:var(--vm-shadow-lg); font-family:var(--vm-font); min-width:300px; max-width:420px;
  animation: vm-modal-in 150ms ease-out;
}
@keyframes vm-modal-in { from { opacity:0; transform:scale(.95) translateY(8px); } }
.vm-modal-title { font:600 15px var(--vm-font); margin-bottom:14px; text-align:center; color:var(--vm-text); }
.vm-modal-btns { display:flex; flex-direction:column; gap:8px; }
.vm-modal-option {
  padding:10px 14px; border:1px solid var(--vm-border); border-radius:var(--vm-radius);
  background:var(--vm-bg); cursor:pointer; font:13px var(--vm-font); color:var(--vm-text);
  transition:all var(--vm-transition); text-align:left;
}
.vm-modal-option:hover { background:var(--vm-bg-muted); border-color:#adb5bd; }
.vm-modal-cancel { margin-top:8px; text-align:center; }

/* ---- Hover Preview ---- */
#vm-hover { position:absolute; z-index:999997; pointer-events:none; display:none; }
#vm-hover-inner { padding:8px 10px; background:rgba(22,22,22,.94); border-radius:var(--vm-radius); box-shadow:var(--vm-shadow); display:flex; flex-direction:column; gap:6px; max-width:560px; max-height:none; overflow:visible; }
#vm-hover-content { display:flex; align-items:flex-start; gap:10px; min-width:0; }
#vm-hover-inner img { display:none; width:auto; max-width:180px; max-height:220px; object-fit:contain; border-radius:4px; flex:0 0 auto; }
#vm-hover-text { display:flex; flex-direction:column; gap:6px; min-width:170px; max-width:340px; }
#vm-hover-title { display:none; color:#f1f3f5; font-size:12px; line-height:1.35; overflow:hidden; -webkit-line-clamp:4; -webkit-box-orient:vertical; display:-webkit-box; max-width:340px; }
#vm-hover-details { display:none; color:#ced4da; font-size:11px; line-height:1.4; border-top:1px solid rgba(255,255,255,.15); padding-top:5px; }
.vm-detail-row { display:flex; align-items:center; gap:6px; margin-bottom:3px; }
.vm-detail-lbl { color:#9ca3af; min-width:68px; font-size:10px; text-transform:uppercase; letter-spacing:.3px; }
.vm-detail-val { color:#f1f3f5; }
.vm-detail-val.vm-dims-suspicious { padding:2px 6px; border:2px solid #f59e0b; border-radius:5px; background:#fff7ed; color:#111827; font-weight:800; }
.vm-sortable-pill {
  display:inline-block;
  padding:2px 7px;
  border-radius:999px;
  font:800 10px var(--vm-font);
  letter-spacing:.3px;
}
.vm-sortable-true {
  background:#fde047;
  color:#111827;
  border:1px solid #facc15;
}
.vm-sortable-false {
  background:#dc2626;
  color:#ffffff;
  border:1px solid #991b1b;
}
.vm-sortable-unknown {
  background:#e5e7eb;
  color:#374151;
}
.vm-madcat-true { background:#fde047; color:#111827; border:1px solid #facc15; }
.vm-madcat-false { background:#dc2626; color:#ffffff; border:1px solid #991b1b; }
.vm-madcat-unknown { background:#e5e7eb; color:#374151; border:1px solid #9ca3af; }

.vm-suspicious-dims-summary {
  display:inline-flex;
  align-items:center;
  gap:4px;
  margin-left:8px;
  padding:3px 8px;
  border-radius:999px;
  border:1px solid #f59e0b;
  background:#fff7ed;
  color:#7c2d12;
  font:800 11px var(--vm-font);
  vertical-align:middle;
}
.vm-suspicious-dims-summary.vm-loading {
  border-color:#94a3b8;
  background:#f8fafc;
  color:#475569;
}
.vm-suspicious-dims-summary.vm-clear {
  border-color:#22c55e;
  background:#f0fdf4;
  color:#14532d;
}
.vm-suspicious-dims-row td,
.vm-suspicious-dims-row td a {
  background:#fef9c3!important;
}
.vm-suspicious-dims-cell {
  /* Sussy marker = dashed/soft blue, so it does NOT look like the selected cell */
  outline:3px dashed rgba(37,99,235,.70)!important;
  outline-offset:-4px!important;
  border-radius:4px;
  background:#fff7ed!important;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.85)!important;
}
.vm-suspicious-dims-cell a {
  background:transparent!important;
}

/* Actual selected/focused FNSku cell = loud solid magenta */
.vm-suspicious-dims-cell:focus,
.vm-suspicious-dims-cell:focus-within,
.vm-suspicious-dims-cell.selected,
.vm-suspicious-dims-cell.a-selected,
.vm-suspicious-dims-cell.vm-selected,
.vm-suspicious-dims-cell.vm-cell-selected,
.vm-suspicious-dims-cell[aria-selected="true"] {
  outline:4px solid #d946ef!important;
  outline-offset:-4px!important;
  box-shadow:inset 0 0 0 2px #ffffff, 0 0 0 2px #d946ef!important;
}

/* ---- Inline Drop Buttons ---- */
.vm-drop-inline {
  margin-left:8px;
  display:inline-flex;
  align-items:center;
  flex-wrap:wrap;
  gap:5px;
  vertical-align:middle;
}
.vm-drop-inline-label {
  margin-right:0;
  font:700 12px var(--vm-font);
  color:#1f2937;
}
.vm-drop-inline .vm-floor-btn {
  min-width:32px;
  padding:4px 8px;
  border-radius:7px;
  border:1px solid #94a3b8;
  background:#f8fafc;
  color:#111827;
  font:800 12px var(--vm-font);
  box-shadow:0 1px 1px rgba(0,0,0,.08);
}
.vm-drop-inline .vm-floor-btn:hover {
  background:#e0f2fe;
  border-color:#0284c7;
}
.vm-drop-inline .vm-floor-btn.active {
  background:#0b74d1;
  color:#fff;
  border-color:#075a9f;
  box-shadow:0 0 0 1px #fff inset, 0 1px 2px rgba(0,0,0,.16);
}
.vm-drop-divider {
  margin:0 3px;
  color:#475569;
  font:800 12px var(--vm-font);
}
.vm-tag-btn {
  min-height:24px;
  padding:4px 8px;
  border-radius:7px;
  border:1px solid #94a3b8;
  background:#ffffff;
  cursor:pointer;
  font:700 12px var(--vm-font);
  color:#111827;
  box-shadow:0 1px 1px rgba(0,0,0,.08);
  transition:all var(--vm-transition);
}
.vm-tag-btn:hover {
  background:#eef6ff;
  border-color:#0b74d1;
  color:#073b70;
}
.vm-tag-btn:active {
  background:#dbeafe;
}
    `;
    document.head.appendChild(s);
  }

  /* ============ DOM SCAFFOLD ============ */
  function ensureDOM() {
    if (document.getElementById('vm-toast-wrap')) return;
    injectAllStyles();

    // Toast
    const tw = document.createElement('div'); tw.id = 'vm-toast-wrap';
    tw.innerHTML = '<div id="vm-toast"></div>';
    document.body.appendChild(tw);

    // Hover preview
    const hv = document.createElement('div'); hv.id = 'vm-hover';
    hv.innerHTML = '<div id="vm-hover-inner"><div id="vm-hover-content"><img id="vm-hover-img"/><div id="vm-hover-text"><div id="vm-hover-title"></div><div id="vm-hover-details"></div></div></div></div>';
    document.body.appendChild(hv);

    // Damages modal
    appendModal('vm-dmg-overlay', 'Select Damage Type', [
      { cls: 'defective', val: 'Defective', label: 'Defective', border: 'var(--vm-danger)' },
      { cls: 'warehouse', val: 'Warehouse Damage', label: 'Warehouse Damage', border: 'var(--vm-primary)' },
      { cls: 'distributor', val: 'Distributor Damage', label: 'Distributor Damage', border: 'var(--vm-purple)' }
    ], hideDmg);

    // Hazmat modal
    appendModal('vm-haz-overlay', 'Select Hazmat Level', [
      { cls: 'level0', val: 'Hazmat Level 0', label: 'Hazmat Level 0', border: '#868e96' },
      { cls: 'level5', val: 'Hazmat Level 5', label: 'Hazmat Level 5', border: 'var(--vm-danger)' },
      { cls: 'level67', val: 'Hazmat Level 6/7', label: 'Hazmat Level 6/7', border: 'var(--vm-danger)' }
    ], hideHaz);

    // Generic input modal (root cause optional field)
    const go = document.createElement('div'); go.id = 'vm-gen-overlay'; go.className = 'vm-modal-overlay hidden';
    go.innerHTML = `<div class="vm-modal"><div class="vm-modal-title" id="vm-gen-title">Additional Info</div><input class="vm-input" id="vm-gen-input" style="width:100%;box-sizing:border-box;margin-bottom:12px"/><div style="display:flex;gap:8px;justify-content:flex-end"><button class="vm-btn" id="vm-gen-skip">Skip</button><button class="vm-btn vm-btn-primary" id="vm-gen-ok">Submit</button></div></div>`;
    document.body.appendChild(go);
    go.addEventListener('click', e => { if (e.target === go) hideGen(); });

    // Edit root cause modal
    const eo = document.createElement('div'); eo.id = 'vm-edit-overlay'; eo.className = 'vm-modal-overlay hidden';
    eo.innerHTML = `<div class="vm-modal" style="min-width:380px"><div class="vm-modal-title">Edit Root Cause</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div class="vm-rc-form-row"><label>ASIN</label><input class="vm-input" id="vm-edit-asin"/></div>
        <div class="vm-rc-form-row"><label>Category</label><select class="vm-select" id="vm-edit-cat"></select></div>
        <div class="vm-rc-form-row"><label>Reason</label><select class="vm-select" id="vm-edit-reason"></select></div>
        <div class="vm-rc-form-row" id="vm-edit-extra-row" style="display:none"><label id="vm-edit-extra-lbl">Extra</label><input class="vm-input" id="vm-edit-extra"/></div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="vm-btn" id="vm-edit-cancel">Cancel</button><button class="vm-btn vm-btn-primary" id="vm-edit-save">Save</button></div></div>`;
    document.body.appendChild(eo);
    eo.addEventListener('click', e => { if (e.target === eo) hideEdit(); });

    // Click-outside handler for panels
    document.addEventListener('mousedown', e => {
      PANELS.forEach(id => {
        const panel = document.getElementById(id);
        if (!panel || panel.classList.contains('hidden')) return;
        const fabBar = document.getElementById('vm-fab-bar');
        if (panel.contains(e.target) || fabBar?.contains(e.target)) return;
        // Check if click is inside any modal overlay
        if (e.target.closest('.vm-modal-overlay')) return;
        panel.classList.add('hidden');
        updateFabStates();
      });
    });
  }

  function appendModal(id, title, options, hideFunc) {
    const ov = document.createElement('div');
    ov.id = id; ov.className = 'vm-modal-overlay hidden';
    let btns = options.map(o => `<button class="vm-modal-option" data-val="${o.val}" style="border-left:4px solid ${o.border}">${o.label}</button>`).join('');
    ov.innerHTML = `<div class="vm-modal"><div class="vm-modal-title">${title}</div><div class="vm-modal-btns">${btns}</div><div class="vm-modal-cancel"><button class="vm-btn vm-btn-ghost">Cancel</button></div></div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov) hideFunc(); });
    ov.querySelector('.vm-modal-cancel .vm-btn').addEventListener('click', hideFunc);
  }

  /* ============ TOAST ============ */
  function toast(msg, type = 'i') {
    ensureDOM();
    const t = document.getElementById('vm-toast');
    if (!t) return;
    if (toastTimer) clearTimeout(toastTimer);
    // Reset transition so opacity snaps to 1 immediately
    t.style.transition = 'none';
    t.textContent = msg; t.className = type;
    t.style.opacity = '1';
    // Force reflow so the snap takes effect before re-enabling transition
    void t.offsetWidth;
    t.style.transition = 'opacity 0.6s ease';
    // Hold visible for 3s, then fade out
    toastTimer = setTimeout(() => { t.style.opacity = '0'; }, 3000);
  }

  /* ============ DAMAGE / HAZMAT MODALS ============ */
  let dmgCb = null, hazCb = null;

  function showDmg(cb) { ensureDOM(); dmgCb = cb; const ov = document.getElementById('vm-dmg-overlay'); ov.classList.remove('hidden'); ov.querySelectorAll('.vm-modal-option').forEach(b => { const nb = b.cloneNode(true); b.replaceWith(nb); nb.addEventListener('click', () => { const cb = dmgCb; hideDmg(); if (cb) cb(nb.dataset.val); }); }); }
  function hideDmg() { document.getElementById('vm-dmg-overlay')?.classList.add('hidden'); dmgCb = null; }
  function showHaz(cb) { ensureDOM(); hazCb = cb; const ov = document.getElementById('vm-haz-overlay'); ov.classList.remove('hidden'); ov.querySelectorAll('.vm-modal-option').forEach(b => { const nb = b.cloneNode(true); b.replaceWith(nb); nb.addEventListener('click', () => { const cb = hazCb; hideHaz(); if (cb) cb(nb.dataset.val); }); }); }
  function hideHaz() { document.getElementById('vm-haz-overlay')?.classList.add('hidden'); hazCb = null; }

  /* ============ GENERIC INPUT MODAL ============ */
  let genCb = null;
  function showGen(title, placeholder, cb) {
    ensureDOM(); genCb = cb;
    document.getElementById('vm-gen-title').textContent = title;
    const inp = document.getElementById('vm-gen-input'); inp.value = ''; inp.placeholder = placeholder || '';
    document.getElementById('vm-gen-overlay').classList.remove('hidden');
    const ok = document.getElementById('vm-gen-ok'), sk = document.getElementById('vm-gen-skip');
    const nOk = ok.cloneNode(true), nSk = sk.cloneNode(true); ok.replaceWith(nOk); sk.replaceWith(nSk);
    nOk.addEventListener('click', () => { const v = document.getElementById('vm-gen-input')?.value?.trim() || ''; const cb = genCb; hideGen(); if (cb) cb(v); });
    nSk.addEventListener('click', () => { const cb = genCb; hideGen(); if (cb) cb(''); });
    setTimeout(() => inp.focus(), 80);
  }
  function hideGen() { document.getElementById('vm-gen-overlay')?.classList.add('hidden'); genCb = null; }

  /* ============ EDIT ROOT CAUSE MODAL ============ */
  let editIdx = -1;
  function showEdit(idx) {
    ensureDOM();
    const entry = rcList[idx]; if (!entry) return;
    editIdx = idx;
    document.getElementById('vm-edit-asin').value = entry.asin || '';
    const catSel = document.getElementById('vm-edit-cat');
    catSel.innerHTML = Object.keys(RC_TREE).map(c => `<option value="${c}" ${c === entry.category ? 'selected' : ''}>${c}</option>`).join('');
    function fillReasons(cat) {
      const rSel = document.getElementById('vm-edit-reason');
      rSel.innerHTML = (RC_TREE[cat] || []).map(s => `<option value="${s.code}" ${s.code === entry.reason ? 'selected' : ''}>${s.code}</option>`).join('');
      updateExtra();
    }
    function updateExtra() {
      const cat = document.getElementById('vm-edit-cat').value;
      const reason = document.getElementById('vm-edit-reason').value;
      const m = (RC_TREE[cat] || []).find(s => s.code === reason);
      const row = document.getElementById('vm-edit-extra-row');
      if (m?.modal) { row.style.display = 'flex'; document.getElementById('vm-edit-extra-lbl').textContent = m.modal.prompt; document.getElementById('vm-edit-extra').value = entry.modalValue || ''; }
      else { row.style.display = 'none'; document.getElementById('vm-edit-extra').value = ''; }
    }
    fillReasons(entry.category);
    const nCat = catSel.cloneNode(true); catSel.replaceWith(nCat);
    nCat.addEventListener('change', () => { entry.category = nCat.value; entry.reason = ''; fillReasons(nCat.value); });
    const rSel = document.getElementById('vm-edit-reason');
    const nR = rSel.cloneNode(true); rSel.replaceWith(nR);
    nR.addEventListener('change', updateExtra);
    fillReasons(entry.category);

    const sv = document.getElementById('vm-edit-save'), cn = document.getElementById('vm-edit-cancel');
    const nSv = sv.cloneNode(true), nCn = cn.cloneNode(true); sv.replaceWith(nSv); cn.replaceWith(nCn);
    nSv.addEventListener('click', () => {
      const a = document.getElementById('vm-edit-asin')?.value?.trim();
      const c = document.getElementById('vm-edit-cat')?.value;
      const r = document.getElementById('vm-edit-reason')?.value;
      const x = document.getElementById('vm-edit-extra')?.value?.trim() || '';
      if (!a) { toast('ASIN is required', 'e'); return; }
      updateRc(editIdx, { asin: a, category: c, reason: r, modalValue: x }); hideEdit(); renderRcList(); toast('Updated', 's');
    });
    nCn.addEventListener('click', hideEdit);
    document.getElementById('vm-edit-overlay').classList.remove('hidden');
  }
  function hideEdit() { document.getElementById('vm-edit-overlay')?.classList.add('hidden'); editIdx = -1; }

  /* ============ PRINTER ============ */
  function toHex(s) { return Array.from(new TextEncoder().encode(String(s))).map(b => b.toString(16).padStart(2, '0')).join(''); }
  function printLabel(type, custom) {
    const m = { Cubiscan:'Cubiscan', Damages:'Damages', Hazmat:'Hazmat', ISS:'ISS', 'Non-Sort':'Non Sort', Prep:'Prep', Prime:'Prime' };
    const hex = toHex(custom || m[type] || type);
    const url = new URL('http://localhost:5965/printer');
    ['action','type','data','text','quantity','desc','seq'].forEach((k, i) => url.searchParams.set(k, [, 'print','barcode',hex,hex,String(printQty()),'',String(Math.floor(Math.random()*9e9)+1e9)][i+1]));
    // fix params
    url.searchParams.set('action','print'); url.searchParams.set('type','barcode'); url.searchParams.set('data',hex); url.searchParams.set('text',hex); url.searchParams.set('quantity',String(printQty())); url.searchParams.set('desc',''); url.searchParams.set('seq',String(Math.floor(Math.random()*9e9)+1e9));
    return new Promise((res, rej) => {
      GM_xmlhttpRequest({ method:'GET', url:url.toString(), timeout:15000, onload:r=>(r.status<300?res('OK'):rej(new Error(`HTTP ${r.status}`))), onerror:()=>rej(new Error('Network')), ontimeout:()=>rej(new Error('Timeout')) });
    });
  }

  /* ============ MOVE CONTAINER ============ */
  function moveContainer(type, printLabel2) {
    const fl = getFloor();
    if (type !== 'Prime' && !fl) { toast('Select a floor (P2/P3/P4) first', 'e'); return; }
    const cid = getContainerId(); if (!cid) { toast('No container in URL', 'e'); return; }
    const dest = buildDest(type, fl); if (!dest) { toast('Bad destination for ' + type, 'e'); return; }
    GM_xmlhttpRequest({
      method:'POST', url:MOVE_ENDPOINT, headers:{'Content-Type':'application/json'},
      data:JSON.stringify({ sourceScannableId:null, destinationScannableId:dest, containerScannableId:cid, confirmed:'true' }),
      onload: r => {
        if (r.status < 300) {
          toast('Moved to ' + dest, 's'); recordDz(type, type==='Prime'?'N/A':fl, cid);
          if (printEnabled()) printLabel(type, dest).catch(e => toast('Print failed: ' + e.message, 'e'));
        } else toast('Move failed: ' + r.status, 'e');
        refocusTopSearchInput(80);
        refocusTopSearchInput(400);
      },
      onerror: () => {
        toast('Move error', 'e');
        refocusTopSearchInput(80);
      }
    });
  }

  /* ============ FAB BUTTON STATE ============ */
  function updateFabStates() {
    PANELS.forEach((id, i) => {
      const panel = document.getElementById(id);
      const fabId = ['vm-fab-settings','vm-fab-dz','vm-fab-sos','vm-fab-rc'][i];
      const fab = document.getElementById(fabId);
      if (fab && panel) {
        if (panel.classList.contains('hidden')) fab.classList.remove('active');
        else fab.classList.add('active');
      }
    });
  }

  /* ============ BUILD UI ============ */
  function createUI() {
    if (document.getElementById('vm-fab-bar')) return;
    ensureDOM();

    // SVG icon helper
    const ico = (d, s=16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

    // FAB bar
    const bar = document.createElement('div'); bar.id = 'vm-fab-bar';
    bar.innerHTML = `
      <button class="vm-fab" id="vm-fab-settings" title="Settings">${ico('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>')}</button>
      <button class="vm-fab" id="vm-fab-dz" title="Dropzone Moves">${ico('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>')}</button>
      <button class="vm-fab" id="vm-fab-sos" title="SOS/EOS Report">${ico('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>')}</button>
      <button class="vm-fab" id="vm-fab-rc" title="Root Cause Tracker">${ico('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>')}</button>
    `;
    document.body.appendChild(bar);

    // --- Settings Panel ---
    const settingsPanel = document.createElement('div'); settingsPanel.id = 'vm-settings-pop'; settingsPanel.className = 'vm-panel hidden';
    settingsPanel.innerHTML = `
      <div class="vm-panel-head"><span class="vm-panel-title">Settings</span></div>
      <div class="vm-panel-body">
        <div class="vm-section-label" style="margin-top:0;padding-top:0;border-top:none">Print</div>
        <label class="vm-checkbox"><input type="checkbox" id="vm-set-print">Print Dropzone Label</label>
        <div class="vm-number-row"><span>Label Quantity</span><input class="vm-input vm-input-sm" type="number" id="vm-set-qty" min="1"></div>

        <div class="vm-section-label">Hover Preview</div>
        <label class="vm-checkbox"><input type="checkbox" id="vm-set-img">Show Image</label>
        <div class="vm-number-row"><span>Image Width (px)</span><input class="vm-input vm-input-sm" type="number" id="vm-set-imgw" min="50"></div>
        <label class="vm-checkbox"><input type="checkbox" id="vm-set-title">Show Title</label>
        <label class="vm-checkbox"><input type="checkbox" id="vm-set-dims">Show Dimensions</label>
        <label class="vm-checkbox"><input type="checkbox" id="vm-set-weight">Show Weight</label>
        <label class="vm-checkbox"><input type="checkbox" id="vm-set-sortable">Show Sortable</label>
      </div>
    `;
    document.body.appendChild(settingsPanel);

    // --- DZ Panel ---
    const dzPanel = document.createElement('div'); dzPanel.id = 'vm-dz-pop'; dzPanel.className = 'vm-panel hidden';
    dzPanel.innerHTML = `<div class="vm-panel-head"><span class="vm-panel-title">Dropzone Moves</span><button class="vm-btn vm-btn-sm" id="vm-dz-clear">Clear All</button></div><div class="vm-panel-body" id="vm-dz-body"></div>`;
    document.body.appendChild(dzPanel);

    // --- SOS Panel ---
    const savedFloor = getCookie(CK.floor) || 'P2';
    const sosPanel = document.createElement('div'); sosPanel.id = 'vm-sos-pop'; sosPanel.className = 'vm-panel hidden';
    sosPanel.innerHTML = `
      <div class="vm-panel-head">
        <span class="vm-panel-title">SOS / EOS Report</span>
      </div>
      <div class="vm-panel-body">
        <div class="vm-sos-grid">
          <div class="vm-sos-col"><div class="vm-sos-col-title" id="vm-sos-title">${savedFloor} SOS</div><table class="vm-tbl"><thead><tr><th>Category</th><th>Count</th></tr></thead><tbody id="vm-sos-body"></tbody></table></div>
          <div class="vm-sos-col vm-adj-col"><div class="vm-sos-col-title">Adjustments</div><table class="vm-tbl vm-adj-tbl"><thead><tr><th>Moved Out</th><th>Injected In</th></tr></thead><tbody id="vm-adj-body"></tbody></table></div>
          <div class="vm-sos-col" id="vm-eos-capture"><div class="vm-sos-col-title" id="vm-eos-title">${savedFloor} EOS</div><table class="vm-tbl"><thead><tr><th>Category</th><th>Count</th></tr></thead><tbody id="vm-eos-body"></tbody></table></div>
        </div>
        <div class="vm-sos-actions">
          <button class="vm-btn vm-btn-sm" id="vm-sos-reset">Reset SOS</button>
          <button class="vm-btn vm-btn-sm vm-btn-success" id="vm-sos-dl-sos">Download SOS</button>
          <button class="vm-btn vm-btn-sm vm-btn-primary" id="vm-sos-dl-eos">Download EOS</button>
        </div>
      </div>
    `;
    document.body.appendChild(sosPanel);

    // --- Root Cause Panel ---
    const rcPanel = document.createElement('div'); rcPanel.id = 'vm-rc-pop'; rcPanel.className = 'vm-panel hidden';
    rcPanel.innerHTML = `
      <div class="vm-panel-head"><span class="vm-panel-title">Root Cause Tracker</span></div>
      <div class="vm-panel-body">
        <div class="vm-rc-form" id="vm-rc-form">
          <div class="vm-rc-form-row"><label>ASIN</label><input class="vm-input" id="vm-rc-asin" placeholder="Enter Asin or Fnsku"/></div>
          <div class="vm-rc-form-row"><label>Category</label><select class="vm-select" id="vm-rc-cat"><option value="">— Select —</option></select></div>
          <div class="vm-rc-form-row"><label>Reason</label><select class="vm-select" id="vm-rc-reason" disabled><option value="">— Select category first —</option></select></div>
          <div class="vm-rc-desc" id="vm-rc-desc"></div>
          <div style="display:flex;justify-content:flex-end"><button class="vm-btn vm-btn-primary" id="vm-rc-add" disabled>Add</button></div>
        </div>
        <div class="vm-rc-list-wrap" id="vm-rc-list"></div>
        <div class="vm-rc-actions">
          <button class="vm-btn vm-btn-sm" id="vm-rc-clear">Clear All</button>
          <button class="vm-btn vm-btn-sm vm-btn-primary" id="vm-rc-copy">📋 Copy Barriers</button>
        </div>
      </div>
    `;
    document.body.appendChild(rcPanel);

    // ---- Wire events ----
    document.getElementById('vm-fab-settings').addEventListener('click', () => { toggle('vm-settings-pop'); updateFabStates(); });
    document.getElementById('vm-fab-dz').addEventListener('click', () => { toggle('vm-dz-pop'); if (!document.getElementById('vm-dz-pop').classList.contains('hidden')) renderDzList(); updateFabStates(); });
    document.getElementById('vm-fab-sos').addEventListener('click', () => { toggle('vm-sos-pop'); if (!document.getElementById('vm-sos-pop').classList.contains('hidden')) renderSos(); updateFabStates(); });
    document.getElementById('vm-fab-rc').addEventListener('click', () => { toggle('vm-rc-pop'); if (!document.getElementById('vm-rc-pop').classList.contains('hidden')) renderRcList(); updateFabStates(); });

    // Settings bindings
    bindCk('vm-set-print', CK.printDz, false);
    bindNum('vm-set-qty', CK.printQty, 2);
    bindCk('vm-set-img', CK.showImg, true);
    bindNum('vm-set-imgw', CK.imgW, 150);
    bindCk('vm-set-title', CK.showTitle, true);
    bindCk('vm-set-dims', CK.showDims, true);
    bindCk('vm-set-weight', CK.showWeight, true);
    bindCk('vm-set-sortable', CK.showSortable, true);

    // DZ clear
    document.getElementById('vm-dz-clear').addEventListener('click', clearDz);

    document.getElementById('vm-sos-reset').addEventListener('click', () => {
      const f = getFloor(); if (!f) return; if (!confirm(`Reset SOS and adjustments for ${f}?`)) return;
      SOS_CATEGORIES.forEach(c => { setSos(f, c, 0); setAdj(f, c, 'moved', 0); setAdj(f, c, 'injected', 0); }); renderSos(); toast(`${f} SOS reset`, 's');
    });
    document.getElementById('vm-sos-dl-sos').addEventListener('click', () => dlReport('SOS'));
    document.getElementById('vm-sos-dl-eos').addEventListener('click', () => dlReport('EOS'));

    // Root Cause form
    initRcForm();
  }

  function bindCk(id, ck, def) {
    const el = document.getElementById(id);
    const v = getCookie(ck); el.checked = v === null ? def : v === '1';
    el.addEventListener('change', () => setCookie(ck, el.checked ? '1' : '0', 365));
  }
  function bindNum(id, ck, def) {
    const el = document.getElementById(id);
    let v = parseInt(getCookie(ck) || String(def), 10);
    if (!Number.isFinite(v) || v < 1) v = def; el.value = String(v);
    el.addEventListener('change', () => { let n = parseInt(el.value, 10); if (!Number.isFinite(n) || n < 1) n = def; el.value = String(n); setCookie(ck, String(n), 365); });
  }

  /* ============ SOS RENDER ============ */
  function renderSos() {
    const f = getFloor(); if (!f) return;
    document.getElementById('vm-sos-title').textContent = `${f} SOS`;
    document.getElementById('vm-eos-title').textContent = `${f} EOS`;
    const sb = document.getElementById('vm-sos-body');
    sb.innerHTML = SOS_CATEGORIES.map(c => {
      return `<tr><td>${c}</td><td><input class="vm-input vm-input-sm" type="number" min="0" value="${getSos(f,c)}" data-cat="${c}" style="width:56px;text-align:center"></td></tr>`;
    }).join('');
    sb.querySelectorAll('input').forEach(inp => inp.addEventListener('change', () => {
      let v = parseInt(inp.value, 10); if (!Number.isFinite(v) || v < 0) v = 0; inp.value = v;
      setSos(f, inp.dataset.cat, v); renderEos();
    }));
    renderAdj();
    renderEos();
  }
  function renderAdj() {
    const f = getFloor(); if (!f) return;
    const ab = document.getElementById('vm-adj-body'); if (!ab) return;
    ab.innerHTML = SOS_CATEGORIES.map(c => {
      return `<tr><td><input class="vm-input vm-input-sm" type="number" min="0" value="${getAdj(f,c,'moved')}" data-cat="${c}" data-type="moved" style="width:50px;text-align:center"></td><td><input class="vm-input vm-input-sm" type="number" min="0" value="${getAdj(f,c,'injected')}" data-cat="${c}" data-type="injected" style="width:50px;text-align:center"></td></tr>`;
    }).join('');
    ab.querySelectorAll('input').forEach(inp => inp.addEventListener('change', () => {
      let v = parseInt(inp.value, 10); if (!Number.isFinite(v) || v < 0) v = 0; inp.value = v;
      setAdj(f, inp.dataset.cat, inp.dataset.type, v); renderEos();
    }));
  }
  function renderEos() {
    const f = getFloor(); if (!f) return;
    document.getElementById('vm-eos-body').innerHTML = SOS_CATEGORIES.map(c => `<tr><td>${c}</td><td class="vm-eos-val">${getEos(f,c)}</td></tr>`).join('');
  }

  /* ============ DZ LIST RENDER ============ */
  function renderDzList() {
    const body = document.getElementById('vm-dz-body'); if (!body) return;
    const g = document.createElement('div'); g.className = 'vm-dz-grid';
    DROP_TYPES.forEach(t => {
      const col = document.createElement('div'); col.className = 'vm-dz-col';
      const keys = Object.keys(dzMoves).filter(k => dzMoves[k].dropType === t);
      let tot = 0; keys.forEach(k => tot += dzMoves[k]?.containers?.length || 0);
      col.innerHTML = `<div class="vm-dz-col-head">${dropLabel(t)} (${tot})</div>`;
      if (!tot) { col.innerHTML += '<div class="vm-dz-empty">None</div>'; }
      else keys.forEach(k => {
        const e = dzMoves[k]; if (!e?.containers?.length) return;
        const b = document.createElement('div');
        b.innerHTML = `<div class="vm-dz-floor-title">Floor ${e.floor}</div>`;
        const ul = document.createElement('ul'); ul.className = 'vm-dz-list';
        e.containers.forEach(c => { const li = document.createElement('li'); li.className = 'vm-dz-item'; li.innerHTML = `<span>${c}</span>`; const rm = document.createElement('button'); rm.className = 'vm-btn vm-btn-danger vm-btn-sm'; rm.textContent = '✕'; rm.addEventListener('click', () => removeDz(k, c)); li.appendChild(rm); ul.appendChild(li); });
        b.appendChild(ul); col.appendChild(b);
      });
      g.appendChild(col);
    });
    body.innerHTML = ''; body.appendChild(g);
  }

  /* ============ ROOT CAUSE FORM ============ */
  function initRcForm() {
    const catSel = document.getElementById('vm-rc-cat');
    const rSel = document.getElementById('vm-rc-reason');
    const addBtn = document.getElementById('vm-rc-add');
    const descEl = document.getElementById('vm-rc-desc');

    function updateDesc() {
      const cat = catSel.value, reason = rSel.value;
      if (!cat || !reason) { descEl.classList.remove('visible'); descEl.textContent = ''; return; }
      const match = (RC_TREE[cat] || []).find(s => s.code === reason);
      if (match) { descEl.textContent = match.desc; descEl.classList.add('visible'); }
      else { descEl.classList.remove('visible'); descEl.textContent = ''; }
    }

    function clearDesc() { descEl.classList.remove('visible'); descEl.textContent = ''; }

    Object.keys(RC_TREE).forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; catSel.appendChild(o); });

    catSel.addEventListener('change', () => {
      const c = catSel.value; rSel.innerHTML = '';
      if (!c) { rSel.disabled = true; rSel.innerHTML = '<option value="">— Select category first —</option>'; addBtn.disabled = true; clearDesc(); return; }
      rSel.disabled = false; rSel.innerHTML = '<option value="">— Select —</option>';
      (RC_TREE[c] || []).forEach(s => { const o = document.createElement('option'); o.value = s.code; o.textContent = s.code; rSel.appendChild(o); });
      addBtn.disabled = true; clearDesc();
    });
    rSel.addEventListener('change', () => { addBtn.disabled = !rSel.value; updateDesc(); });

    addBtn.addEventListener('click', () => {
      const asinInp = document.getElementById('vm-rc-asin');
      const asin = asinInp?.value?.trim();
      const cat = catSel.value, reason = rSel.value;
      if (!asin) { toast('Enter an ASIN', 'e'); asinInp?.focus(); return; }
      if (!cat || !reason) { toast('Select category & reason', 'e'); return; }
      const match = (RC_TREE[cat] || []).find(s => s.code === reason);
      const finish = (mv) => { addRc({ asin, category: cat, reason, modalValue: mv || '' }); renderRcList(); toast(`Added ${asin}`, 's'); asinInp.value = ''; catSel.value = ''; rSel.innerHTML = '<option value="">— Select category first —</option>'; rSel.disabled = true; addBtn.disabled = true; clearDesc(); asinInp.focus(); };
      if (match?.modal) showGen(match.modal.prompt, 'Optional — Skip to leave blank', finish);
      else finish('');
    });

    document.getElementById('vm-rc-clear').addEventListener('click', () => { if (!rcList.length) return; if (confirm('Clear all root causes?')) { clearRc(); renderRcList(); toast('Cleared', 's'); } });
    document.getElementById('vm-rc-copy').addEventListener('click', copyBarriers);

    renderRcList();
  }

  /* ============ ROOT CAUSE LIST RENDER ============ */
  function badgeCls(c) { return { Damage:'vm-rc-badge-damage', Prep:'vm-rc-badge-prep', Cubiscan:'vm-rc-badge-cubiscan', 'Non-sort':'vm-rc-badge-nonsort', ISS:'vm-rc-badge-iss', Hazmat:'vm-rc-badge-hazmat', General:'vm-rc-badge-general' }[c] || 'vm-rc-badge-general'; }
  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function renderRcList() {
    const wrap = document.getElementById('vm-rc-list'); if (!wrap) return;
    if (!rcList.length) { wrap.innerHTML = '<div class="vm-rc-empty">No root causes yet</div>'; return; }
    let html = '<table class="vm-rc-table"><thead><tr><th>#</th><th>ASIN</th><th>Category</th><th>Reason</th><th>Extra</th><th></th></tr></thead><tbody>';
    rcList.forEach((e, i) => {
      const extra = e.modalValue ? `<span class="vm-rc-modal-info">${esc(e.modalValue)}</span>` : '<span style="color:var(--vm-text-muted)">—</span>';
      html += `<tr><td style="color:var(--vm-text-muted)">${i+1}</td><td class="vm-rc-asin">${esc(e.asin)}</td><td><span class="vm-rc-badge ${badgeCls(e.category)}">${esc(e.category)}</span></td><td>${esc(e.reason)}</td><td>${extra}</td><td style="white-space:nowrap"><button class="vm-btn vm-btn-ghost vm-btn-sm vm-rc-edit" data-i="${i}">✏️</button><button class="vm-btn vm-btn-danger vm-btn-sm vm-rc-del" data-i="${i}">✕</button></td></tr>`;
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
    wrap.querySelectorAll('.vm-rc-edit').forEach(b => b.addEventListener('click', () => showEdit(+b.dataset.i)));
    wrap.querySelectorAll('.vm-rc-del').forEach(b => b.addEventListener('click', () => { removeRc(+b.dataset.i); renderRcList(); toast('Removed', 's'); }));
  }

  /* ============ COPY BARRIERS AS TEXT ============ */
  function copyBarriers() {
    if (!rcList.length) { toast('No root causes to copy', 'e'); return; }

    // Step 1: Group by category → then by reason within each category
    const byCat = {};
    rcList.forEach(e => {
      if (!byCat[e.category]) byCat[e.category] = {};
      if (!byCat[e.category][e.reason]) {
        const match = (RC_TREE[e.category] || []).find(s => s.code === e.reason);
        byCat[e.category][e.reason] = { desc: match?.desc || '', asins: [] };
      }
      byCat[e.category][e.reason].asins.push({ asin: e.asin, modal: e.modalValue || '' });
    });

    // Step 2: Build text grouped by category
    const lines = ['Main Barriers'];

    Object.keys(byCat).forEach(cat => {
      const reasons = byCat[cat];
      const reasonKeys = Object.keys(reasons);

      lines.push('');
      // Only show category header if there are multiple reasons or for clarity
      lines.push(`${cat}:`);

      reasonKeys.forEach(reason => {
        const g = reasons[reason];
        lines.push(`[${reason}] - ${g.desc}`);
        const asinParts = g.asins.map(a => a.modal ? `${a.asin} → ${a.modal}` : a.asin);
        lines.push(asinParts.join(', '));
      });
    });

    const text = lines.join('\n');

    navigator.clipboard.writeText(text).then(() => {
      toast('Barriers copied to clipboard', 's');
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;top:-9999px';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('Barriers copied to clipboard', 's'); } catch { toast('Copy failed — select and copy manually', 'e'); }
      document.body.removeChild(ta);
    });
  }

  /* ============ DOWNLOAD REPORT PNG ============ */
  function dlReport(type) {
    const f = getFloor() || 'P2';
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const w = 260, rh = 28, hh = 38, th = 36, pad = 16;
    canvas.width = w; canvas.height = th + hh + SOS_CATEGORIES.length * rh + pad * 2;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, canvas.height);
    ctx.fillStyle = '#212529'; ctx.font = 'bold 15px -apple-system, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`${f} ${type} Report`, w / 2, pad + 18);
    const tt = th + pad;
    ctx.fillStyle = '#f8f9fa'; ctx.fillRect(pad, tt, w - pad * 2, hh);
    ctx.fillStyle = '#6c757d'; ctx.font = 'bold 11px -apple-system, sans-serif';
    ctx.textAlign = 'left'; ctx.fillText('CATEGORY', pad + 8, tt + 24);
    ctx.textAlign = 'center'; ctx.fillText('COUNT', pad + 175, tt + 24);
    ctx.font = '12px -apple-system, sans-serif';
    SOS_CATEGORIES.forEach((c, i) => {
      const v = type === 'SOS' ? getSos(f, c) : getEos(f, c);
      const rt = tt + hh + i * rh;
      if (i % 2) { ctx.fillStyle = '#f8f9fa'; ctx.fillRect(pad, rt, w - pad * 2, rh); }
      ctx.strokeStyle = '#e9ecef'; ctx.beginPath(); ctx.moveTo(pad, rt + rh); ctx.lineTo(w - pad, rt + rh); ctx.stroke();
      ctx.fillStyle = '#212529'; ctx.textAlign = 'left'; ctx.fillText(c, pad + 8, rt + 18);
      ctx.fillStyle = '#1971c2'; ctx.font = 'bold 12px -apple-system, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(v), pad + 175, rt + 18);
      ctx.font = '12px -apple-system, sans-serif';
    });
    ctx.strokeStyle = '#dee2e6'; ctx.strokeRect(pad, tt, w - pad * 2, hh + SOS_CATEGORIES.length * rh);
    const a = document.createElement('a'); a.download = `${f}_${type}_${new Date().toISOString().slice(0,10)}.png`; a.href = canvas.toDataURL('image/png'); a.click();
    toast(`${f} ${type} report saved as PNG`, 's');
  }

  /* ============ HOVER PREVIEW ============ */
  let hPos = { x: 0, y: 0 }, hKey = null;
  const pCache = new Map();

  function posHover() { const c = document.getElementById('vm-hover'); if (c) { c.style.left = (hPos.x + 18) + 'px'; c.style.top = (hPos.y + 18) + 'px'; } }

  function escHtml(v) {
    return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  function isSuspiciousSquareDims(dimText) {
    const raw = String(dimText || '').match(/\d+(?:\.\d+)?/g);
    if (!raw || raw.length < 3) return false;

    const first3 = raw.slice(0, 3);
    const vals = first3.map(Number);
    if (vals.some(v => !Number.isFinite(v))) return false;

    const eq = (a, b) => Math.abs(a - b) < 0.001;
    const rounded00Count = first3.filter(v => /\.00$/.test(v)).length;
    const repeatedPair = eq(vals[0], vals[1]) || eq(vals[0], vals[2]) || eq(vals[1], vals[2]);
    const veryThinOrTiny = Math.min(...vals) <= 2.001;

    // Suspicious means "template-looking / over-rounded", not only a perfect cube.
    // Repeated dimensions are treated as sus, even when not .00.
    // Examples caught: 0.25x0.25x0.25, 1.00x15.00x10.00, 1.00x16.00x13.00,
    // 1.00x2.00x1.00, 1.00x2.00x2.00, 1.60x10.00x10.00, 8.00x18.00x16.00.
    if (repeatedPair) return true;
    if (rounded00Count >= 3) return true;
    if (veryThinOrTiny && rounded00Count >= 2) return true;

    return false;
  }

  function parseMadcatFromHtml(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    return parseMadcatFromDocument(doc);
  }

  function parseMadcatFromDocument(doc) {
    const selectors = [
      '[data-section-type="inventory-history"]',
      '[data-test-id*="inventory-history"]',
      '[id*="inventory-history"]'
    ];
    for (const sel of selectors) {
      const node = doc.querySelector(sel);
      if (node) return /madcat/i.test(node.textContent || '');
    }
    const text = doc.body?.textContent || '';
    const idx = text.toLowerCase().indexOf('inventory history');
    if (idx >= 0) return /madcat/i.test(text.slice(idx, idx + 25000));
    return /madcat/i.test(text);
  }

  function getCurrentProductValues() {
    const out = [];
    const tbl = document.querySelector('[data-section-type="product"] .a-keyvalue') || document.querySelector('[data-section-type="product"] table') || document.querySelector('.a-keyvalue');
    if (!tbl) return out;
    tbl.querySelectorAll('tr').forEach(tr => {
      const th = (tr.querySelector('th')?.textContent || '').trim().toLowerCase();
      const td = (tr.querySelector('td')?.textContent || '').trim();
      if ((th === 'asin' || th === 'fnsku' || th === 'fnsku:') && td) out.push(td.replace(/\s+/g, '').toUpperCase());
    });
    return out;
  }

  function liveMadcatForCode(code) {
    const key = String(code || '').replace(/\s+/g, '').toUpperCase();
    if (!key) return null;

    const currentVals = getCurrentProductValues();
    const sameVisibleProduct = currentVals.includes(key);

    if (sameVisibleProduct) {
      const badge = document.querySelector('.fc-madcat-badge');
      const badgeText = (badge?.textContent || '').trim();
      if (/madcat\s*:\s*yes/i.test(badgeText)) return true;
      if (/madcat\s*:\s*no/i.test(badgeText)) return false;

      const live = parseMadcatFromDocument(document);
      if (typeof live === 'boolean') return live;
    }

    return null;
  }

  function showHover(info) {
    const si = showImg(), st = showTitle(), sd = showDims(), sw = showWeight(), ss = showSortable();
    if (!si && !st && !sd && !sw && !ss) { hideHover(); return; }
    const c = document.getElementById('vm-hover'), img = document.getElementById('vm-hover-img'), ti = document.getElementById('vm-hover-title'), de = document.getElementById('vm-hover-details');
    if (!c) return;
    if (si && info.imgSrc) { img.style.display = 'block'; img.style.width = Math.min(imgWidth(), 180) + 'px'; img.src = info.imgSrc; } else img.style.display = 'none';
    if (st && info.title) { ti.style.display = '-webkit-box'; ti.textContent = info.title; } else ti.style.display = 'none';
    const hasSortable = ss && typeof info.sortable === 'boolean';
    const hasDets = (sd && info.dimensions) || (sw && info.weight) || hasSortable;
    if (hasDets) {
      de.style.display = 'block';
      let h = '';
      if (sd && info.dimensions) {
        const dimCls = info.suspiciousSquareDims ? ' vm-dims-suspicious' : '';
        h += `<div class="vm-detail-row"><span class="vm-detail-lbl">Dimensions</span><span class="vm-detail-val${dimCls}">${escHtml(info.dimensions)}</span></div>`;
      }
      if (sw && info.weight) h += `<div class="vm-detail-row"><span class="vm-detail-lbl">Weight</span><span class="vm-detail-val">${escHtml(info.weight)}</span></div>`;
      if (hasSortable) {
        const cls = info.sortable ? 'vm-sortable-true' : 'vm-sortable-false';
        const txt = info.sortable ? 'TRUE' : 'FALSE';
        h += `<div class="vm-detail-row"><span class="vm-detail-lbl">Sortable</span><span class="vm-sortable-pill ${cls}">${txt}</span></div>`;
      }
      de.innerHTML = h;
    } else de.style.display = 'none';
    if (img.style.display === 'none' && ti.style.display === 'none' && !hasDets) { hideHover(); return; }
    c.style.display = 'block'; posHover();
  }
  function hideHover() { const c = document.getElementById('vm-hover'); if (c) c.style.display = 'none'; }

  function blankProductInfo() {
    return { imgSrc:null, title:null, dimensions:null, weight:null, sortable:null, suspiciousSquareDims:false };
  }

  function parseBoolish(text) {
    const v = String(text || '').trim().toLowerCase();
    if (/^(true|yes|y|1)$/.test(v)) return true;
    if (/^(false|no|n|0)$/.test(v)) return false;
    return null;
  }

  function fetchProduct(fnsku) {
    if (pCache.has(fnsku)) return Promise.resolve(pCache.get(fnsku));
    return new Promise(res => {
      GM_xmlhttpRequest({
        method: 'POST', url: PRODUCT_ENDPOINT, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, data: 's=' + encodeURIComponent(fnsku), timeout: 15000,
        onload: r => {
          try {
            if (r.status !== 200) { const i = blankProductInfo(); pCache.set(fnsku, i); return res(i); }
            const doc = new DOMParser().parseFromString(r.responseText, 'text/html');
            const imgEl = doc.querySelector('.a-box-group .a-box .a-column.a-span4 img') || doc.querySelector('.a-box-group img') || doc.querySelector('img');
            let title = '', dims = '', wt = '', sortable = null;
            const tbl = doc.querySelector('.a-box-group .a-keyvalue') || doc.querySelector('.a-keyvalue');
            if (tbl) tbl.querySelectorAll('tr').forEach(tr => {
              const th = tr.querySelector('th')?.textContent.trim().toLowerCase() || '';
              const td = tr.querySelector('td');
              const val = (td?.textContent || '').trim();
              if (th === 'title') title = (td?.querySelector('a')?.textContent || val || '').trim();
              else if (/dimensions/.test(th)) dims = val;
              else if (/weight/.test(th)) wt = val;
              else if (/sortable/.test(th)) sortable = parseBoolish(val);
            });
            if (sortable === null) {
              const m = String(r.responseText || '').match(/sortable\s*[:=]\s*["']?(true|false|yes|no|1|0)\b/i);
              if (m) sortable = parseBoolish(m[1]);
            }
            const i = { imgSrc: imgEl?.getAttribute('src') || null, title: title || null, dimensions: dims || null, weight: wt || null, sortable, suspiciousSquareDims: isSuspiciousSquareDims(dims) };
            pCache.set(fnsku, i); res(i);
          } catch { const i = blankProductInfo(); pCache.set(fnsku, i); res(i); }
        },
        onerror: () => { const i = blankProductInfo(); pCache.set(fnsku, i); res(i); }
      });
    });
  }

  function onEnter(e) { if (!showImg() && !showTitle() && !showDims() && !showWeight() && !showSortable()) return; const code = (e.currentTarget.dataset.vmCode || e.currentTarget.textContent || '').trim(); if (!code) return; hKey = code; fetchProduct(code).then(i => { if (hKey === code) showHover(i); }); }
  function onLeave() { hKey = null; hideHover(); }
  function onMove(e) { hPos.x = e.pageX; hPos.y = e.pageY; if (document.getElementById('vm-hover')?.style.display !== 'none') posHover(); }

  function getInvColIndexes(tbl) {
    const idx = { asin: -1, fnsku: -1, qty: -1 };
    tbl.querySelectorAll('thead tr th').forEach((th, i) => {
      const id = String(th.id || '').toLowerCase();
      const txt = String(th.textContent || '').replace(/\(.*?\)/g, '').trim().toLowerCase();
      if (id === 'inventory-asin' || txt === 'asin') idx.asin = i;
      if (id === 'inventory-fnsku' || id === 'inventory-fnsku' || txt === 'fnsku') idx.fnsku = i;
      if (id === 'inventory-quantity' || /^quantity\b/.test(txt)) idx.qty = i;
    });
    return idx;
  }

  function attachHoverToLink(a, code) {
    if (!a || a.dataset.vmH === '1') return;
    a.dataset.vmH = '1';
    if (code) a.dataset.vmCode = code;
    a.addEventListener('mouseenter', onEnter);
    a.addEventListener('mouseleave', onLeave);
    a.addEventListener('mousemove', onMove);
  }

  function attachHovers() {
    if (!isTsCs()) return;
    const tbl = document.querySelector('#table-inventory'); if (!tbl) return;
    const idx = getInvColIndexes(tbl);
    if (idx.fnsku === -1) return;
    tbl.querySelectorAll('tbody tr').forEach(tr => {
      const c = tr.children; if (!c || c.length <= idx.fnsku) return;
      const fn = c[idx.fnsku]?.querySelector('a[href*="/BWU2/results?s="]');
      const code = (fn?.textContent || '').trim();
      // Suspicious dimension/photo hover is FNSKU-only.
      // ASIN links are left untouched to avoid double-looking/count confusion.
      attachHoverToLink(fn, code);
    });
  }

  function ensureSuspiciousDimsSummary() {
    let el = document.getElementById('vm-suspicious-dims-summary');
    const wrap = document.querySelector('.vm-drop-inline');
    const afterDropButtons = document.getElementById('vm-drop-buttons-wrap');

    if (el) {
      // Keep the counter in the top Inventory selector row, directly beside the Drop buttons.
      if (wrap && !wrap.contains(el)) (afterDropButtons || wrap).insertAdjacentElement('afterend', el);
      return el;
    }

    if (!wrap) return null;
    el = document.createElement('span');
    el.id = 'vm-suspicious-dims-summary';
    el.className = 'vm-suspicious-dims-summary vm-loading';
    el.textContent = 'Sussy: checking…';
    (afterDropButtons || wrap).insertAdjacentElement('afterend', el);
    return el;
  }

  function parseQtyFromCell(cell) {
    const n = Number(String(cell?.textContent || '').replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  let suspiciousScanSeq = 0;
  let suspiciousScanTimer = null;
  function queueSuspiciousDimsSummaryScan() {
    if (suspiciousScanTimer) clearTimeout(suspiciousScanTimer);
    suspiciousScanTimer = setTimeout(() => { suspiciousScanTimer = null; scanSuspiciousDimsSummary(); }, 350);
  }

  function scanSuspiciousDimsSummary() {
    if (!isTsCs()) return;
    const tbl = document.querySelector('#table-inventory'); if (!tbl) return;
    const idx = getInvColIndexes(tbl);
    if (idx.fnsku === -1) return;
    const rows = Array.from(tbl.querySelectorAll('tbody tr')).filter(tr => tr.children?.length > idx.fnsku);
    if (!rows.length) return;

    const seq = ++suspiciousScanSeq;
    const badge = ensureSuspiciousDimsSummary();
    if (badge) { badge.className = 'vm-suspicious-dims-summary vm-loading'; badge.textContent = 'Sussy: checking…'; }

    let totalUnits = 0, suspiciousUnits = 0, suspiciousFnskus = 0, checkedFnskus = 0;
    const totalFnskus = rows.length;
    rows.forEach(tr => {
      tr.classList.remove('vm-suspicious-dims-row');
      tr.querySelectorAll('.vm-suspicious-dims-cell').forEach(td => td.classList.remove('vm-suspicious-dims-cell'));
      totalUnits += idx.qty >= 0 ? parseQtyFromCell(tr.children[idx.qty]) : 1;
    });

    Promise.all(rows.map(tr => {
      const c = tr.children;
      const fnLink = c[idx.fnsku]?.querySelector('a[href*="/BWU2/results?s="]');
      const code = (fnLink?.textContent || c[idx.fnsku]?.textContent || '').trim();
      const qty = idx.qty >= 0 ? parseQtyFromCell(c[idx.qty]) : 1;
      if (!code) return Promise.resolve();
      return fetchProduct(code).then(info => {
        if (seq !== suspiciousScanSeq) return;
        checkedFnskus++;
        if (info?.suspiciousSquareDims) {
          suspiciousFnskus++;
          suspiciousUnits += qty || 1;
          tr.classList.add('vm-suspicious-dims-row');
          c[idx.fnsku]?.classList.add('vm-suspicious-dims-cell');
        }
      }).catch(() => {});
    })).then(() => {
      if (seq !== suspiciousScanSeq) return;
      const pct = totalFnskus ? Math.round((suspiciousFnskus / totalFnskus) * 100) : 0;
      const unitPct = totalUnits ? Math.round((suspiciousUnits / totalUnits) * 100) : 0;
      const b = ensureSuspiciousDimsSummary();
      if (!b) return;
      b.className = 'vm-suspicious-dims-summary' + (suspiciousFnskus ? '' : ' vm-clear');
      b.textContent = `Sussy: ${suspiciousFnskus}/${totalFnskus} (${pct}%)`;
      b.title = `${suspiciousUnits}/${totalUnits} units (${unitPct}%) from FNSKU-only checks`;
    });
  }

  /* ============ INLINE DROP BUTTONS ============ */
  function renderDropButtonsHtml() {
    const types = getActiveDropTypes();
    const buttons = types.map(t => `<button class="vm-tag-btn" data-drop="${t.key}" title="${t.dest || t.pattern || ''}">${t.label}</button>`).join('');
    return `<span class="vm-drop-inline-label">Drop:</span>${buttons}<button class="vm-tag-btn" data-drop="Prime" title="dz-P-PRIME">Prime</button>`;
  }

  function wireInlineDropButtons(wrap) {
    wrap.querySelectorAll('.vm-tag-btn').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const t = b.dataset.drop;
      b.blur();
      moveContainer(t);
      refocusTopSearchInput(80);
      refocusTopSearchInput(400);
    }));
  }

  function refreshInlineDropButtons() {
    const wrap = document.querySelector('.vm-drop-inline');
    const box = document.getElementById('vm-drop-buttons-wrap');
    if (!wrap || !box) return;
    box.innerHTML = renderDropButtonsHtml();
    wireInlineDropButtons(box);
  }

  function injectInline() {
    if (!isTsCs() || document.querySelector('.vm-drop-inline')) return;
    const cols = document.querySelectorAll('.a-box-inner .a-row .a-column.a-span8');
    let invSpan = null, parent = null;
    cols.forEach(col => { if (invSpan) return; col.querySelectorAll('span').forEach(sp => { if (invSpan) return; if (sp.textContent.trim() === 'Inventory') { invSpan = sp; parent = col; } }); });
    if (!invSpan || !parent) return;
    const target = parent.querySelector('span.help') || invSpan;
    const floor = getFloor() || 'P2';
    if (!getCookie(CK.floor)) setCookie(CK.floor, floor, 365);
    const wrap = document.createElement('span'); wrap.className = 'vm-drop-inline';
    wrap.innerHTML = `<span class="vm-drop-inline-label">Floor:</span>${FLOORS.map(f => `<button class="vm-floor-btn ${f===floor?'active':''}" data-floor="${f}">${f}</button>`).join('')}<span class="vm-drop-divider">|</span><span id="vm-drop-buttons-wrap">${renderDropButtonsHtml()}</span>`;
    target.insertAdjacentElement('afterend', wrap);
    ensureSuspiciousDimsSummary();
    wrap.querySelectorAll('.vm-floor-btn').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setFloor(b.dataset.floor);
      b.blur();
      refocusTopSearchInput(80);
    }));
    wireInlineDropButtons(wrap);
  }

  /* ============ INIT + SPA ============ */
  function onNav() { createUI(); injectInline(); attachHovers(); queueSuspiciousDimsSummaryScan(); }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', onNav) : onNav();

  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) { lastUrl = location.href; onNav(); return; }
    injectInline();
    attachHovers();
    if (isTsCs() && document.querySelector('#table-inventory tbody tr')) queueSuspiciousDimsSummaryScan();
  }).observe(document.body, { childList: true, subtree: true });
})();