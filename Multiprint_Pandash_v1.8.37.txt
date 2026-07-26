// ==UserScript==
// @name         v1.8.37 Multiprint + Pandash
// @version      1.8.37
// @description  Hazmat badges (TSX/CSX) on main Inventory grid only (#table-inventory, tr[data-row-id]) and product panel. Adds smart product-panel copy cleanup so script visuals/hidden controls never copy, while literal title highlighting stays untouched. Inventory scan groups rows by ASIN so each ASIN is checked once with PanDash, then painted onto all matching rows. Includes manual "Re-check Hazmat" button and is safe with column sorting (old runs are discarded when table changes). 1.7.6 remains the safe global baseline.
// @author       @mojordaq, @scdavids
// @include     /^https?:\/\/.*fcresearch.*\//
// @include     /^https?:\/\/qifcr\.fe\.aftx\.amazonoperations\.app\//
// @require      https://drive-render.corp.amazon.com/view/mojordaq@/js%20src%20files/jquery-3.6.0.js
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      pandash.amazon.com
// ==/UserScript==
/* eslint-env jquery */

// ---------- CONFIG ----------
const MARKETPLACE = "AU";
const HAZ_TTL_MS  = 6 * 60 * 60 * 1000; // 6 hours cache
const MAX_PARALLEL = 8;                 // max concurrent PanDash calls
const LEVEL_COLORS = [
  "rgb(153,153,153)", // 0
  "rgb(51,204,2)",    // 1
  "rgb(255,225,3)",   // 2
  "rgb(255,191,3)",   // 3
  "rgb(255,128,2)",   // 4
  "rgb(255,64,1)",    // 5
  "rgb(237,7,0)",     // 6
  "rgb(173,3,222)",   // 7
  "rgb(51,51,255)"    // 8
];

// ---------- CSS ----------
(function addStyles(){
  const css = `
    .fc-inline { display:inline-flex; align-items:center; gap:8px; vertical-align:middle; }
    .fc-print-controls { margin-left:10px; opacity:.96; }
    .fc-qty {
      width:3.35ch;
      min-width:30px;
      height:16px;
      padding:0 1px;
      text-align:center;
      border:1px solid transparent;
      border-radius:5px;
      background:transparent;
      box-shadow:none;
      color:transparent;
      caret-color:transparent;
      font:inherit;
      font-size:12px;
      line-height:14px;
      opacity:.18;
      transition:background-color .10s ease, border-color .10s ease, color .10s ease, opacity .10s ease;
      appearance:textfield;
      -webkit-appearance:none;
      -moz-appearance:textfield;
    }
    .fc-qty::placeholder { color:transparent; opacity:0; }
    .fc-qty:hover {
      background:transparent;
      border-color:transparent;
      color:transparent;
      caret-color:transparent;
      opacity:.24;
      outline:none;
    }
    .fc-qty:focus {
      background:rgba(120,138,160,.018);
      border-color:rgba(60,72,88,.045);
      color:rgba(24,31,40,.90);
      caret-color:rgba(24,31,40,.90);
      opacity:1;
      outline:none;
      box-shadow:none;
    }
    .fc-qty::-webkit-outer-spin-button,
    .fc-qty::-webkit-inner-spin-button {
      -webkit-appearance:none;
      margin:0;
    }
    .fc-stealth-trigger {
      display:inline;
      padding:0;
      margin:0;
      min-width:0;
      width:auto;
      height:auto;
      line-height:normal;
      box-sizing:content-box;
      border:0;
      background:transparent;
      color:rgba(0,0,0,.7);
      font:inherit;
      font-weight:inherit;
      text-decoration:none;
      cursor:pointer;
      appearance:none;
      -webkit-appearance:none;
      vertical-align:baseline;
      white-space:nowrap;
    }
    .fc-stealth-trigger:hover { text-decoration:underline; }
    .fc-hazmat { padding:2px 8px; border-radius:6px; font-size:12px; font-weight:700; color:#000; user-select:none; pointer-events:none; margin-left:10px; }
    .fc-hazmat.fc-river-l0 {
      pointer-events:auto;
      cursor:pointer;
    }
    .fc-hazmat.fc-river-l0:hover { text-decoration:underline; }
    .fc-hazmat.fc-river-l0[aria-busy="true"] { cursor:wait; opacity:.72; }
    .fc-pill { display:inline-flex; align-items:center; gap:6px; margin-left:8px; }
    .fc-badge { display:inline-block; padding:2px 8px; border-radius:12px; font-size:12px; font-weight:800; color:#000; user-select:none; pointer-events:none; }
    .fc-haz-refresh { margin-left: 8px; padding:4px 10px; cursor:pointer; border-radius:3px; border:1px solid #888; background:#eee; font-size:12px; }
    .fc-haz-refresh:hover { background:#ddd; }
    .fc-confirm-toast {
      position:fixed;
      right:18px;
      bottom:18px;
      z-index:2147483647;
      width:340px;
      max-width:calc(100vw - 36px);
      background:#fff;
      border:1px solid #bfc7d1;
      border-radius:8px;
      box-shadow:0 10px 28px rgba(0,0,0,.16);
      color:#1f2937;
      font:12px/1.4 Arial, sans-serif;
      overflow:hidden;
    }
    .fc-confirm-toast-head {
      padding:8px 10px;
      background:#f5f7fa;
      border-bottom:1px solid #dbe2ea;
      font-weight:700;
    }
    .fc-confirm-toast-body { padding:10px; }
    .fc-confirm-toast-code { font-weight:700; word-break:break-word; }
    .fc-confirm-toast-actions { display:flex; justify-content:flex-end; gap:8px; padding:0 10px 10px; }
    .fc-confirm-btn {
      padding:4px 10px;
      border-radius:4px;
      border:1px solid #aeb8c2;
      background:#f7f9fb;
      color:#1f2937;
      cursor:pointer;
      font:inherit;
    }
    .fc-confirm-btn:hover { background:#eef2f6; }
    .fc-confirm-btn.primary { background:#e8f1fb; border-color:#8eb4da; }
    .fc-confirm-btn.primary:hover { background:#dceafa; }

    /* v1.8.35: display-only script UI must never be copied as page text. */
    .fc-inline,
    .fc-print-controls,
    .fc-qty,
    .fc-hazmat,
    .fc-pill,
    .fc-badge,
    .fc-haz-refresh,
    .fc-confirm-toast,
    .fc-confirm-toast *,
    .fc-madcat-badge,
    .fc-bin-btn {
      user-select:none!important;
      -moz-user-select:none!important;
      -webkit-user-select:none!important;
      -ms-user-select:none!important;
    }
    .fc-inline::selection,
    .fc-print-controls::selection,
    .fc-qty::selection,
    .fc-hazmat::selection,
    .fc-pill::selection,
    .fc-badge::selection,
    .fc-haz-refresh::selection,
    .fc-confirm-toast::selection,
    .fc-madcat-badge::selection,
    .fc-bin-btn::selection {
      background:transparent!important;
      color:inherit!important;
    }
  `;
  const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
})();

// ---------- UTIL ----------
const debounce = (fn, ms)=>{ let t=null; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };
function getCookie(c){ return (document.cookie.split("; ").find(r=>r.startsWith(c+"="))||"").split("=")[1]||""; }
function httpGet(url){
  return new Promise((resolve,reject)=>{
    GM_xmlhttpRequest({method:"GET", url, responseType:"json", onload:r=>resolve(r.response), onerror:reject});
  });
}
function httpPost(url,data){
  return new Promise((resolve,reject)=>{
    GM_xmlhttpRequest({
      method:"POST", url, data, responseType:"json",
      headers:{"Content-Type":"application/x-www-form-urlencoded"},
      onload:r=>resolve(r.response), onerror:reject
    });
  });
}
function asciihex(str){ return Array.from(str).map(ch=>ch.charCodeAt(0).toString(16)).join(""); }
const clampLevel = (lvl)=>Math.max(0, Math.min(7, Number(lvl)||0));
function cleanOneLine(s){ return String(s||'').replace(/\s+/g,' ').trim(); }

function getCleanRowLabel(tr){
  const first = tr?.cells?.[0];
  if (!first) return '';
  const clone = first.cloneNode(true);
  clone.querySelectorAll('button,input,.fc-inline,.fc-print-controls,.fc-qty,.fc-hazmat,.fc-haz-refresh,.fc-pill,.fc-badge,.fc-madcat-badge,.fc-bin-btn').forEach(n => n.remove());
  return cleanOneLine(clone.textContent || first.textContent || '');
}

function escapeHtmlFc(s){
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function selectionTouchesNode(range, node){
  try { return !!(node && range.intersectsNode(node)); }
  catch { return false; }
}

function selectionTouchesAny(sel, nodes){
  if (!sel || !nodes?.length) return false;
  for (let i = 0; i < sel.rangeCount; i++){
    const r = sel.getRangeAt(i);
    for (const n of nodes){
      if (selectionTouchesNode(r, n)) return true;
    }
  }
  return false;
}

function productRowLabel(row){
  const th = row?.querySelector('th') || row?.cells?.[0];
  return cleanOneLine(th?.textContent || th?.innerText || '');
}

function cleanProductValue(row, label){
  const td = row ? (row.querySelector('td') || row.cells?.[1] || row.lastElementChild) : null;
  if (!td) return { text:'', href:'' };

  const a = td.querySelector('a');
  const href = a ? (a.href || a.getAttribute('href') || '') : '';
  const anchorText = cleanOneLine(a?.textContent || a?.innerText || '');

  const clone = td.cloneNode(true);
  clone.querySelectorAll([
    '.fc-inline', '.fc-print-controls', '.fc-qty', '.fc-hazmat', '.fc-haz-refresh',
    '.fc-pill', '.fc-badge', '.fc-madcat-badge', '.fc-bin-btn',
    'button', 'input'
  ].join(',')).forEach(n => n.remove());

  let text = cleanOneLine(anchorText || clone.textContent || td.textContent || '');

  if (/^(ASIN|ISBN)$/i.test(label)){
    const m = text.match(/\b[A-Z0-9]{10}\b/i);
    if (m) text = m[0].toUpperCase();
  } else if (/^(FNSku|FcSku)$/i.test(label)){
    const m = text.match(/\b(?:X0|ZZ)[A-Z0-9]{8}\b/i) || text.match(/\b[A-Z0-9]{10}\b/i);
    if (m) text = m[0].toUpperCase();
  }

  return { text, href };
}

function htmlValueFc(v){
  const text = escapeHtmlFc(v?.text || '');
  const href = v?.href || '';
  return href ? `<a href="${escapeHtmlFc(href)}">${text}</a>` : text;
}

function installCleanProductPanelCopy(){
  document.addEventListener('copy', (ev)=>{
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount < 1 || sel.isCollapsed) return;

    const table = document.querySelector('[data-section-type="product"] table');
    if (!table || !selectionTouchesAny(sel, [table])) return;

    const rawSelectedText = String(sel.toString() || '');
    const hasInjectedVisualText = /(madcat:|pandash|check bin|\bL\d+\b|✅|🚫)/i.test(cleanOneLine(rawSelectedText));

    const rowsOut = [];
    for (const tr of Array.from(table.rows || [])){
      const labelCell = tr.querySelector('th') || tr.cells?.[0];
      const valueCell = tr.querySelector('td') || tr.cells?.[1] || tr.lastElementChild;
      if (!labelCell || !valueCell) continue;

      const label = productRowLabel(tr);
      if (!/^(ASIN|ISBN|FNSku|FcSku|Title)$/i.test(label)) continue;

      const labelTouched = selectionTouchesAny(sel, [labelCell]);
      const valueTouched = selectionTouchesAny(sel, [valueCell]);
      if (!labelTouched && !valueTouched) continue;

      // Literal title highlighting should stay literal unless the row label is also selected.
      if (/^Title$/i.test(label) && valueTouched && !labelTouched && !hasInjectedVisualText) continue;

      // ASIN/FNSKU/FCSKU cells contain hidden qty boxes and script badges; clean these even for value-only copy.
      if (!/^(ASIN|ISBN|FNSku|FcSku)$/i.test(label) && !labelTouched && !hasInjectedVisualText) continue;

      const value = cleanProductValue(tr, label);
      if (labelTouched && valueTouched) rowsOut.push({ mode:'row', label, value });
      else if (labelTouched) rowsOut.push({ mode:'label', label, value:{ text:label, href:'' } });
      else if (valueTouched) rowsOut.push({ mode:'value', label, value });
    }

    if (!rowsOut.length) return;

    const onlyValues = rowsOut.every(r => r.mode === 'value');
    const onlyLabels = rowsOut.every(r => r.mode === 'label');

    let text = '';
    let html = '';

    if (onlyValues){
      text = rowsOut.map(r => r.value.text).join('\n');
      html = rowsOut.map(r => htmlValueFc(r.value)).join('<br>');
    } else if (onlyLabels){
      text = rowsOut.map(r => r.label).join('\n');
      html = rowsOut.map(r => escapeHtmlFc(r.label)).join('<br>');
    } else {
      text = rowsOut.map(r => {
        if (r.mode === 'row') return r.label + ' \t' + r.value.text;
        if (r.mode === 'value') return r.value.text;
        return r.label;
      }).join('\n');

      html = '<table><tbody>' + rowsOut.map(r => {
        if (r.mode === 'row') return '<tr><td>' + escapeHtmlFc(r.label) + '&nbsp;</td><td>' + htmlValueFc(r.value) + '</td></tr>';
        if (r.mode === 'value') return '<tr><td>' + htmlValueFc(r.value) + '</td></tr>';
        return '<tr><td>' + escapeHtmlFc(r.label) + '</td></tr>';
      }).join('') + '</tbody></table>';
    }

    ev.preventDefault();
    ev.stopPropagation();
    ev.clipboardData.setData('text/plain', text);
    ev.clipboardData.setData('text/html', html);
  }, true);
}
installCleanProductPanelCopy();
function getRowLabelCell(row){ return row?.cells?.[0] || row?.querySelector('th, td'); }
function attachStealthPrintTrigger(row, key, label, onClick){
  const cell = getRowLabelCell(row);
  if (!cell) return;

  let trigger = cell.querySelector(`.fc-stealth-trigger[data-fc-key="${key}"]`);
  if (!trigger){
    const text = cleanOneLine(cell.textContent || label || '').trim() || label;
    cell.textContent = '';
    trigger = document.createElement('span');
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('tabindex', '0');
    trigger.className = 'fc-stealth-trigger';
    trigger.dataset.fcKey = key;
    trigger.textContent = text;
    trigger.title = `Click to print ${label}`;
    cell.appendChild(trigger);
  }

  trigger.onclick = (ev)=>{
    ev.preventDefault();
    ev.stopPropagation();
    onClick();
  };
}


function updateQtyInputWidth(input){
  if (!input) return;
  const len = Math.max(1, String(input.value || '').length);
  input.style.width = `${Math.max(3.35, Math.min(4.6, len + 1.15))}ch`;
}

function sanitizeQtyInput(input, { requireValue = false } = {}){
  if (!input) return null;
  let v = String(input.value || '').replace(/\D+/g, '').slice(0, 4);
  v = v.replace(/^0+/, '');

  if (!v){
    input.value = '';
    updateQtyInputWidth(input);
    if (requireValue){
      input.focus();
      input.select?.();
    }
    return null;
  }

  const n = Math.max(1, parseInt(v, 10) || 1);
  input.value = String(n);
  updateQtyInputWidth(input);
  return n;
}

function bindQtyEnterToPrint(input, onPrint, metaFactory){
  if (!input) return;
  input._fcPrintHandler = onPrint;
  input._fcPrintMetaFactory = metaFactory;
}

function getRequiredQty(input){
  const qty = sanitizeQtyInput(input, { requireValue: true });
  if (!qty){
    alert('Enter a quantity first.');
    return null;
  }
  return qty;
}

function makeQtyInput(value=''){
  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "numeric";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.maxLength = 4;
  input.value = value == null ? '' : String(value);
  input.className = "fc-qty";
  input.setAttribute('aria-label', 'Print quantity');
  updateQtyInputWidth(input);
  input.addEventListener('input', ()=>{
    const cleaned = String(input.value || '').replace(/\D+/g, '').slice(0, 4);
    input.value = cleaned;
    updateQtyInputWidth(input);
  });
  input.addEventListener('focus', ()=> updateQtyInputWidth(input));
  input.addEventListener('blur', ()=> sanitizeQtyInput(input));
  input.addEventListener('keydown', (ev)=>{
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    ev.stopPropagation();
    const qty = sanitizeQtyInput(input, { requireValue: true });
    if (!qty) return;
    if (typeof input._fcPrintHandler === 'function') {
      input._fcPrintHandler();
    }
  });
  return input;
}

// --- IMPORTANT: CASE-SAFE PRINTING ---
// FCResearch barcodes like csXPKQRD38N can be mixed-case and MUST be preserved for Printmon.
// So we only strip whitespace/hyphens for printing and NEVER force uppercase.
// (Uppercasing is used ONLY for ASIN/ISBN comparisons + cache keys.)
function stripDelims(raw){ return String(raw||'').replace(/[\s-]/g,'').trim(); }
function normalizePrintCode(raw){ return stripDelims(raw); }           // keep original case
function normalizeAsinLike(raw){ return stripDelims(raw).toUpperCase(); } // safe for ASIN/ISBN
function upperForCompare(raw){ return normalizePrintCode(raw).toUpperCase(); }

// ASIN only: 10-char alnum
const CODE_RE = /\b[A-Z0-9]{10}\b/; // match any 10-char ASIN (incl. 10-digit/book)
function isAsin(id){ return /^[A-Z0-9]{10}$/i.test((id||"").trim()); }

// ---------- HAZMAT CACHE/FETCH ----------
const mem = new Map();
const kHaz = (fc,id)=>`hz:${(fc||'').toUpperCase()}:${normalizeAsinLike(id)}`;
const kLvl = (fc)=>`fc_hazlvl:${(fc||'').toUpperCase()}`;

/**
 * Get Hazmat info from PanDash.
 * If force === true, bypass cache and force a fresh call for that ASIN.
 */
async function getHazmat(id, fc, force = false){
  if (!isAsin(id)) return null;

  const asin = normalizeAsinLike(id);
  const key = kHaz(fc, asin);

  if (!force){
    const m = mem.get(key);
    if (m && Date.now()-m.ts < HAZ_TTL_MS) return m.val;
    try {
      const raw = GM_getValue(key, null);
      if (raw){
        const obj = JSON.parse(raw);
        if (Date.now()-obj.ts < HAZ_TTL_MS){
          mem.set(key,obj);
          return obj.val;
        }
      }
    } catch {}
  }

  let hazlvl = GM_getValue(kLvl(fc), null);
  if (!hazlvl && fc){
    try{
      const meta = await httpGet(`https://pandash.amazon.com/GridServlet?fc=${encodeURIComponent(fc)}`);
      hazlvl = meta?.restriction || "default";
      GM_setValue(kLvl(fc), hazlvl);
    }catch{ hazlvl = "default"; }
  }
  if (!hazlvl) hazlvl = "default";

  const data = `language=default&source=${hazlvl}-hazmat-FC&marketPlaces=${MARKETPLACE}` +
               `&asins=${encodeURIComponent(asin)}&rows=1&page=1&fc=${encodeURIComponent(fc||'')}`;
  let res=null;
  try{ res = await httpPost("https://pandash.amazon.com/GridServlet", data); }catch{ res=null; }
  const row = res?.rows?.find(r => (String(r.asin||'').toUpperCase()) === asin);
  const val = row ? [Number(row.level||0), String(row.message||'')] : null;

  const pack = {ts:Date.now(), val};
  mem.set(key, pack);
  try { GM_setValue(key, JSON.stringify(pack)); } catch {}
  return val;
}

// ---------- INVENTORY HELPERS (INVENTORY-ONLY, GROUPED BY ASIN) ----------
function getInventoryTable(){
  let table = document.querySelector('.dataTables_scrollBody table#table-inventory');
  if (!table) table = document.querySelector('table#table-inventory');
  return table;
}

function getInventoryRows(table){
  const tbody = table.tBodies[0];
  if (!tbody) return [];
  return Array.from(tbody.querySelectorAll('tr[data-row-id]'));
}

function findAsinInRow(tr){
  const links = Array.from(tr.querySelectorAll('a'));
  for (const a of links){
    const m = (a.textContent || "").match(CODE_RE);
    if (m){
      const asin = normalizeAsinLike(m[0]);
      if (isAsin(asin)){
        return { asin, link: a };
      }
    }
  }
  return null;
}

function ensurePill(asinCell){
  let pill = asinCell.querySelector('.fc-pill');
  if (!pill){
    pill = document.createElement('span');
    pill.className = 'fc-pill';
    const link = asinCell.querySelector('a');
    if (link) link.after(pill); else asinCell.appendChild(pill);
  }
  return pill;
}

async function runWithConcurrency(items, limit, workerFn){
  if (!items.length) return;
  const max = Math.min(limit, items.length);
  let index = 0;
  const workers = [];
  for (let i=0; i<max; i++){
    workers.push((async function(){
      while (true){
        let item;
        if (index >= items.length) return;
        item = items[index++];
        await workerFn(item);
      }
    })());
  }
  await Promise.all(workers);
}

// Generation id to discard old runs when table changes (sorting, paging, etc.)
let INVENTORY_RUN_ID = 0;

async function annotateInventory(force = false){
  const fc = document.querySelector(".warehouse-id")?.textContent || "";
  const table = getInventoryTable();
  if (!table || !fc) return;

  const rows = getInventoryRows(table);
  if (!rows.length) return;

  const runId = ++INVENTORY_RUN_ID;

  const asinMap = new Map();

  for (const tr of rows){
    const hit = findAsinInRow(tr);
    if (!hit) continue;
    const { asin, link } = hit;
    const asinCell = link.closest('td') || tr.cells[0];
    if (!asinCell) continue;

    const pill = ensurePill(asinCell);

    if (!force && pill.querySelector('.fc-badge')) continue;

    let list = asinMap.get(asin);
    if (!list){
      list = [];
      asinMap.set(asin, list);
    }
    list.push(pill);
  }

  const work = Array.from(asinMap.entries()).map(([asin, pills]) => ({ asin, pills, fc, runId }));

  await runWithConcurrency(work, MAX_PARALLEL, async ({asin, pills, fc, runId})=>{
    if (runId !== INVENTORY_RUN_ID) return;

    let val;
    try{ val = await getHazmat(asin, fc, force); }catch{ val = null; }

    if (runId !== INVENTORY_RUN_ID) return;

    let level = 0;
    let msg   = '';
    if (val){
      level = clampLevel(val[0]);
      msg   = String(val[1] || '');
    }

    for (const pill of pills){
      if (!pill.isConnected) continue;

      const badge = document.createElement('span');
      badge.className = 'fc-badge';
      try{
        badge.style.background = LEVEL_COLORS[level] || LEVEL_COLORS[0];
        const ok = msg.includes('can be processed') ? ' ✅' : '';
        badge.textContent = `L${level}${ok}`;
      }catch{
        badge.style.background = LEVEL_COLORS[0];
        badge.textContent = 'Hazmat N/A';
      }
      pill.querySelectorAll('.fc-badge').forEach(n => n.remove());
      pill.appendChild(badge);
    }
  });
}

// ---------- MANUAL "RE-CHECK HAZMAT" BUTTON ----------
function ensureRefreshButton(){
  if (document.querySelector('.fc-haz-refresh.fc-grid-recheck')) return;

  const candidates = Array.from(document.querySelectorAll('button, span, a, input[type="button"]'));
  const ref = candidates.find(el => /show pod p-levels/i.test((el.textContent || el.value || '')))
          || candidates.find(el => /analyze container/i.test((el.textContent || el.value || '')));
  if (!ref || !ref.parentNode) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'fc-haz-refresh fc-grid-recheck';
  btn.textContent = 'Re-check Hazmat';
  btn.addEventListener('click', ()=>annotateInventory(true));

  ref.parentNode.insertBefore(btn, ref.nextSibling);
}

const runInventoryUpdate = debounce(()=>{
  annotateInventory(false);
  ensureRefreshButton();
}, 300);

(function watchInventory(){
  const root = document.querySelector('#content, main, body') || document.body;
  const obs = new MutationObserver(runInventoryUpdate);
  obs.observe(root, {childList:true, subtree:true});
  runInventoryUpdate();
})();

document.addEventListener('click', (ev)=>{
  const th = ev.target.closest('#table-inventory thead th');
  if (th) setTimeout(runInventoryUpdate, 150);
});

// ---------- PRODUCT PANEL (unchanged) ----------
(function initProductPanel(){
  const sel = '[data-section-type="product"] table';
  const once = new MutationObserver(()=>{
    const table = document.querySelector(sel);
    if (!table) return;
    once.disconnect();

    const rows = Array.from(table.rows);
    const asinRow  = rows.find(r => /^\s*ASIN\b/i.test((r.cells?.[0]?.innerText || r.innerText || '').trim()));
    const isbnRow  = rows.find(r => /^\s*ISBN\b/i.test((r.cells?.[0]?.innerText || r.innerText || '').trim()));
    const fnskuRow = rows.find(r => /FNSku/i.test(r.innerText));
    const titleRow = rows.find(r => /Title/i.test(r.innerText));
    if (!titleRow) return;

    document.querySelectorAll('.fc-version-prefix').forEach(n=>n.remove());

    const titleCell = titleRow.querySelector("a") || titleRow.lastElementChild;
    const title = (titleCell?.textContent || "").trim();

    const rawAsin = (asinRow?.querySelector("a")?.textContent || asinRow?.lastElementChild?.textContent || "").trim();
    const asinId = normalizeAsinLike(rawAsin);

    const rawIsbn = (isbnRow?.querySelector("a")?.textContent || isbnRow?.lastElementChild?.textContent || "").trim();
    const isbnId = normalizeAsinLike(rawIsbn);

    const idForHazmat = asinId;

    const asinCell = (asinRow || isbnRow)?.lastElementChild;
    if (!asinCell) return;

    let asinQty = asinCell.querySelector('.fc-inline .fc-qty');
    if (!asinQty) {
      const wrap = document.createElement("div");
      wrap.className = 'fc-inline fc-print-controls';
      asinQty = makeQtyInput('');
      wrap.appendChild(asinQty);
      asinCell.appendChild(wrap);
    }

    const doAsinSinglePrint = ()=>{
      quickPrint(idForHazmat || isbnId, 1, title, (idForHazmat ? "ASIN" : "ISBN"));
    };

    const doAsinQtyPrint = ()=>{
      const qty = getRequiredQty(asinQty);
      if (!qty) return;
      quickPrint(idForHazmat || isbnId, qty, title, (idForHazmat ? "ASIN" : "ISBN"));
    };

    attachStealthPrintTrigger(asinRow || isbnRow, 'asin-print', (idForHazmat ? 'ASIN' : 'ISBN'), doAsinSinglePrint);
    bindQtyEnterToPrint(asinQty, doAsinQtyPrint, (quantity)=>({ type: (idForHazmat ? 'ASIN' : 'ISBN'), code: idForHazmat || isbnId, quantity }));

    let badge = asinCell.querySelector('.fc-hazmat');
    if (!badge){
      badge = document.createElement('span');
      badge.className = 'fc-hazmat';
      badge.textContent = 'Loading…';
      asinCell.appendChild(badge);
    }

    const configureRiverL0 = (level)=>{
      const isL0 = Number(level) === 0;
      badge.classList.toggle('fc-river-l0', isL0);
      badge.setAttribute('role', isL0 ? 'button' : 'status');
      if (isL0){
        badge.tabIndex = 0;
        badge.title = 'Create Hazmat RIVER ticket';
      } else {
        badge.removeAttribute('tabindex');
        badge.title = '';
      }
    };

    if (!badge.dataset.riverBound){
      badge.dataset.riverBound = '1';
      const launchRiver = (ev)=>{
        if (!badge.classList.contains('fc-river-l0')) return;
        if (ev.type === 'keydown' && ev.key !== 'Enter' && ev.key !== ' ') return;
        ev.preventDefault();
        ev.stopPropagation();
        const bridge = document.getElementById('bwu2-river-launch-bridge');
        if (!bridge){
          alert('RIVER Ticket Assistant bridge not found. Confirm v0.2.10 is enabled, then refresh FCResearch.');
          return;
        }
        badge.setAttribute('aria-busy', 'true');
        bridge.click();
        setTimeout(()=> badge.removeAttribute('aria-busy'), 2500);
      };
      badge.addEventListener('click', launchRiver);
      badge.addEventListener('keydown', launchRiver);
    }

    let topBtn = asinCell.querySelector('.fc-haz-refresh.fc-topbar-recheck');
    if (!topBtn){
      topBtn = document.createElement('button');
      topBtn.type = 'button';
      topBtn.className = 'fc-haz-refresh fc-topbar-recheck';
      topBtn.textContent = 'Pandash';
      asinCell.appendChild(topBtn);
    }

    (async ()=>{
      const fc = document.querySelector(".warehouse-id")?.textContent || "";
      const res = idForHazmat ? await getHazmat(idForHazmat, fc) : null;
      if (res){
        const [lvl,msg]=res;
        const cl = clampLevel(lvl);
        badge.textContent = `L${cl}${msg?.includes('can be processed') ? ' ✅' : ' 🚫'}`;
        badge.style.background = LEVEL_COLORS[cl] || LEVEL_COLORS[0];
        configureRiverL0(cl);
      } else {
        badge.textContent = 'Hazmat N/A';
        badge.style.background = LEVEL_COLORS[0];
        configureRiverL0(null);
      }

      topBtn.onclick = async ()=>{
        try{
          topBtn.disabled = true;
          const oldText = topBtn.textContent;
          topBtn.textContent = 'Rechecking…';

          await annotateInventory(true);

          const fresh = idForHazmat ? await getHazmat(idForHazmat, fc, true) : null;
          if (fresh){
            const [lvl2,msg2] = fresh;
            const cl2 = clampLevel(lvl2);
            badge.textContent = `L${cl2}${msg2?.includes('can be processed') ? ' ✅' : ' 🚫'}`;
            badge.style.background = LEVEL_COLORS[cl2] || LEVEL_COLORS[0];
            configureRiverL0(cl2);
          } else {
            badge.textContent = 'Hazmat N/A';
            badge.style.background = LEVEL_COLORS[0];
            configureRiverL0(null);
          }

          topBtn.textContent = oldText;
          topBtn.disabled = false;
        }catch{
          topBtn.textContent = 'Force Recheck PanDash';
          topBtn.disabled = false;
        }
      };
    })();

    if (fnskuRow) {
      const fnsku = (fnskuRow.querySelector("a")?.textContent || fnskuRow.lastElementChild?.textContent || "").trim();
      if (fnsku) {
        let fnskuQty = fnskuRow.lastElementChild.querySelector('.fc-inline .fc-qty');
        if (!fnskuQty) {
          const grp = document.createElement("span");
          grp.className = 'fc-inline fc-print-controls';
          fnskuQty = makeQtyInput('');
          grp.appendChild(fnskuQty);
          fnskuRow.lastElementChild.appendChild(grp);
        }

        const doFnskuSinglePrint = ()=>{
          quickPrint(fnsku, 1, title, "FNSku");
        };

        const doFnskuQtyPrint = ()=>{
          const qty = getRequiredQty(fnskuQty);
          if (!qty) return;
          quickPrint(fnsku, qty, title, "FNSku");
        };

        attachStealthPrintTrigger(fnskuRow, 'fnsku-print', 'FNSku', doFnskuSinglePrint);
        bindQtyEnterToPrint(fnskuQty, doFnskuQtyPrint, (quantity)=>({ type: 'FNSku', code: fnsku, quantity }));
      }
    }
  });
  once.observe(document.body, {childList:true, subtree:true});
})();

// ---------- PRINT ----------
function quickPrint(code, quantity, desc, type="ASIN"){
  quantity = Math.max(1, parseInt(String(quantity||"1").replace(/\D+/g, ""), 10) || 1);
  const badgeId = getCookie("fcmenu-employeeId");
  const seq = Math.floor(Math.random()*1e10);
  const url = `http://localhost:5965/printer?action=print&type=barcode&data=${asciihex(code)}` +
              `&text=${asciihex(code)}&quantity=${quantity}&desc=${asciihex(desc)}` +
              `&badgeid=${badgeId}&seq=${seq}`;
  fetch(url).then(()=>console.log(`${type} printed`)).catch(()=>alert("Printmon not running or printer not connected."));
}

// ---------- ALT+CLICK QUICK PRINT (CASE-SAFE) ----------
// For alt+click printing we MUST preserve the exact case the page shows.
// We only use uppercase copies for pattern detection + product-panel matching.
// IMPORTANT: intercept in CAPTURE phase so FCResearch links do not navigate / refresh first.

function getProductPanelTitle(){
  const table = document.querySelector('[data-section-type="product"] table');
  if (!table) return "";
  const rows = Array.from(table.rows);
  const titleRow = rows.find(r => /^\s*Title\b/i.test((r.cells?.[0]?.innerText || r.innerText || '').trim()))
               || rows.find(r => /Title/i.test(r.innerText));
  if (!titleRow) return "";
  const cell = titleRow.querySelector("a") || titleRow.lastElementChild;
  return cleanOneLine(cell?.textContent || "");
}

function getProductPanelPrimaryIdUpper(){
  const table = document.querySelector('[data-section-type="product"] table');
  if (!table) return "";
  const rows = Array.from(table.rows);
  const asinRow  = rows.find(r => /^\s*ASIN\b/i.test((r.cells?.[0]?.innerText || r.innerText || '').trim()));
  const isbnRow  = rows.find(r => /^\s*ISBN\b/i.test((r.cells?.[0]?.innerText || r.innerText || '').trim()));
  const cell = (asinRow || isbnRow)?.lastElementChild;
  const id = cleanOneLine(cell?.textContent || "");
  return normalizeAsinLike(id);
}

function normalizeHeaderText(s){
  return cleanOneLine(String(s||'')).toLowerCase().replace(/\(\d+\)/g,'').replace(/\u00a0/g,' ');
}

function findColIndexByHeader(table, patterns){
  const wrapper = table.closest('.dataTables_scroll') || table.closest('.dataTables_wrapper') || table.parentElement;
  let headTable = wrapper ? wrapper.querySelector('.dataTables_scrollHead table') : null;
  if (!headTable) headTable = table;

  const ths = Array.from(headTable.querySelectorAll('thead th'));
  if (!ths.length) return -1;

  for (let i=0; i<ths.length; i++){
    const t = normalizeHeaderText(ths[i].textContent || ths[i].innerText || '');
    if (!t) continue;
    if (patterns.some(re => re.test(t))) return i;
  }
  return -1;
}

function getTitleFromRowByHeaders(tr){
  const table = tr?.closest('table');
  if (!table) return "";
  const idx = findColIndexByHeader(table, [
    /(^|\b)title(\b|$)/,
    /(^|\b)product(\b|$)/,
    /(^|\b)description(\b|$)/,
    /(^|\b)item\s*name(\b|$)/
  ]);
  if (idx < 0) return "";
  const td = tr.querySelectorAll('td')[idx];
  return cleanOneLine(td?.textContent || "");
}

function getSkuAnchorInRow(tr){
  if (!tr) return null;
  // Prefer an anchor in a cell whose header includes sku/fnsku/fcsku/asin/isbn
  const table = tr.closest('table');
  if (!table) return tr.querySelector('a');

  const idx = findColIndexByHeader(table, [
    /(^|\b)sku(\b|$)/,
    /(^|\b)fnsku(\b|$)/,
    /(^|\b)fcsku(\b|$)/,
    /(^|\b)asin(\b|$)/,
    /(^|\b)isbn(\b|$)/
  ]);

  if (idx >= 0){
    const td = tr.querySelectorAll('td')[idx];
    const a = td ? td.querySelector('a') : null;
    if (a) return a;
  }
  return tr.querySelector('a');
}

function inferPrintType(code){
  const c = stripDelims(code).toUpperCase();
  if (/^FBA[A-Z0-9]{6,}$/.test(c)) return "FBA";
  if (/^X0[A-Z0-9]{8}$/.test(c)) return "FNSku";
  if (/^ZZ[A-Z0-9]{8}$/.test(c)) return "FCSKU";
  if (/^[A-Z0-9]{10}$/.test(c)) return "ASIN"; // includes B0 + 8 etc
  return "GENERIC";
}

async function waitForProductPanelTitleForUpper(targetUpper, timeoutMs = 2500){
  const start = Date.now();
  const target = String(targetUpper||"").toUpperCase();

  // If panel already matches target, return immediately.
  const nowId = getProductPanelPrimaryIdUpper();
  const nowTitle = getProductPanelTitle();
  if (nowTitle && nowId && nowId === target) return nowTitle;

  return await new Promise((resolve)=>{
    const tick = ()=>{
      const id = getProductPanelPrimaryIdUpper();
      const title = getProductPanelTitle();
      if (title && id && id === target) return resolve(title);
      if (Date.now() - start > timeoutMs) return resolve("");
      setTimeout(tick, 80);
    };
    tick();
  });
}

const PRINT_CODE_PATTERNS = [
  /\b(FBA[A-Za-z0-9]{6,})\b/,
  /\b(X0[A-Za-z0-9]{8})\b/,
  /\b(ZZ[A-Za-z0-9]{8})\b/,
  /\b(LPN[A-Za-z0-9-]{4,})\b/i,
  /\b([A-Za-z0-9]{10})\b/
];

function extractPrintableCodeFromText(text){
  const clean = cleanOneLine(text || '');
  if (!clean) return '';
  for (const re of PRINT_CODE_PATTERNS){
    const m = clean.match(re);
    if (m && m[1]) return normalizePrintCode(m[1]);
  }
  return '';
}

function extractPrintableCodeFromTarget(target){
  if (!target || !(target instanceof Element)) return '';

  const candidates = [];
  const push = (v)=>{ if (v) candidates.push(v); };

  const a = target.closest('a');
  if (a){
    push(a.textContent);
    push(a.innerText);
    push(a.getAttribute('title'));
    push(a.getAttribute('aria-label'));
  }

  const td = target.closest('td,th');
  if (td){
    push(td.textContent);
    push(td.innerText);
  }

  push(target.textContent);
  push(target.innerText);

  for (const text of candidates){
    const code = extractPrintableCodeFromText(text);
    if (code) return code;
  }

  // fallback: allow ANY text selection
  const raw = cleanOneLine(target.textContent || '');
  if (raw) return raw;

  return '';
}

function swallowAltPrintableEvent(ev){
  if (!ev.altKey) return false;
  const code = extractPrintableCodeFromTarget(ev.target);
  if (!code) return false;
  ev.preventDefault();
  ev.stopPropagation();
  return true;
}

async function handleAltPrint(ev){
  if (!ev.altKey) return;

  const codePrint = extractPrintableCodeFromTarget(ev.target);
  if (!codePrint) return;

  // Block FCResearch navigation / refresh, but do not suppress repeat clicks.
  // v1.8.35: rapid Alt+click x2+ should send x2+ print jobs.
  ev.preventDefault();
  ev.stopPropagation();

  const codeUpper = upperForCompare(codePrint);

  if (/\bLPN\b/i.test(codePrint)){
    const ok = confirm(`Barcode: ${codePrint}

LPNs are unique and should not be printed.
Press OK to continue, or Cancel to stop.`);
    if (!ok) return;
    quickPrint(codePrint, 1, '', 'LPN');
    return;
  }

  const type = inferPrintType(codePrint);

  // FBA = raw print
  if (type === 'FBA'){
    quickPrint(codePrint, 1, '', 'FBA');
    return;
  }

  // GENERIC = raw print (no title lookup)
  if (type === 'GENERIC'){
    quickPrint(codePrint, 1, '', 'GENERIC');
    return;
  }

  const tr = ev.target?.closest('tr');

  let title = tr ? getTitleFromRowByHeaders(tr) : '';

  if (!title && tr){
    const a = getSkuAnchorInRow(tr);
    if (a){
      const beforeId = getProductPanelPrimaryIdUpper();
      a.click();
      const panelTitle = await waitForProductPanelTitleForUpper(codeUpper, 2500);
      const afterId = getProductPanelPrimaryIdUpper();
      if (panelTitle) title = panelTitle;
      else if (beforeId !== afterId) title = getProductPanelTitle() || '';
    }
  }

  if (!title) title = getProductPanelTitle() || '';

  quickPrint(codePrint, 1, title, type);
}

for (const evtName of ['pointerdown', 'mousedown', 'auxclick']){
  document.addEventListener(evtName, (ev)=>{
    swallowAltPrintableEvent(ev);
  }, true);
}

document.addEventListener('click', (ev)=>{
  handleAltPrint(ev).catch(err => console.error('Alt-print failed:', err));
}, true);
