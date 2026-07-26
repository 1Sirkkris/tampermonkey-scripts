// ==UserScript==
// @name         FCResearch → RIVER Ticket Assistant v0.2.19
// @namespace    bwu2-ticket-assistant
// @version      0.2.19
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/FCResearch_RIVER_Ticket_Assistant.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/FCResearch_RIVER_Ticket_Assistant.js
// @description  Launches RIVER from PanDash L0 and pulls newest PO/vendor directly from FCResearch.
// @match        *://qi-fcresearch-fe.corp.amazon.com/*
// @match        *://fcresearch-fe.aka.amazon.com/*
// @match        *://qi-fcresearch-jp.corp.amazon.com/*
// @match        *://qifcr.fe.aftx.amazonoperations.app/*
// @match        https://river.amazon.com/*
// @require      https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/FCResearch_RIVER_Ticket_Assistant_core_v0.2.10.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_openInTab
// @grant        GM_xmlhttpRequest
// @connect      qi-fcresearch-fe.corp.amazon.com
// @connect      fcresearch-fe.aka.amazon.com
// @connect      qi-fcresearch-jp.corp.amazon.com
// @connect      qifcr.fe.aftx.amazonoperations.app
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const STORAGE_KEY = 'bwu2_ticket_assistant_payload_v3';
  const RIVER_URL = 'https://river.amazon.com/BWU2/workflows?buildingType=fc&q0=3654ec14-7232-4f65-84c3-87927cdb4d0c&q1=0dbb253e-c43a-4a8b-a316-e32b8ab9be21&id=0dbb253e-c43a-4a8b-a316-e32b8ab9be21';
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const norm = value => clean(value).toLowerCase();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function removeLegacyPanel() {
    const remove = () => document.getElementById('bwu2-ticket-assistant')?.remove();
    remove();
    const style = document.createElement('style');
    style.textContent = '#bwu2-ticket-assistant{display:none!important}';
    document.documentElement.appendChild(style);
    new MutationObserver(remove).observe(document.documentElement, { childList: true, subtree: true });
  }

  function rowCells(row) {
    return [...row.children].filter(node => node.matches?.('th,td'));
  }

  function findLabelValue(names, root = document) {
    const wanted = names.map(norm);
    for (const row of root.querySelectorAll('tr')) {
      const cells = rowCells(row);
      if (cells.length < 2) continue;
      if (!wanted.includes(norm(cells[0].textContent))) continue;
      return clean(cells[1].querySelector('a')?.textContent || cells[1].textContent);
    }
    return '';
  }

  function tableHeaders(table) {
    const candidates = [];
    const addRows = root => {
      if (!root) return;
      for (const row of root.querySelectorAll('tr')) {
        const cells = rowCells(row);
        if (!cells.length) continue;
        const headers = cells.map(cell => norm(cell.textContent));
        const score = ['purchase order', 'inventory owner', 'fc', 'condition', 'placed', 'confirmed', 'date', 'order date']
          .filter(target => headers.some(header => header === target || header.startsWith(`${target} `))).length;
        candidates.push({ headers, score });
      }
    };

    addRows(table);
    const wrapper = table.closest('.dataTables_wrapper, .dataTables_scroll') || table.parentElement;
    if (wrapper && wrapper !== table) addRows(wrapper);
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] || null;
  }

  function indexOf(headers, aliases) {
    return headers.findIndex(header => aliases.some(alias => header === alias || header.startsWith(`${alias} `)));
  }

  function parseDate(value) {
    const match = clean(value).match(/(\d{4})-(\d{2})-(\d{2})(?:\s+|T)(\d{2}):(\d{2}):(\d{2})/);
    if (!match) return Number.NEGATIVE_INFINITY;
    const [, y, m, d, hh, mm, ss] = match;
    return Date.UTC(+y, +m - 1, +d, +hh, +mm, +ss);
  }

  function validPO(value) {
    const po = clean(value).toUpperCase();
    return /^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{6,20}$/.test(po) ? po : '';
  }

  function newestPO() {
    const candidates = [];

    for (const table of document.querySelectorAll('table')) {
      const header = tableHeaders(table);
      if (!header || header.score < 2) continue;

      const poIndex = indexOf(header.headers, ['purchase order']);
      if (poIndex < 0) continue;
      const placedIndex = indexOf(header.headers, ['placed']);
      const confirmedIndex = indexOf(header.headers, ['confirmed']);
      const dateIndex = indexOf(header.headers, ['date']);
      const orderDateIndex = indexOf(header.headers, ['order date']);

      for (const row of table.querySelectorAll('tbody tr, tr')) {
        const cells = rowCells(row);
        if (!cells[poIndex]) continue;
        const po = validPO(cells[poIndex].textContent);
        if (!po) continue;

        const placed = placedIndex >= 0 ? clean(cells[placedIndex]?.textContent) : '';
        const confirmed = confirmedIndex >= 0 ? clean(cells[confirmedIndex]?.textContent) : '';
        const date = dateIndex >= 0 ? clean(cells[dateIndex]?.textContent) : '';
        const orderDate = orderDateIndex >= 0 ? clean(cells[orderDateIndex]?.textContent) : '';
        candidates.push({
          po,
          orderDate: placed || confirmed || date || orderDate,
          timestamp: Math.max(parseDate(placed), parseDate(confirmed), parseDate(date), parseDate(orderDate))
        });
      }
    }

    const unique = new Map();
    for (const item of candidates) {
      const current = unique.get(item.po);
      if (!current || item.timestamp > current.timestamp) unique.set(item.po, item);
    }
    return [...unique.values()].sort((a, b) => b.timestamp - a.timestamp)[0] || null;
  }

  async function waitForPO(timeoutMs = 2000) {
    const deadline = Date.now() + timeoutMs;
    let po = newestPO();
    while (!po && Date.now() < deadline) {
      await sleep(100);
      po = newestPO();
    }
    return po;
  }

  function validVendor(value) {
    const code = clean(value).toUpperCase();
    return /^[A-Z0-9]{1,6}$/.test(code) && code !== 'N/A' ? code : '';
  }

  function fetchVendor(po) {
    return new Promise(resolve => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: `${location.origin}/BWU2/results/purchase-order`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Accept': 'text/html, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest'
        },
        data: `s=${encodeURIComponent(po)}`,
        timeout: 5000,
        onload: response => {
          if (response.status < 200 || response.status >= 300) return resolve('');
          const doc = new DOMParser().parseFromString(response.responseText, 'text/html');
          resolve(validVendor(findLabelValue(['Vendor Code'], doc)));
        },
        onerror: () => resolve(''),
        ontimeout: () => resolve('')
      });
    });
  }

  function inventoryQuantity() {
    const table = document.querySelector('#table-inventory');
    if (!table) return 0;
    const wrapper = table.closest('.dataTables_wrapper') || table.parentElement;
    for (const th of wrapper?.querySelectorAll('th') || []) {
      const match = clean(th.textContent).match(/^quantity\s*\(([\d,]+)\)/i);
      if (match) return Number(match[1].replace(/,/g, '')) || 0;
    }
    return 0;
  }

  function formatCost(value) {
    const text = clean(value);
    if (!text) return 'n/a';
    if (/^AUD\b/i.test(text)) return text;
    const match = text.match(/\d+(?:,\d{3})*(?:\.\d+)?/);
    return match ? `AUD ${match[0].replace(/,/g, '')}` : text;
  }

  async function buildPayload() {
    const asin = findLabelValue(['ASIN']);
    const rawFnsku = findLabelValue(['FNSku', 'FNSKU']);
    const fnsku = /^X0[A-Z0-9]+$/i.test(rawFnsku) ? rawFnsku : '';
    const title = findLabelValue(['Title']);
    const sortableText = norm(findLabelValue(['Sortable']));
    const po = await waitForPO();
    const vendorCode = po ? await fetchVendor(po.po) : '';

    if (!asin) throw new Error('ASIN not found');
    if (!title) throw new Error('Title not found');

    return {
      asin,
      fnsku,
      processingId: fnsku || asin,
      title,
      purchaseOrder: po?.po || 'n/a - no PO available',
      vendorCode: vendorCode || 'n/a',
      inventoryCost: formatCost(findLabelValue(['List Price'])),
      physicalLocation: 'N/A',
      orderDate: po?.orderDate || '',
      sortable: sortableText === 'true' || sortableText === 'yes',
      inventoryQuantity: inventoryQuantity(),
      shipmentsImpacted: 0,
      sourceUrl: location.href,
      capturedAt: Date.now()
    };
  }

  function installClick() {
    let busy = false;
    const handler = async event => {
      if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
      const badge = event.target instanceof Element
        ? event.target.closest('[data-section-type="product"] .fc-hazmat.fc-river-l0')
        : null;
      if (!badge || busy) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      busy = true;
      badge.setAttribute('aria-busy', 'true');

      try {
        const payload = await buildPayload();
        GM_setValue(STORAGE_KEY, payload);
        GM_openInTab(RIVER_URL, { active: true, insert: true, setParent: true });
      } catch (error) {
        alert(`RIVER Ticket Assistant failed: ${error.message}`);
      } finally {
        busy = false;
        badge.removeAttribute('aria-busy');
      }
    };

    document.addEventListener('click', handler, true);
    document.addEventListener('keydown', handler, true);
  }

  if (location.hostname === 'river.amazon.com') removeLegacyPanel();
  else if (/fcresearch|qifcr/i.test(location.hostname)) installClick();
})();
