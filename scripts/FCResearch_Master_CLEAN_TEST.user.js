// ==UserScript==
// @name         v0.1.3 FCResearch Master CLEAN TEST
// @namespace    https://github.com/1Sirkkris
// @version      0.1.3
// @description  CLEAN TEST master for FCResearch print, product, hazmat, size, and PO highlighting tools.
// @include      /^https?:\/\/.*fcresearch.*\//
// @include      /^https?:\/\/qifcr\.fe\.aftx\.amazonoperations\.app\//
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/FCResearch_Master_CLEAN_TEST.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/FCResearch_Master_CLEAN_TEST.user.js
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      pandash.amazon.com
// @connect      aft-poirot-website-nrt.nrt.proxy.amazon.com
// ==/UserScript==

(() => {
  'use strict';

  if (window.__fcrMasterCleanTest_v013) return;
  window.__fcrMasterCleanTest_v013 = true;

  const VERSION = '0.1.3';
  const UI_ATTR = 'data-fcr-master-ui';
  const UI_SELECTOR = `[${UI_ATTR}]`;
  const MARKETPLACE = 'AU';
  const HAZ_SUCCESS_TTL = 6 * 60 * 60 * 1000;
  const HAZ_FAILURE_TTL = 60 * 1000;
  const MAX_PARALLEL = 8;
  const SIDELINE_API = 'https://aft-poirot-website-nrt.nrt.proxy.amazon.com/api/scanitem';
  const SIDELINE_CONTAINER_KEY = 'fcr_sideline_container';
  const SIDELINE_CONTAINER_TIME_KEY = 'fcr_sideline_container_saved_at';
  const SIDELINE_CONTAINER_MAX_AGE = 24 * 60 * 60 * 1000;

  const LEVEL_COLORS = [
    'rgb(153,153,153)',
    'rgb(51,204,2)',
    'rgb(255,225,3)',
    'rgb(255,191,3)',
    'rgb(255,128,2)',
    'rgb(255,64,1)',
    'rgb(237,7,0)',
    'rgb(173,3,222)',
    'rgb(51,51,255)'
  ];

  const $ = (selector, root = document) => {
    try { return root.querySelector(selector); } catch { return null; }
  };
  const $$ = (selector, root = document) => {
    try { return [...root.querySelectorAll(selector)]; } catch { return []; }
  };
  const clean = value => String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const norm = value => clean(value).toLowerCase();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const debounce = (fn, ms) => {
    let timer = 0;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  };
  const escapeHtml = value => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const stripDelimiters = value => String(value ?? '').replace(/[\s-]/g, '').trim();
  const normalisePrintCode = value => stripDelimiters(value);
  const normaliseAsin = value => stripDelimiters(value).toUpperCase();
  const upperForCompare = value => normalisePrintCode(value).toUpperCase();
  const isAsin = value => /^[A-Z0-9]{10}$/i.test(clean(value));
  const clampLevel = value => Math.max(0, Math.min(8, Number(value) || 0));
  const getCookie = name => (document.cookie.split('; ').find(row => row.startsWith(`${name}=`)) || '').split('=')[1] || '';
  const asciiHex = value => Array.from(String(value ?? '')).map(char => char.charCodeAt(0).toString(16)).join('');

  function markUi(element) {
    if (element) element.setAttribute(UI_ATTR, '');
    return element;
  }

  function gmGetJson(key) {
    try {
      const raw = GM_getValue(key, null);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function gmSetJson(key, value) {
    try { GM_setValue(key, JSON.stringify(value)); } catch {}
  }

  function gmRequest({ method = 'GET', url, data, headers = {}, responseType = 'json', timeout = 15000 }) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url,
        data,
        headers,
        responseType,
        timeout,
        anonymous: false,
        onload: response => {
          if (response.status >= 200 && response.status < 300) resolve(response);
          else reject(new Error(`HTTP ${response.status}`));
        },
        onerror: () => reject(new Error('Request failed')),
        ontimeout: () => reject(new Error('Request timed out'))
      });
    });
  }

  function selectionTouchesNode(selection, node) {
    if (!selection || !node) return false;
    for (let index = 0; index < selection.rangeCount; index++) {
      try {
        if (selection.getRangeAt(index).intersectsNode(node)) return true;
      } catch {}
    }
    return false;
  }

  function setBusyButton(button, busy, busyText = 'Working…') {
    if (!button) return;
    if (busy) {
      if (!button.dataset.fcrmOriginalText) button.dataset.fcrmOriginalText = button.textContent || '';
      button.disabled = true;
      button.textContent = busyText;
    } else {
      button.disabled = false;
      button.textContent = button.dataset.fcrmOriginalText || button.textContent;
      delete button.dataset.fcrmOriginalText;
    }
  }

  function poIntFrom(cell) {
    const raw = cell?.querySelector?.("input,[contenteditable='true']")?.value ?? cell?.textContent ?? '';
    const match = String(raw).replace(/[, ]+/g, '').match(/-?\d+/);
    return match ? parseInt(match[0], 10) : 0;
  }

  function poDateFromCell(cell) {
    const match = clean(cell?.textContent).match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/);
    if (!match) return null;
    return new Date(+match[1], +match[2] - 1, +match[3], +(match[4] || 0), +(match[5] || 0), +(match[6] || 0));
  }

  function paintPurchaseOrders() {
    const body = $('table#table-purchase-order-item');
    if (!body) return;
    const wrap = body.closest('.dataTables_scroll');
    const head = $('.dataTables_scrollHead table', wrap) || body;
    const headers = $$('thead th,thead td', head).map(cell => norm(cell.textContent).replace(/\(.*?\)/g, '').trim());
    const idxU = headers.findIndex(value => value.includes('unfilled'));
    const idxC = headers.findIndex(value => /canceled|cancelled/.test(value));
    const idxD = headers.findIndex(value => value.includes('order date') || value === 'date');
    const six = new Date();
    six.setMonth(six.getMonth() - 6);
    const seven = new Date();
    seven.setMonth(seven.getMonth() - 7);
    for (const row of [...(body.tBodies[0] || body).rows]) {
      const cells = [...row.cells];
      cells.forEach(cell => cell.classList.remove('poch__unfilled', 'poch__cancelled', 'poch__band', 'poch__dateold'));
      const dateCell = idxD >= 0 ? cells[idxD] : null;
      const date = poDateFromCell(dateCell);
      if (date && date < six) for (let offset = 0; offset <= 2; offset++) cells[idxD - offset]?.classList.add('poch__band');
      if (dateCell && date && date < seven) dateCell.classList.add('poch__dateold');
      if (idxU >= 0 && poIntFrom(cells[idxU]) > 0) cells[idxU]?.classList.add('poch__unfilled');
      if (idxC >= 0 && poIntFrom(cells[idxC]) > 0) cells[idxC]?.classList.add('poch__cancelled');
    }
  }

  function injectStyles() {
    if ($('#fcrm-clean-style')) return;
    const style = document.createElement('style');
    style.id = 'fcrm-clean-style';
    style.textContent = `
      [${UI_ATTR}], [${UI_ATTR}] * { box-sizing:border-box; }
      td.poch__unfilled { background:rgba(255,193,7,.28)!important; box-shadow:inset 0 0 0 2px rgba(255,180,0,.50); font-weight:600; }
      td.poch__cancelled { background:rgba(220,53,69,.24)!important; box-shadow:inset 0 0 0 2px rgba(220,53,69,.45); font-weight:600; }
      td.poch__band { background:rgba(255,0,0,.14)!important; box-shadow:inset 0 0 0 1px rgba(255,0,0,.22); color:#5a0000; }
      td.poch__dateold { background:rgba(255,0,0,.22)!important; box-shadow:inset 0 0 0 1px rgba(255,0,0,.38)!important; font-weight:700; color:#6a0000; }
      .fcrm-inline { display:inline-flex; align-items:center; gap:7px; margin-left:8px; vertical-align:middle; }
      .fcrm-qty { width:3.35ch; min-width:30px; height:17px; padding:0 2px; text-align:center; border:1px solid transparent; border-radius:4px; background:transparent; color:transparent; caret-color:transparent; font:12px Arial,sans-serif; opacity:.20; appearance:textfield; }
      .fcrm-qty:hover { opacity:.28; }
      .fcrm-qty:focus { color:#111827; caret-color:#111827; opacity:1; outline:none; background:rgba(120,138,160,.04); border-color:rgba(60,72,88,.12); }
      .fcrm-qty::-webkit-outer-spin-button,.fcrm-qty::-webkit-inner-spin-button { -webkit-appearance:none; margin:0; }
      .fcrm-stealth-trigger { display:inline; padding:0; margin:0; border:0; background:transparent; color:rgba(0,0,0,.72); font:inherit; font-weight:inherit; cursor:pointer; white-space:nowrap; user-select:text; }
      .fcrm-stealth-trigger:hover { text-decoration:underline; }
      .fc-hazmat,.fc-badge,.fc-madcat-badge,.fc-size-badge { display:inline-flex; align-items:center; padding:2px 8px; border-radius:12px; font:800 12px/1.4 Arial,sans-serif; color:#000; vertical-align:middle; }
      .fc-hazmat { margin-left:9px; user-select:none; pointer-events:none; }
      .fc-hazmat.fc-river-l0 { pointer-events:auto; cursor:pointer; }
      .fc-hazmat.fc-river-l0:hover { text-decoration:underline; }
      .fc-hazmat.fc-river-l0[aria-busy="true"] { cursor:wait; opacity:.72; }
      .fc-badge { margin-left:6px; user-select:none; pointer-events:none; }
      .fc-madcat-badge { margin-left:8px; user-select:none; }
      .fcrm-madcat-yes { background:#ffff00; }
      .fcrm-madcat-no { background:#ff0000; }
      .fcrm-madcat-loading { background:#d9d9d9; }
      .fcrm-madcat-hit { background:#ffcc00!important; color:#000!important; font-weight:700!important; }
      .fc-size-badge { gap:5px; margin-left:6px; background:#e5e7eb; color:#111827; user-select:none; }
      .fcrm-size-error { background:#fee2e2; color:#991b1b; }
      .fcrm-size-change { border:0; padding:0 2px; background:transparent; color:#4b5563; font:700 11px Arial; cursor:pointer; }
      .fcrm-size-change:hover { color:#111827; text-decoration:underline; }
      .fcrm-haz-refresh { margin-left:8px; padding:4px 9px; cursor:pointer; border-radius:3px; border:1px solid #888; background:#eee; font:12px Arial,sans-serif; }
      .fcrm-haz-refresh:hover { background:#ddd; }
      .fcrm-prop-label { background:#3f5973!important; color:#fff!important; }
      .fcrm-prop-true { background:#359933!important; }
      .fcrm-prop-false { background:#a73225!important; }
      [${UI_ATTR}], [${UI_ATTR}] * { -webkit-user-select:none!important; -moz-user-select:none!important; user-select:none!important; }
      [${UI_ATTR}]::selection, [${UI_ATTR}] *::selection { background:transparent!important; color:inherit!important; }
    `;
    document.documentElement.appendChild(style);
  }

  function findProductTable() {
    return $('[data-section-type="product"] table') || $('div [data-section-type="product"] .a-keyvalue');
  }

  function cleanProductCell(cell) {
    if (!cell) return { text: '', href: '' };
    const anchor = $('a', cell);
    const href = anchor?.href || anchor?.getAttribute('href') || '';
    const anchorText = clean(anchor?.textContent || anchor?.innerText || '');
    const clone = cell.cloneNode(true);
    $$(UI_SELECTOR, clone).forEach(node => node.remove());
    $$('.fc-inline,.fc-print-controls,.fc-qty,.fc-hazmat,.fc-haz-refresh,.fc-pill,.fc-badge,.fc-madcat-badge,.fc-size-badge,.fc-bin-btn', clone).forEach(node => node.remove());
    $$('button,input', clone).forEach(node => node.remove());
    return { text: clean(anchorText || clone.textContent || cell.textContent || ''), href };
  }

  function readProductPanel() {
    const table = findProductTable();
    if (!table) return null;
    const rows = new Map();
    for (const row of $$('tr', table)) {
      const labelCell = $('th', row) || row.cells?.[0];
      const valueCell = $('td', row) || row.cells?.[1] || row.lastElementChild;
      if (!labelCell || !valueCell) continue;
      const label = clean(labelCell.textContent || labelCell.innerText || '');
      if (!label) continue;
      rows.set(norm(label), { row, labelCell, valueCell, label, ...cleanProductCell(valueCell) });
    }
    const get = (...labels) => labels.map(label => rows.get(norm(label))).find(Boolean) || null;
    const asin = get('ASIN');
    const isbn = get('ISBN');
    const fnsku = get('FNSku', 'FNSKU');
    const fcsku = get('FcSku', 'FCSKU');
    const title = get('Title');
    const dimensions = get('Dimensions');
    const primary = asin || isbn;
    const primaryId = normaliseAsin(primary?.text || '');
    const fnskuId = clean(fnsku?.text || '').match(/\b(?:X0|ZZ)[A-Z0-9]{8}\b/i)?.[0] || '';
    const signature = `${primaryId}|${fnskuId.toUpperCase()}|${clean(title?.text || '')}`;
    return { table, rows, get, asin, isbn, fnsku, fcsku, title, dimensions, primary, primaryId, fnskuId, signature };
  }

  function getInventoryTable() {
    return $('.dataTables_scrollBody table#table-inventory') || $('table#table-inventory');
  }

  function getInventoryRows(table = getInventoryTable()) {
    if (!table?.tBodies?.[0]) return [];
    return $$('tr[data-row-id]', table.tBodies[0]);
  }

  function getWarehouseId() {
    return clean($('.warehouse-id')?.textContent || '');
  }

  function normaliseHeader(value) {
    return norm(String(value ?? '').replace(/\(\d+\)/g, ''));
  }

  function findColumnIndex(table, patterns) {
    if (!table) return -1;
    const wrapper = table.closest('.dataTables_scroll,.dataTables_wrapper') || table.parentElement;
    const headerTable = $('.dataTables_scrollHead table', wrapper) || table;
    const headers = $$('thead th', headerTable);
    return headers.findIndex(header => {
      const text = normaliseHeader(header.textContent || header.innerText || '');
      return text && patterns.some(pattern => pattern.test(text));
    });
  }

  function cleanCodeForLabel(label, value) {
    const text = clean(value);
    if (/^(ASIN|ISBN)$/i.test(label)) return text.match(/\b[A-Z0-9]{10}\b/i)?.[0]?.toUpperCase() || text;
    if (/^(FNSku|FcSku)$/i.test(label)) return text.match(/\b(?:X0|ZZ)[A-Z0-9]{8}\b/i)?.[0]?.toUpperCase() || text.match(/\b[A-Z0-9]{10}\b/i)?.[0]?.toUpperCase() || text;
    return text;
  }

  function htmlValue(value) {
    const text = escapeHtml(value?.text || '');
    return value?.href ? `<a href="${escapeHtml(value.href)}">${text}</a>` : text;
  }

  function directCodeFromDirtySelection(rawText) {
    const text = clean(rawText);
    if (!text || /^(ASIN|ISBN|FNSku|FcSku|Title)\b/i.test(text)) return '';
    const match = text.match(/^([A-Z0-9]{10}|(?:X0|ZZ)[A-Z0-9]{8})(?=\s*(?:Madcat:|Size:|Pandash|L\d+|✅|🚫|☑|✔|✘|❌))/i);
    return match?.[1]?.toUpperCase() || '';
  }

  function installCopyCleaner() {
    document.addEventListener('copy', event => {
      const selection = window.getSelection?.();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
      const panel = readProductPanel();
      if (!panel || !selectionTouchesNode(selection, panel.table)) return;
      const raw = String(selection.toString() || '');
      const hasInjectedText = /(madcat:|size:|pandash|\bL\d+\b|✅|🚫)/i.test(clean(raw));
      const selectedUi = $$(UI_SELECTOR, panel.table).some(node => selectionTouchesNode(selection, node));
      const directCode = directCodeFromDirtySelection(raw);
      if (directCode) {
        const anchor = $$('a', panel.table).find(link => clean(link.textContent).toUpperCase() === directCode && selectionTouchesNode(selection, link));
        const value = { text: directCode, href: anchor?.href || anchor?.getAttribute('href') || '' };
        event.preventDefault();
        event.stopPropagation();
        event.clipboardData.setData('text/plain', value.text);
        event.clipboardData.setData('text/html', htmlValue(value));
        return;
      }
      const output = [];
      for (const entry of panel.rows.values()) {
        if (!/^(ASIN|ISBN|FNSku|FcSku|Title)$/i.test(entry.label)) continue;
        const labelTouched = selectionTouchesNode(selection, entry.labelCell);
        const valueTouched = selectionTouchesNode(selection, entry.valueCell);
        if (!labelTouched && !valueTouched) continue;
        if (/^Title$/i.test(entry.label) && valueTouched && !labelTouched && !hasInjectedText && !selectedUi) return;
        if (!/^(ASIN|ISBN|FNSku|FcSku)$/i.test(entry.label) && !labelTouched && !hasInjectedText && !selectedUi) continue;
        const rawValue = cleanProductCell(entry.valueCell);
        const value = { text: cleanCodeForLabel(entry.label, rawValue.text), href: rawValue.href };
        output.push({ mode: labelTouched && valueTouched ? 'row' : labelTouched ? 'label' : 'value', label: entry.label, value });
      }
      if (!output.length) return;
      const onlyValues = output.every(item => item.mode === 'value');
      const onlyLabels = output.every(item => item.mode === 'label');
      let text;
      let html;
      if (onlyValues) {
        text = output.map(item => item.value.text).join('\n');
        html = output.map(item => htmlValue(item.value)).join('<br>');
      } else if (onlyLabels) {
        text = output.map(item => item.label).join('\n');
        html = output.map(item => escapeHtml(item.label)).join('<br>');
      } else {
        text = output.map(item => item.mode === 'row' ? `${item.label} \t${item.value.text}` : item.mode === 'value' ? item.value.text : item.label).join('\n');
        html = `<table><tbody>${output.map(item => item.mode === 'row' ? `<tr><td>${escapeHtml(item.label)}&nbsp;</td><td>${htmlValue(item.value)}</td></tr>` : item.mode === 'value' ? `<tr><td>${htmlValue(item.value)}</td></tr>` : `<tr><td>${escapeHtml(item.label)}</td></tr>`).join('')}</tbody></table>`;
      }
      event.preventDefault();
      event.stopPropagation();
      event.clipboardData.setData('text/plain', text);
      event.clipboardData.setData('text/html', html);
    }, true);
  }

  const PROPERTY_LABELS = ['Sortable', 'Very High Value', 'Conveyable', 'Master Case'];

  function applyProductHighlights(panel) {
    if (!panel) return;
    for (const label of PROPERTY_LABELS) {
      const entry = panel.get(label);
      if (!entry) continue;
      entry.labelCell.classList.add('fcrm-prop-label');
      entry.valueCell.classList.remove('fcrm-prop-true', 'fcrm-prop-false');
      entry.valueCell.classList.add(norm(entry.text) === 'true' ? 'fcrm-prop-true' : 'fcrm-prop-false');
    }
  }

  function badgeHost(panel) {
    return panel?.dimensions?.valueCell || panel?.primary?.valueCell || null;
  }

  function ensureMadcatBadge(panel) {
    const host = badgeHost(panel);
    if (!host) return null;
    let badge = $('.fc-madcat-badge', host);
    if (!badge) {
      badge = markUi(document.createElement('span'));
      badge.className = 'fc-madcat-badge fcrm-madcat-loading';
      badge.textContent = 'Madcat: Loading…';
      host.appendChild(badge);
    }
    return badge;
  }

  function findInventoryHistoryContainer() {
    for (const selector of ['[data-section-type="inventory-history"]','[data-test-id*="inventory-history"]','[id*="inventory-history"]']) {
      const match = $(selector);
      if (match) return match;
    }
    for (const heading of $$('h1,h2,h3,h4,h5,h6')) {
      if (!/inventory history/i.test(clean(heading.textContent))) continue;
      return heading.closest('[data-section-type],.a-box,section') || heading.parentElement;
    }
    for (const table of $$('table')) {
      const text = clean(table.textContent);
      if (/inventory history/i.test(text) && /madcat|date|event|action/i.test(text)) return table.closest('[data-section-type],.a-box,section') || table;
    }
    return null;
  }

  function updateMadcat(panel) {
    const badge = ensureMadcatBadge(panel);
    if (!badge) return;
    const container = findInventoryHistoryContainer();
    if (!container) {
      badge.className = 'fc-madcat-badge fcrm-madcat-loading';
      badge.textContent = 'Madcat: Loading…';
      return;
    }
    const found = /madcat/i.test(clean(container.textContent));
    badge.className = `fc-madcat-badge ${found ? 'fcrm-madcat-yes' : 'fcrm-madcat-no'}`;
    badge.textContent = `Madcat: ${found ? 'Yes' : 'No'}`;
    $$('.fcrm-madcat-hit', container).forEach(row => row.classList.remove('fcrm-madcat-hit'));
    if (found) $$('tr', container).filter(row => /madcat/i.test(clean(row.textContent))).forEach(row => row.classList.add('fcrm-madcat-hit'));
  }

  const sizeState = { item: '', lastGood: '', busy: false, serial: 0 };

  function isValidSidelineContainer(value) { return /^(?:csX|tsX)[A-Za-z0-9]+$/i.test(clean(value)); }
  function isValidSidelineItem(value) { return /^(?:B[A-Z0-9]{9}|X[A-Z0-9]{9}|\d{8,14})$/i.test(clean(value)); }
  function clearSavedSidelineContainer() { GM_setValue(SIDELINE_CONTAINER_KEY, ''); GM_setValue(SIDELINE_CONTAINER_TIME_KEY, 0); }

  function getSavedSidelineContainer() {
    const value = clean(GM_getValue(SIDELINE_CONTAINER_KEY, ''));
    const savedAt = Number(GM_getValue(SIDELINE_CONTAINER_TIME_KEY, 0));
    if (!isValidSidelineContainer(value) || !savedAt || Date.now() - savedAt > SIDELINE_CONTAINER_MAX_AGE) {
      clearSavedSidelineContainer();
      return '';
    }
    return value;
  }

  function askSidelineContainer(current = '') {
    const entered = prompt('Enter valid Sideline source container (csX / tsX).\nSaved for 24 hours.', current);
    if (entered === null) return '';
    const value = clean(entered);
    if (!isValidSidelineContainer(value)) { alert('Invalid container. Must begin with csX or tsX.'); return ''; }
    GM_setValue(SIDELINE_CONTAINER_KEY, value);
    GM_setValue(SIDELINE_CONTAINER_TIME_KEY, Date.now());
    return value;
  }

  function currentSidelineItem(panel) {
    const queryValue = clean(new URLSearchParams(location.search).get('s'));
    if (isValidSidelineItem(queryValue)) return queryValue.toUpperCase();
    for (const input of $$('input')) if (isValidSidelineItem(input.value)) return clean(input.value).toUpperCase();
    return [panel?.asin?.text, panel?.isbn?.text, panel?.fnsku?.text, panel?.fcsku?.text].map(clean).find(isValidSidelineItem)?.toUpperCase() || '';
  }

  function makeSidelineRequestId() {
    const id = crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `amzn1.fc.v1.common.request-id.v1.AFTPoirotWebsite.${id}`;
  }

  function ensureSizeBadge(panel) {
    const host = badgeHost(panel);
    if (!host) return null;
    let badge = $('.fc-size-badge', host);
    if (!badge) {
      badge = markUi(document.createElement('span'));
      badge.className = 'fc-size-badge';
      badge.innerHTML = '<span class="fc-size-value">Size: Loading…</span><button type="button" class="fcrm-size-change">Change</button>';
      const change = $('.fcrm-size-change', badge);
      markUi(change);
      change.title = 'Change Sideline source container';
      change.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (askSidelineContainer(getSavedSidelineContainer())) runSizeLookup(readProductPanel(), true);
      });
      host.appendChild(badge);
    }
    return badge;
  }

  function setSizeText(panel, text, error = false) {
    const badge = ensureSizeBadge(panel);
    if (!badge) return;
    const value = $('.fc-size-value', badge);
    if (error && sizeState.lastGood) {
      badge.classList.remove('fcrm-size-error');
      if (value) value.textContent = `Size: ${sizeState.lastGood}`;
      badge.title = `Latest refresh failed: ${text}. Keeping last successful size.`;
      return;
    }
    badge.classList.toggle('fcrm-size-error', error);
    badge.title = '';
    if (value) value.textContent = `Size: ${text}`;
  }

  async function fetchSidelineSize(panel, item, container) {
    const serial = ++sizeState.serial;
    sizeState.busy = true;
    setSizeText(panel, 'Checking…');
    try {
      const response = await gmRequest({
        method: 'POST', url: SIDELINE_API, headers: { Accept: '*/*', 'Content-Type': 'application/json' },
        data: JSON.stringify({ containerScannableId: container, isMasterpack: null, itemAndonContext: null, itemBarcode: item, requestId: makeSidelineRequestId(), tool: 'V3' }),
        responseType: 'text', timeout: 15000
      });
      if (serial !== sizeState.serial) return;
      let payload;
      try { payload = JSON.parse(response.responseText || '{}'); } catch { throw new Error(`Bad response (${response.status})`); }
      const items = Array.isArray(payload.items) ? payload.items : [];
      const wanted = item.toUpperCase();
      const exact = items.find(entry => [entry?.scannableId,entry?.value,entry?.scannedBarcode,entry?.skuDetail?.fnSku,entry?.skuDetail?.asin,entry?.skuDetail?.fcSku].map(value => clean(value).toUpperCase()).includes(wanted));
      const result = exact || items.find(entry => entry?.binDescription) || items[0];
      if (result?.binDescription) {
        sizeState.lastGood = clean(result.binDescription);
        setSizeText(panel, sizeState.lastGood, false);
        window.dispatchEvent(new CustomEvent('fcrm:size-resolved', { detail: { item, container, size: sizeState.lastGood } }));
        return;
      }
      const message = String(payload.message || payload.errorMessage || payload.error || 'No size returned');
      if (/container|source/i.test(message)) clearSavedSidelineContainer();
      setSizeText(panel, message, true);
    } catch (error) {
      if (serial !== sizeState.serial) return;
      setSizeText(panel, error.message || 'Request failed', true);
    } finally {
      if (serial === sizeState.serial) sizeState.busy = false;
    }
  }

  function runSizeLookup(panel, force = false) {
    if (!panel) return;
    ensureSizeBadge(panel);
    const item = currentSidelineItem(panel);
    if (!item) return;
    if (item !== sizeState.item) {
      sizeState.serial++;
      sizeState.busy = false;
      sizeState.item = item;
      sizeState.lastGood = '';
    } else if (sizeState.busy) return;
    else if (!force) { if (sizeState.lastGood) setSizeText(panel, sizeState.lastGood, false); return; }
    const container = getSavedSidelineContainer();
    if (!container) { setSizeText(panel, 'Set container', true); return; }
    fetchSidelineSize(panel, item, container);
  }

  const hazMemory = new Map();
  let inventoryRunId = 0;
  let productRunId = 0;
  const hazKey = (fc, id) => `hz:${clean(fc).toUpperCase()}:${normaliseAsin(id)}`;
  const levelKey = fc => `fc_hazlvl:${clean(fc).toUpperCase()}`;

  async function getHazmat(id, fc, force = false) {
    if (!isAsin(id)) return null;
    const asin = normaliseAsin(id);
    const key = hazKey(fc, asin);
    const now = Date.now();
    if (!force) {
      const memory = hazMemory.get(key);
      if (memory && now - memory.ts < memory.ttl) return memory.value;
      const stored = gmGetJson(key);
      if (stored && stored.ok && now - stored.ts < HAZ_SUCCESS_TTL) {
        hazMemory.set(key, { ts: stored.ts, ttl: HAZ_SUCCESS_TTL, value: stored.value });
        return stored.value;
      }
    }
    let restriction = GM_getValue(levelKey(fc), null);
    if (!restriction && fc) {
      try {
        const response = await gmRequest({ url: `https://pandash.amazon.com/GridServlet?fc=${encodeURIComponent(fc)}` });
        restriction = response.response?.restriction || 'default';
        GM_setValue(levelKey(fc), restriction);
      } catch { restriction = 'default'; }
    }
    restriction ||= 'default';
    const data = `language=default&source=${restriction}-hazmat-FC&marketPlaces=${MARKETPLACE}&asins=${encodeURIComponent(asin)}&rows=1&page=1&fc=${encodeURIComponent(fc || '')}`;
    try {
      const response = await gmRequest({ method: 'POST', url: 'https://pandash.amazon.com/GridServlet', data, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      const row = response.response?.rows?.find(entry => String(entry.asin || '').toUpperCase() === asin);
      const value = row ? [Number(row.level || 0), String(row.message || '')] : null;
      const pack = { ts: Date.now(), ok: true, value };
      hazMemory.set(key, { ts: pack.ts, ttl: HAZ_SUCCESS_TTL, value });
      gmSetJson(key, pack);
      return value;
    } catch {
      hazMemory.set(key, { ts: Date.now(), ttl: HAZ_FAILURE_TTL, value: null });
      return null;
    }
  }

  function renderHazmatBadge(badge, result, { river = false, inventory = false } = {}) {
    if (!badge) return;
    if (!result) {
      badge.style.background = LEVEL_COLORS[0];
      badge.textContent = 'Hazmat N/A';
      badge.classList.remove('fc-river-l0');
      badge.setAttribute('role', 'status');
      badge.removeAttribute('tabindex');
      badge.title = '';
      return;
    }
    const level = clampLevel(result[0]);
    const message = String(result[1] || '');
    badge.style.background = LEVEL_COLORS[level] || LEVEL_COLORS[0];
    badge.textContent = inventory ? `L${level}${message.includes('can be processed') ? ' ✅' : ''}` : `L${level}${message.includes('can be processed') ? ' ✅' : ' 🚫'}`;
    const clickable = river && level === 0;
    badge.classList.toggle('fc-river-l0', clickable);
    badge.setAttribute('role', clickable ? 'button' : 'status');
    if (clickable) { badge.tabIndex = 0; badge.title = 'Create Hazmat RIVER ticket'; }
    else { badge.removeAttribute('tabindex'); badge.title = ''; }
  }

  function ensureProductHazmatUi(panel) {
    const host = panel?.primary?.valueCell;
    if (!host) return null;
    let badge = $('.fc-hazmat', host);
    if (!badge) { badge = markUi(document.createElement('span')); badge.className = 'fc-hazmat'; badge.textContent = 'Loading…'; host.appendChild(badge); }
    let button = $('.fcrm-top-recheck', host);
    if (!button) { button = markUi(document.createElement('button')); button.type = 'button'; button.className = 'fcrm-haz-refresh fcrm-top-recheck'; button.textContent = 'Pandash'; host.appendChild(button); }
    return { badge, button };
  }

  async function updateProductHazmat(panel, force = false) {
    if (!panel?.primaryId) return;
    const ui = ensureProductHazmatUi(panel);
    if (!ui) return;
    const runId = ++productRunId;
    const fc = getWarehouseId();
    if (!fc) return;
    if (force) setBusyButton(ui.button, true, 'Rechecking…');
    try {
      const result = await getHazmat(panel.primaryId, fc, force);
      if (runId !== productRunId || readProductPanel()?.signature !== panel.signature) return;
      renderHazmatBadge(ui.badge, result, { river: true });
      ui.button.onclick = async () => { const current = readProductPanel(); if (current) await Promise.all([updateProductHazmat(current, true), annotateInventory(true)]); };
    } finally { if (force) setBusyButton(ui.button, false); }
  }

  function findAsinInInventoryRow(row) {
    for (const link of $$('a', row)) {
      const match = clean(link.textContent).match(/\b[A-Z0-9]{10}\b/i);
      if (!match) continue;
      const asin = normaliseAsin(match[0]);
      if (isAsin(asin)) return { asin, link };
    }
    return null;
  }

  function ensureInventoryPill(cell) {
    let pill = $('.fcrm-haz-pill', cell);
    if (!pill) {
      pill = markUi(document.createElement('span'));
      pill.className = 'fcrm-haz-pill fcrm-inline';
      const link = $('a', cell);
      if (link) link.after(pill); else cell.appendChild(pill);
    }
    return pill;
  }

  async function runWithConcurrency(items, limit, worker) {
    if (!items.length) return;
    let index = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (index < items.length) await worker(items[index++]);
    }));
  }

  async function annotateInventory(force = false) {
    const table = getInventoryTable();
    const fc = getWarehouseId();
    if (!table || !fc) return;
    const rows = getInventoryRows(table);
    if (!rows.length) return;
    const runId = ++inventoryRunId;
    const grouped = new Map();
    for (const row of rows) {
      const hit = findAsinInInventoryRow(row);
      if (!hit) continue;
      const cell = hit.link.closest('td') || row.cells?.[0];
      if (!cell) continue;
      const pill = ensureInventoryPill(cell);
      if (!force && $('.fc-badge', pill)) continue;
      if (!grouped.has(hit.asin)) grouped.set(hit.asin, []);
      grouped.get(hit.asin).push(pill);
    }
    const work = [...grouped.entries()].map(([asin, pills]) => ({ asin, pills }));
    await runWithConcurrency(work, MAX_PARALLEL, async ({ asin, pills }) => {
      if (runId !== inventoryRunId) return;
      const result = await getHazmat(asin, fc, force);
      if (runId !== inventoryRunId) return;
      for (const pill of pills) {
        if (!pill.isConnected) continue;
        let badge = $('.fc-badge', pill);
        if (!badge) { badge = markUi(document.createElement('span')); badge.className = 'fc-badge'; pill.appendChild(badge); }
        renderHazmatBadge(badge, result, { inventory: true });
      }
    });
  }

  function ensureInventoryRefreshButton() {
    if ($('.fcrm-grid-recheck')) return;
    const candidates = $$('button,span,a,input[type="button"]');
    const reference = candidates.find(element => /show pod p-levels/i.test(element.textContent || element.value || '')) || candidates.find(element => /analyze container/i.test(element.textContent || element.value || ''));
    if (!reference?.parentNode) return;
    const button = markUi(document.createElement('button'));
    button.type = 'button';
    button.className = 'fcrm-haz-refresh fcrm-grid-recheck';
    button.textContent = 'Re-check Hazmat';
    button.addEventListener('click', async () => { setBusyButton(button, true, 'Rechecking…'); try { await annotateInventory(true); } finally { setBusyButton(button, false); } });
    reference.parentNode.insertBefore(button, reference.nextSibling);
  }

  function updateQtyWidth(input) {
    const length = Math.max(1, String(input?.value || '').length);
    if (input) input.style.width = `${Math.max(3.35, Math.min(4.6, length + 1.15))}ch`;
  }

  function sanitiseQty(input, requireValue = false) {
    if (!input) return null;
    let value = String(input.value || '').replace(/\D+/g, '').slice(0, 4).replace(/^0+/, '');
    if (!value) { input.value = ''; updateQtyWidth(input); if (requireValue) { input.focus(); input.select?.(); } return null; }
    const quantity = Math.max(1, parseInt(value, 10) || 1);
    input.value = String(quantity);
    updateQtyWidth(input);
    return quantity;
  }

  function makeQtyInput() {
    const input = markUi(document.createElement('input'));
    input.type = 'text'; input.inputMode = 'numeric'; input.autocomplete = 'off'; input.spellcheck = false; input.maxLength = 4; input.className = 'fcrm-qty'; input.setAttribute('aria-label', 'Print quantity');
    input.addEventListener('input', () => { input.value = String(input.value || '').replace(/\D+/g, '').slice(0, 4); updateQtyWidth(input); });
    input.addEventListener('blur', () => sanitiseQty(input));
    input.addEventListener('keydown', event => { if (event.key !== 'Enter') return; event.preventDefault(); event.stopPropagation(); const quantity = sanitiseQty(input, true); if (quantity && typeof input._fcrmPrint === 'function') input._fcrmPrint(quantity); });
    updateQtyWidth(input);
    return input;
  }

  function quickPrint(code, quantity = 1, description = '', type = 'ASIN') {
    const cleanCode = normalisePrintCode(code);
    if (!cleanCode) return;
    const qty = Math.max(1, parseInt(String(quantity).replace(/\D+/g, ''), 10) || 1);
    const badgeId = getCookie('fcmenu-employeeId');
    const sequence = Math.floor(Math.random() * 1e10);
    const url = `http://localhost:5965/printer?action=print&type=barcode&data=${asciiHex(cleanCode)}&text=${asciiHex(cleanCode)}&quantity=${qty}&desc=${asciiHex(description)}&badgeid=${badgeId}&seq=${sequence}`;
    fetch(url).then(() => console.log(`[FCRM ${VERSION}] ${type} printed`)).catch(() => alert('Printmon not running or printer not connected.'));
  }

  function attachPrintTrigger(entry, key, label, callback) {
    if (!entry?.labelCell) return;
    let trigger = $(`.fcrm-stealth-trigger[data-key="${key}"]`, entry.labelCell);
    if (!trigger) {
      const text = clean(entry.labelCell.textContent || label) || label;
      entry.labelCell.textContent = '';
      trigger = document.createElement('span');
      trigger.className = 'fcrm-stealth-trigger'; trigger.dataset.key = key; trigger.setAttribute('role', 'button'); trigger.tabIndex = 0; trigger.textContent = text; trigger.title = `Click to print ${label}`;
      entry.labelCell.appendChild(trigger);
    }
    trigger.onclick = event => { event.preventDefault(); event.stopPropagation(); callback(); };
    trigger.onkeydown = event => { if (event.key !== 'Enter' && event.key !== ' ') return; event.preventDefault(); callback(); };
  }

  function ensurePrintControls(panel) {
    if (!panel?.title) return;
    const title = clean(panel.title.text);
    const primary = panel.primary;
    const primaryCode = panel.primaryId;
    if (primary?.valueCell && primaryCode) {
      let group = $('.fcrm-primary-print', primary.valueCell);
      if (!group) { group = markUi(document.createElement('span')); group.className = 'fcrm-inline fcrm-primary-print'; group.appendChild(makeQtyInput()); primary.valueCell.appendChild(group); }
      const input = $('.fcrm-qty', group);
      input._fcrmPrint = quantity => quickPrint(primaryCode, quantity, title, panel.asin ? 'ASIN' : 'ISBN');
      attachPrintTrigger(primary, 'primary-print', panel.asin ? 'ASIN' : 'ISBN', () => quickPrint(primaryCode, 1, title, panel.asin ? 'ASIN' : 'ISBN'));
    }
    if (panel.fnsku?.valueCell && panel.fnskuId) {
      let group = $('.fcrm-fnsku-print', panel.fnsku.valueCell);
      if (!group) { group = markUi(document.createElement('span')); group.className = 'fcrm-inline fcrm-fnsku-print'; group.appendChild(makeQtyInput()); panel.fnsku.valueCell.appendChild(group); }
      const input = $('.fcrm-qty', group);
      input._fcrmPrint = quantity => quickPrint(panel.fnskuId, quantity, title, 'FNSku');
      attachPrintTrigger(panel.fnsku, 'fnsku-print', 'FNSku', () => quickPrint(panel.fnskuId, 1, title, 'FNSku'));
    }
  }

  const PRINT_PATTERNS = [/\b(FBA[A-Za-z0-9]{6,})\b/,/\b(X0[A-Za-z0-9]{8})\b/,/\b(ZZ[A-Za-z0-9]{8})\b/,/\b(LPN[A-Za-z0-9-]{4,})\b/i,/\b([A-Za-z0-9]{10})\b/];
  function extractPrintableCodeFromText(value) { const text = clean(value); for (const pattern of PRINT_PATTERNS) { const match = text.match(pattern); if (match?.[1]) return normalisePrintCode(match[1]); } return ''; }

  function extractPrintableCodeFromTarget(target) {
    if (!(target instanceof Element)) return '';
    const candidates = [];
    const add = value => { if (value) candidates.push(value); };
    const anchor = target.closest('a');
    if (anchor) { add(anchor.textContent); add(anchor.innerText); add(anchor.title); add(anchor.getAttribute('aria-label')); }
    const cell = target.closest('td,th');
    if (cell) { add(cell.textContent); add(cell.innerText); }
    add(target.textContent); add(target.innerText);
    for (const value of candidates) { const code = extractPrintableCodeFromText(value); if (code) return code; }
    return clean(target.textContent || '');
  }

  function inferPrintType(code) {
    const value = upperForCompare(code);
    if (/^FBA[A-Z0-9]{6,}$/.test(value)) return 'FBA';
    if (/^X0[A-Z0-9]{8}$/.test(value)) return 'FNSku';
    if (/^ZZ[A-Z0-9]{8}$/.test(value)) return 'FCSKU';
    if (/^[A-Z0-9]{10}$/.test(value)) return 'ASIN';
    return 'GENERIC';
  }

  function productTitle() { return clean(readProductPanel()?.title?.text || ''); }
  function titleFromRow(row) { const table = row?.closest('table'); const index = findColumnIndex(table, [/(^|\b)title(\b|$)/,/(^|\b)product(\b|$)/,/(^|\b)description(\b|$)/,/(^|\b)item\s*name(\b|$)/]); return index >= 0 ? clean($$('td', row)[index]?.textContent || '') : ''; }
  function skuAnchorFromRow(row) { const table = row?.closest('table'); const index = findColumnIndex(table, [/(^|\b)sku(\b|$)/,/(^|\b)fnsku(\b|$)/,/(^|\b)fcsku(\b|$)/,/(^|\b)asin(\b|$)/,/(^|\b)isbn(\b|$)/]); return index >= 0 ? $('a', $$('td', row)[index]) : $('a', row); }

  async function waitForProductTitle(targetUpper, timeout = 2500) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const panel = readProductPanel(); if (panel?.title?.text && panel.primaryId === targetUpper) return clean(panel.title.text); await sleep(80); }
    return '';
  }

  function installAltPrint() {
    for (const eventName of ['pointerdown', 'mousedown', 'auxclick']) document.addEventListener(eventName, event => { if (!event.altKey || !extractPrintableCodeFromTarget(event.target)) return; event.preventDefault(); event.stopPropagation(); }, true);
    document.addEventListener('click', async event => {
      if (!event.altKey) return;
      const code = extractPrintableCodeFromTarget(event.target);
      if (!code) return;
      event.preventDefault(); event.stopPropagation();
      if (/\bLPN\b/i.test(code)) { if (!confirm(`Barcode: ${code}\n\nLPNs are unique and should not be printed.\nPress OK to continue, or Cancel to stop.`)) return; quickPrint(code, 1, '', 'LPN'); return; }
      const type = inferPrintType(code);
      if (type === 'FBA' || type === 'GENERIC') { quickPrint(code, 1, '', type); return; }
      const row = event.target instanceof Element ? event.target.closest('tr') : null;
      let title = titleFromRow(row);
      if (!title && row) { const anchor = skuAnchorFromRow(row); if (anchor) { const target = upperForCompare(code); anchor.click(); title = await waitForProductTitle(target, 2500); } }
      if (!title) title = productTitle();
      quickPrint(code, 1, title, type);
    }, true);
  }

  let lastProductSignature = '';
  let refreshBusy = false;
  let refreshPending = false;

  async function refreshPage() {
    if (refreshBusy) { refreshPending = true; return; }
    refreshBusy = true;
    try {
      paintPurchaseOrders();
      const panel = readProductPanel();
      if (panel) {
        const changed = panel.signature !== lastProductSignature;
        lastProductSignature = panel.signature;
        applyProductHighlights(panel);
        ensureMadcatBadge(panel);
        ensureSizeBadge(panel);
        ensurePrintControls(panel);
        ensureProductHazmatUi(panel);
        updateMadcat(panel);
        runSizeLookup(panel, false);
        if (changed || $('.fc-hazmat', panel.primary?.valueCell)?.textContent === 'Loading…') updateProductHazmat(panel, false);
      }
      ensureInventoryRefreshButton();
      annotateInventory(false);
    } catch (error) { console.error(`[FCRM ${VERSION}] refresh failed`, error); }
    finally { refreshBusy = false; if (refreshPending) { refreshPending = false; queueMicrotask(refreshPage); } }
  }

  const scheduleRefresh = debounce(refreshPage, 120);

  function mutationNeedsRefresh(records) {
    for (const record of records) {
      if (record.target instanceof Element && record.target.closest(UI_SELECTOR)) continue;
      const changedNodes = [...record.addedNodes, ...record.removedNodes];
      if (!changedNodes.length) return true;
      if (changedNodes.some(node => !(node instanceof Element) || (!node.matches(UI_SELECTOR) && !node.closest?.(UI_SELECTOR)))) return true;
    }
    return false;
  }

  function startObserver() {
    const observer = new MutationObserver(records => { if (mutationNeedsRefresh(records)) scheduleRefresh(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('click', event => { if (event.target instanceof Element && event.target.closest('#table-inventory thead th')) setTimeout(scheduleRefresh, 150); }, true);
    window.addEventListener('hashchange', scheduleRefresh, true);
    window.addEventListener('popstate', scheduleRefresh, true);
  }

  injectStyles();
  installCopyCleaner();
  installAltPrint();
  startObserver();
  refreshPage();
})();
