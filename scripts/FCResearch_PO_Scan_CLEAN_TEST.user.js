// ==UserScript==
// @name         v0.1.0 FCResearch PO + Scan Flow CLEAN TEST
// @namespace    https://github.com/1Sirkkris
// @version      0.1.0
// @description  CLEAN TEST merging PO Cell Highlighter and FCResearch Scan Flow with one shared page observer.
// @include      /^https?:\/\/.*fcresearch.*\//
// @include      /^https?:\/\/qifcr\.fe\.aftx\.amazonoperations\.app\//
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/FCResearch_PO_Scan_CLEAN_TEST.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/FCResearch_PO_Scan_CLEAN_TEST.user.js
// ==/UserScript==

(() => {
  'use strict';
  if (window.__fcrPoScanCleanTest_v010) return;
  window.__fcrPoScanCleanTest_v010 = true;

  const VERSION = '0.1.0';
  const STATE_KEY = 'fcrScanFlowModeV1';
  const MIN_KEY = 'fcrScanFlowMinimizedV1';
  const ITEM = 'ITEM';
  const CONTAINER = 'CONTAINER';

  const norm = value => String(value || '').normalize('NFKD').replace(/\s+/g, ' ').trim();
  const lower = value => norm(value).toLowerCase().replace(/\(.*?\)/g, '').trim();
  const debounce = (fn, ms) => { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); }; };

  const css = `
    td.poch__unfilled{background:rgba(255,193,7,.28)!important;box-shadow:inset 0 0 0 2px rgba(255,180,0,.50);font-weight:600}
    td.poch__cancelled{background:rgba(220,53,69,.24)!important;box-shadow:inset 0 0 0 2px rgba(220,53,69,.45);font-weight:600}
    td.poch__band{background:rgba(255,0,0,.14)!important;box-shadow:inset 0 0 0 1px rgba(255,0,0,.22);color:#5a0000}
    td.poch__dateold{background:rgba(255,0,0,.22)!important;box-shadow:inset 0 0 0 1px rgba(255,0,0,.38)!important;font-weight:700;color:#6a0000}
    #fcrScanFlowOverlay{position:fixed;top:8px;left:210px;width:408px;height:38px;box-sizing:border-box;z-index:1000000;padding:3px;background:#111827;border:1px solid #0f172a;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.28);font-family:Arial,Helvetica,sans-serif;color:#111827}
    #fcrScanFlowMain{display:flex;align-items:center;gap:4px;width:100%;height:100%}
    #fcrScanFlowOverlay.minimized{width:62px;height:34px;padding:2px}
    #fcrScanFlowOverlay.minimized #fcrScanFlowMain{display:none}
    #fcrScanFlowOpen{display:none;width:100%;height:100%;border:0;border-radius:6px;font-size:10px;font-weight:900;cursor:pointer}
    #fcrScanFlowOverlay.minimized #fcrScanFlowOpen{display:block}
    #fcrScanFlowMode{flex:0 0 84px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:6px;padding:0 7px;font-size:12px;font-weight:900;cursor:pointer;user-select:none}
    #fcrScanFlowMode.item,#fcrScanFlowOpen.item{background:#f59e0b;color:#111827}
    #fcrScanFlowMode.container,#fcrScanFlowOpen.container{background:#16a34a;color:#fff}
    #fcrScanFlowInput{flex:1 1 auto;min-width:0;height:30px;box-sizing:border-box;border:1px solid #64748b;border-radius:6px;padding:4px 8px;background:#fff;color:#111827;font-size:13px;font-weight:800;outline:none}
    #fcrScanFlowInput:focus{border-color:#2563eb;box-shadow:0 0 0 2px rgba(37,99,235,.25)}
    #fcrScanFlowReset,#fcrScanFlowMin{height:30px;border:1px solid #64748b;border-radius:6px;background:#f3f4f6;color:#111827;font-size:10px;font-weight:900;cursor:pointer;padding:0 7px}
    #fcrScanFlowMin{width:28px;padding:0;font-size:17px}
    #fcrScanFlowStatus{position:absolute;top:calc(100% + 5px);left:0;max-width:330px;padding:5px 8px;border-radius:6px;box-shadow:0 3px 10px rgba(0,0,0,.24);background:#fff;font-size:11px;font-weight:800;white-space:nowrap;pointer-events:none}
    #fcrScanFlowStatus.hidden{display:none}.working{color:#92400e;border:1px solid #f59e0b}.success{color:#166534;border:1px solid #22c55e}.error{color:#991b1b;border:1px solid #ef4444}
    #fcrScanFlowPageFlash{position:fixed;inset:0;z-index:999999;pointer-events:none;opacity:0;background:rgba(34,197,94,.20);box-shadow:inset 0 0 0 10px rgba(22,163,74,.92),inset 0 0 70px rgba(34,197,94,.38)}
    #fcrScanFlowPageFlash.active{animation:fcrPagePositive 1200ms linear}
    #table-inventory tr.fcr-scan-flow-hit,#table-inventory tr.fcr-scan-flow-hit>td{background-color:#d1fae5!important}
    #table-inventory tr.fcr-scan-flow-hit{box-shadow:inset 5px 0 0 #16a34a}
    @keyframes fcrPagePositive{0%{opacity:0}7%{opacity:1}19%{opacity:0}34%{opacity:1}46%{opacity:0}61%{opacity:1}75%,100%{opacity:0}}
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  function intFrom(cell) {
    const raw = cell?.querySelector?.("input,[contenteditable='true']")?.value ?? cell?.textContent ?? '';
    const match = String(raw).replace(/[, ]+/g, '').match(/-?\d+/);
    return match ? parseInt(match[0], 10) : 0;
  }

  function dateFromCell(cell) {
    const match = norm(cell?.textContent).match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/);
    if (!match) return null;
    return new Date(+match[1], +match[2] - 1, +match[3], +(match[4] || 0), +(match[5] || 0), +(match[6] || 0));
  }

  function paintPurchaseOrders() {
    const body = document.querySelector('table#table-purchase-order-item');
    if (!body) return;
    const wrap = body.closest('.dataTables_scroll');
    const head = wrap?.querySelector('.dataTables_scrollHead table') || body;
    const headers = [...head.querySelectorAll('thead th,thead td')].map(cell => lower(cell.textContent));
    const idxU = headers.findIndex(value => value.includes('unfilled'));
    const idxC = headers.findIndex(value => /canceled|cancelled/.test(value));
    const idxD = headers.findIndex(value => value.includes('order date') || value === 'date');
    const six = new Date(); six.setMonth(six.getMonth() - 6);
    const seven = new Date(); seven.setMonth(seven.getMonth() - 7);
    for (const row of [...(body.tBodies[0] || body).rows]) {
      const cells = [...row.cells];
      cells.forEach(cell => cell.classList.remove('poch__unfilled','poch__cancelled','poch__band','poch__dateold'));
      const dateCell = idxD >= 0 ? cells[idxD] : null;
      const date = dateFromCell(dateCell);
      if (date && date < six) for (let offset = 0; offset <= 2; offset++) cells[idxD - offset]?.classList.add('poch__band');
      if (dateCell && date && date < seven) dateCell.classList.add('poch__dateold');
      if (idxU >= 0 && intFrom(cells[idxU]) > 0) cells[idxU]?.classList.add('poch__unfilled');
      if (idxC >= 0 && intFrom(cells[idxC]) > 0) cells[idxC]?.classList.add('poch__cancelled');
    }
  }

  let overlay, input, modeLabel, statusLabel, openButton, mode = sessionStorage.getItem(STATE_KEY) === CONTAINER ? CONTAINER : ITEM;
  let busy = false, statusTimer;

  function findInventoryTable() {
    return document.querySelector('#table-inventory') || document.querySelector('[data-section-type="inventory"] table');
  }
  function inventorySection() {
    const table = findInventoryTable();
    return table?.closest('[data-section-type="inventory"],.a-box,section') || table?.parentElement || document.getElementById('inventory-nav')?.parentElement;
  }
  function findInventorySearch() {
    for (const selector of ['#table-inventory_filter input','#table-inventory_wrapper input[type="search"]','input[aria-controls="table-inventory"]']) {
      const found = document.querySelector(selector);
      if (found && !found.disabled) return found;
    }
    return [...(inventorySection()?.querySelectorAll('input') || [])].find(el => el.id !== 'search' && !el.disabled && ['text','search'].includes((el.type || 'text').toLowerCase())) || null;
  }
  function waitForInventorySearch(timeout = 30000) {
    return new Promise(resolve => {
      const immediate = findInventorySearch();
      if (immediate) return resolve(immediate);
      const started = Date.now();
      const observer = new MutationObserver(() => {
        const found = findInventorySearch();
        if (found) { observer.disconnect(); resolve(found); }
        else if (Date.now() - started >= timeout) { observer.disconnect(); resolve(null); }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => { observer.disconnect(); resolve(findInventorySearch()); }, timeout);
    });
  }
  function setNativeValue(el, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter ? setter.call(el, value) : (el.value = value);
    for (const type of ['input','change','search']) el.dispatchEvent(new Event(type, { bubbles: true }));
    try {
      const jq = window.jQuery, table = findInventoryTable();
      if (jq && table && jq.fn?.dataTable?.isDataTable(table)) jq(table).DataTable().search(value).draw();
    } catch {}
  }
  function matchingRows(container) {
    const wanted = norm(container).toUpperCase();
    return [...(findInventoryTable()?.querySelectorAll('tbody tr') || [])].filter(row => row.getClientRects().length && norm(row.cells?.[0]?.textContent).toUpperCase() === wanted);
  }
  function waitForRows(container, timeout = 1600) {
    return new Promise(resolve => {
      const start = Date.now();
      const tick = () => {
        const rows = matchingRows(container);
        if (rows.length || Date.now() - start >= timeout) resolve(rows);
        else setTimeout(tick, 80);
      };
      tick();
    });
  }
  function setStatus(text, type = 'working') {
    clearTimeout(statusTimer);
    statusLabel.textContent = text || '';
    statusLabel.className = text && type !== 'ready' ? type : 'hidden';
    if (type === 'success' || type === 'error') statusTimer = setTimeout(() => statusLabel.classList.add('hidden'), type === 'error' ? 3000 : 1800);
  }
  function positionOverlay() {
    const search = document.querySelector('#search');
    if (!search || !overlay) return;
    const rect = search.getBoundingClientRect();
    const width = overlay.classList.contains('minimized') ? 62 : (overlay.offsetWidth || 408);
    let left = rect.left - width - 8, top = rect.top + Math.round((rect.height - (overlay.offsetHeight || 38)) / 2);
    if (left < 8) { left = 8; top = Math.max(8, rect.bottom + 6); }
    overlay.style.left = `${Math.round(left)}px`; overlay.style.top = `${Math.max(4, Math.round(top))}px`;
  }
  function focusSoon() { setTimeout(() => { if (!overlay.classList.contains('minimized')) { input.focus(); input.select(); } }, 60); }
  function setMode(next, save = true) {
    mode = next;
    if (save) sessionStorage.setItem(STATE_KEY, mode);
    modeLabel.className = mode === ITEM ? 'item' : 'container';
    openButton.className = mode === ITEM ? 'item' : 'container';
    modeLabel.textContent = mode;
    openButton.textContent = mode === ITEM ? 'SF ITEM' : 'SF CONT';
    input.placeholder = mode === ITEM ? 'Scan ASIN / FNSKU' : 'Scan container';
    positionOverlay();
  }
  function setMinimized(value, save = true) {
    overlay.classList.toggle('minimized', value);
    if (save) GM_setValue(MIN_KEY, value);
    if (value && document.activeElement === input) input.blur();
    positionOverlay();
  }
  function flash(rows) {
    const flash = document.getElementById('fcrScanFlowPageFlash');
    flash.classList.remove('active'); void flash.offsetWidth; flash.classList.add('active');
    rows.forEach(row => row.classList.add('fcr-scan-flow-hit'));
    setTimeout(() => { flash.classList.remove('active'); rows.forEach(row => row.classList.remove('fcr-scan-flow-hit')); }, 1300);
  }
  async function handleScan(value) {
    if (busy || !value) return;
    if (mode === ITEM) {
      busy = true;
      sessionStorage.setItem(STATE_KEY, CONTAINER);
      const url = new URL(location.href); url.searchParams.set('s', value); url.hash = '';
      location.assign(url.toString());
      return;
    }
    busy = true; input.value = ''; setStatus('Filtering Inventory...', 'working');
    const search = findInventorySearch() || await waitForInventorySearch(6000);
    if (!search) { busy = false; setStatus('Inventory search not found. Container not applied.', 'error'); focusSoon(); return; }
    setNativeValue(search, value);
    const rows = await waitForRows(value);
    busy = false; setMode(ITEM, true);
    if (!rows.length) setStatus('No matching container. Scan next item', 'error');
    else { flash(rows); setStatus('✓ Container found. Scan next item', 'success'); }
    focusSoon();
  }
  async function prepareContainer() {
    busy = true; setMode(CONTAINER, false); setStatus('Loading Inventory...', 'working');
    const ready = await waitForInventorySearch();
    busy = false;
    if (!ready) setStatus('Inventory search not found. Reset to item and retry.', 'error');
    else setStatus('Scan container', 'ready');
    focusSoon();
  }
  function buildScanFlow() {
    if (!/\/results\/?$/i.test(location.pathname) || document.getElementById('fcrScanFlowOverlay')) return;
    overlay = document.createElement('div'); overlay.id = 'fcrScanFlowOverlay'; overlay.title = `FCResearch Scan Flow v${VERSION}`;
    overlay.innerHTML = `<div id="fcrScanFlowMain"><div id="fcrScanFlowMode"></div><input id="fcrScanFlowInput" autocomplete="off" autocapitalize="off" spellcheck="false"><button id="fcrScanFlowReset">Reset</button><button id="fcrScanFlowMin">−</button></div><button id="fcrScanFlowOpen"></button><div id="fcrScanFlowStatus" class="hidden"></div>`;
    document.body.appendChild(overlay);
    const pageFlash = document.createElement('div'); pageFlash.id = 'fcrScanFlowPageFlash'; document.body.appendChild(pageFlash);
    input = document.getElementById('fcrScanFlowInput'); modeLabel = document.getElementById('fcrScanFlowMode'); statusLabel = document.getElementById('fcrScanFlowStatus'); openButton = document.getElementById('fcrScanFlowOpen');
    input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); const value = norm(input.value).replace(/\r?\n/g, ''); if (value) handleScan(value); } }, true);
    document.getElementById('fcrScanFlowReset').onclick = () => { busy = false; input.value = ''; setMode(ITEM, true); setStatus('Reset to item', 'success'); focusSoon(); };
    document.getElementById('fcrScanFlowMin').onclick = () => setMinimized(true);
    openButton.onclick = () => { setMinimized(false); focusSoon(); };
    modeLabel.onclick = focusSoon;
    setMinimized(GM_getValue(MIN_KEY, false) === true, false);
    setMode(mode, false);
    window.addEventListener('resize', positionOverlay, true);
    setTimeout(positionOverlay, 0); setTimeout(positionOverlay, 250); setTimeout(positionOverlay, 1000);
    if (mode === CONTAINER) prepareContainer(); else { setStatus('Scan item', 'ready'); focusSoon(); }
  }

  const refresh = debounce(() => { paintPurchaseOrders(); buildScanFlow(); positionOverlay(); }, 80);
  const observer = new MutationObserver(refresh);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
  refresh();
  console.log(`FCResearch PO + Scan Flow CLEAN TEST v${VERSION} loaded`);
})();
