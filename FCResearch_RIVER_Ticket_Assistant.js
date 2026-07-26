// ==UserScript==
// @name         FCResearch → RIVER Ticket Assistant v0.2.15
// @namespace    bwu2-ticket-assistant
// @version      0.2.15
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/FCResearch_RIVER_Ticket_Assistant.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/FCResearch_RIVER_Ticket_Assistant.js
// @description  Launches RIVER from the PanDash L0 badge and pulls newest PO/vendor directly from FCResearch.
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

  function findLabelValue(names, root = document) {
    const wanted = names.map(norm);
    for (const row of root.querySelectorAll('tr')) {
      const cells = [...row.querySelectorAll(':scope > th, :scope > td')];
      if (cells.length < 2) continue;
      if (!wanted.includes(norm(cells[0].textContent))) continue;
      return clean(cells[1].querySelector('a')?.textContent || cells[1].textContent);
    }
    return '';
  }

  function headersFor(table) {
    let best = [];
    let bestScore = -1;
    for (const row of table.querySelectorAll('tr')) {
      const cells = [...row.children].filter(el => el.matches?.('th,td'));
      const headers = cells.map(cell => norm(cell.textContent));
      const score = ['purchase order', 'inventory owner', 'placed', 'confirmed']
        .filter(name => headers.some(header => header === name || header.startsWith(name + ' '))).length;
      if (score > bestScore) {
        bestScore = score;
        best = headers;
      }
    }
    return best;
  }

  function headerIndex(headers, names) {
    const wanted = names.map(norm);
    return headers.findIndex(header => wanted.some(name => header === name || header.startsWith(name + ' ')));
  }

  function parseDate(text) {
    const time = Date.parse(clean(text).replace(' ', 'T'));
    return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
  }

  function newestPO() {
    for (const table of document.querySelectorAll('table')) {
      const headers = headersFor(table);
      const poI = headerIndex(headers, ['Purchase Order']);
      const ownerI = headerIndex(headers, ['Inventory Owner']);
      const placedI = headerIndex(headers, ['Placed']);
      const confirmedI = headerIndex(headers, ['Confirmed']);
      if (poI < 0 || ownerI < 0 || (placedI < 0 && confirmedI < 0)) continue;

      const rows = [];
      for (const row of table.querySelectorAll('tbody tr, tr')) {
        const cells = [...row.children].filter(el => el.matches?.('th,td'));
        if (!cells.length || !cells[poI]) continue;
        const po = clean(cells[poI].textContent);
        if (!/^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{6,20}$/i.test(po)) continue;
        const placed = placedI >= 0 ? clean(cells[placedI]?.textContent) : '';
        const confirmed = confirmedI >= 0 ? clean(cells[confirmedI]?.textContent) : '';
        rows.push({
          po,
          orderDate: placed || confirmed,
          timestamp: Math.max(parseDate(placed), parseDate(confirmed))
        });
      }
      rows.sort((a, b) => b.timestamp - a.timestamp);
      if (rows[0]) return rows[0];
    }
    return null;
  }

  function validVendor(value) {
    const code = clean(value).toUpperCase();
    return /^[A-Z0-9]{1,6}$/.test(code) && code !== 'N/A' ? code : '';
  }

  function fetchVendorFromPO(po) {
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
        timeout: 15000,
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
    const po = newestPO();

    if (!asin) throw new Error('ASIN not found');
    if (!title) throw new Error('Title not found');

    const vendorCode = po ? await fetchVendorFromPO(po.po) : '';

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

  function installFCResearchClick() {
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
        GM_setValue(STORAGE_KEY, await buildPayload());
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

  if (/fcresearch|qifcr/i.test(location.hostname)) installFCResearchClick();
})();
