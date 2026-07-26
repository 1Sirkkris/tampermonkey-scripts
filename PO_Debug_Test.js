// ==UserScript==
// @name         FCResearch PO Debug Test v0.1
// @version      0.1
// @description  Temporary PO detection tester for the RIVER Ticket Assistant.
// @match        *://qi-fcresearch-fe.corp.amazon.com/*
// @match        *://fcresearch-fe.aka.amazon.com/*
// @match        *://qi-fcresearch-jp.corp.amazon.com/*
// @match        *://qifcr.fe.aftx.amazonoperations.app/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const norm = value => clean(value).toLowerCase();

  function rowCells(row) {
    return [...row.children].filter(node => node.matches?.('th,td'));
  }

  function tableHeaders(table) {
    const candidates = [];
    const addRows = root => {
      if (!root) return;
      for (const row of root.querySelectorAll('tr')) {
        const cells = rowCells(row);
        if (!cells.length) continue;
        const headers = cells.map(cell => norm(cell.textContent));
        const score = ['purchase order', 'inventory owner', 'fc', 'condition', 'placed', 'confirmed']
          .filter(target => headers.some(header => header === target || header.startsWith(`${target} `))).length;
        candidates.push({ row, cells, headers, score });
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
    const match = clean(value).match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (!match) return Number.NEGATIVE_INFINITY;
    const [, y, m, d, hh, mm, ss] = match;
    return Date.UTC(+y, +m - 1, +d, +hh, +mm, +ss);
  }

  async function runTest() {
    const report = [];
    const candidates = [];

    for (const [tableNumber, table] of [...document.querySelectorAll('table')].entries()) {
      const header = tableHeaders(table);
      if (!header || header.score < 3) continue;

      const poIndex = indexOf(header.headers, ['purchase order']);
      const ownerIndex = indexOf(header.headers, ['inventory owner']);
      const placedIndex = indexOf(header.headers, ['placed']);
      const confirmedIndex = indexOf(header.headers, ['confirmed']);

      report.push(`Table ${tableNumber}: score=${header.score} headers=${header.headers.join(' | ')}`);
      if (poIndex < 0 || ownerIndex < 0 || (placedIndex < 0 && confirmedIndex < 0)) continue;

      for (const row of table.querySelectorAll('tbody tr, tr')) {
        const cells = rowCells(row);
        if (cells.length <= Math.max(poIndex, ownerIndex, placedIndex, confirmedIndex)) continue;
        const po = clean(cells[poIndex]?.textContent);
        if (!/^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{6,20}$/i.test(po)) continue;

        const placed = placedIndex >= 0 ? clean(cells[placedIndex]?.textContent) : '';
        const confirmed = confirmedIndex >= 0 ? clean(cells[confirmedIndex]?.textContent) : '';
        const link = cells[poIndex]?.querySelector('a');
        candidates.push({
          po,
          owner: clean(cells[ownerIndex]?.textContent),
          placed,
          confirmed,
          timestamp: Math.max(parseDate(placed), parseDate(confirmed)),
          href: link?.href || link?.getAttribute('href') || ''
        });
      }
    }

    candidates.sort((a, b) => b.timestamp - a.timestamp);
    const newest = candidates[0] || null;
    let peekStatus = 'not attempted';
    let vendor = '';

    if (newest?.href) {
      try {
        const url = new URL(newest.href, location.href).href;
        const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
        peekStatus = `HTTP ${response.status}`;
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        for (const row of doc.querySelectorAll('tr')) {
          const cells = rowCells(row);
          if (cells.length < 2) continue;
          if (norm(cells[0].textContent) === 'vendor code') {
            vendor = clean(cells[1].textContent);
            break;
          }
        }
      } catch (error) {
        peekStatus = `ERROR: ${error.message}`;
      }
    }

    const message = [
      `Newest PO: ${newest?.po || 'NOT FOUND'}`,
      `Owner: ${newest?.owner || 'N/A'}`,
      `Placed: ${newest?.placed || 'N/A'}`,
      `Confirmed: ${newest?.confirmed || 'N/A'}`,
      `PO link: ${newest?.href || 'MISSING'}`,
      `Peek: ${peekStatus}`,
      `Vendor: ${vendor || 'NOT FOUND'}`,
      '',
      `Candidate count: ${candidates.length}`,
      '',
      ...report.slice(0, 8)
    ].join('\n');

    console.group('[PO Debug Test]');
    console.log({ newest, candidates, report, peekStatus, vendor });
    console.groupEnd();
    alert(message);
  }

  function installButton() {
    if (document.querySelector('#po-debug-test')) return;
    const badge = document.querySelector('[data-section-type="product"] .fc-hazmat');
    if (!badge?.parentElement) return;

    const button = document.createElement('button');
    button.id = 'po-debug-test';
    button.type = 'button';
    button.textContent = 'TEST PO';
    button.style.marginLeft = '6px';
    button.style.cursor = 'pointer';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      void runTest();
    });
    badge.insertAdjacentElement('afterend', button);
  }

  const observer = new MutationObserver(installButton);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  installButton();
})();
