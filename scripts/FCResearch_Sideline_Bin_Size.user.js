// ==UserScript==
// @name         v0.1.0 FCResearch Sideline Bin Size
// @namespace    https://github.com/1Sirkkris
// @version      0.1.0
// @description  Pulls Sideline binDescription into FCResearch using a user-supplied csX/tsX container.
// @author       1Sirkkris / ChatGPT
// @match        http://fcresearch-fe.aka.amazon.com/*
// @match        https://fcresearch-fe.aka.amazon.com/*
// @match        http://qi-fcresearch-fe.corp.amazon.com/*
// @match        https://qi-fcresearch-fe.corp.amazon.com/*
// @match        http://qi-fcresearch-jp.corp.amazon.com/*
// @match        https://qi-fcresearch-jp.corp.amazon.com/*
// @match        http://qifcr.fe.aftx.amazonoperations.app/*
// @match        https://qifcr.fe.aftx.amazonoperations.app/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      aft-poirot-website-nrt.nrt.proxy.amazon.com
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/FCResearch_Sideline_Bin_Size.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/FCResearch_Sideline_Bin_Size.user.js
// ==/UserScript==

(() => {
  'use strict';

  const API_URL = 'https://aft-poirot-website-nrt.nrt.proxy.amazon.com/api/scanitem';
  const STORAGE_KEY = 'fcr_sideline_container';
  const STORAGE_TIME_KEY = 'fcr_sideline_container_saved_at';
  const MAX_AGE_MS = 24 * 60 * 60 * 1000;
  const ROW_ID = 'fcr-sideline-bin-size-row';

  let lastFnsku = '';
  let lookupTimer = null;

  function normaliseContainer(value) {
    return String(value || '').trim();
  }

  function isValidContainer(value) {
    return /^(?:csX|tsX)[A-Za-z0-9]+$/i.test(normaliseContainer(value));
  }

  function clearSavedContainer() {
    GM_setValue(STORAGE_KEY, '');
    GM_setValue(STORAGE_TIME_KEY, 0);
  }

  function getSavedContainer() {
    const container = normaliseContainer(GM_getValue(STORAGE_KEY, ''));
    const savedAt = Number(GM_getValue(STORAGE_TIME_KEY, 0));

    if (!isValidContainer(container) || !savedAt || Date.now() - savedAt > MAX_AGE_MS) {
      clearSavedContainer();
      return '';
    }

    return container;
  }

  function askForContainer(current = '') {
    const entered = prompt(
      'Enter a valid Sideline source container (csX / tsX).\nSaved for 24 hours.',
      current
    );

    if (entered === null) return '';

    const container = normaliseContainer(entered);
    if (!isValidContainer(container)) {
      alert('Invalid container. It must begin with csX or tsX.');
      return askForContainer(current);
    }

    GM_setValue(STORAGE_KEY, container);
    GM_setValue(STORAGE_TIME_KEY, Date.now());
    return container;
  }

  function getContainer() {
    return getSavedContainer() || askForContainer();
  }

  function findProductRows() {
    return [...document.querySelectorAll('tr')];
  }

  function getLabelText(row) {
    const firstCell = row?.querySelector('th, td');
    return firstCell?.textContent?.trim().replace(/\s+/g, ' ') || '';
  }

  function findRow(label) {
    const wanted = label.toLowerCase();
    return findProductRows().find(row => getLabelText(row).toLowerCase() === wanted) || null;
  }

  function extractFnsku() {
    const row = findRow('FNSku');
    if (row) {
      const cells = row.querySelectorAll('th, td');
      const value = [...cells].slice(1).map(cell => cell.textContent.trim()).join(' ');
      const match = value.match(/\b(?:X\d{9}|B[A-Z0-9]{9})\b/i);
      if (match) return match[0].toUpperCase();
    }

    const pageText = document.body?.innerText || '';
    const match = pageText.match(/FNSku\s*\n?\s*(X\d{9})\b/i);
    return match ? match[1].toUpperCase() : '';
  }

  function ensureDisplayRow() {
    let row = document.getElementById(ROW_ID);
    if (row) return row;

    const dimensionsRow = findRow('Dimensions');
    if (!dimensionsRow || !dimensionsRow.parentElement) return null;

    row = document.createElement('tr');
    row.id = ROW_ID;

    const labelCell = document.createElement('td');
    labelCell.textContent = 'Bin description';
    labelCell.style.fontWeight = '700';

    const valueCell = document.createElement('td');
    valueCell.colSpan = Math.max(1, dimensionsRow.children.length - 1);
    valueCell.innerHTML = '<span data-bin-value>Waiting…</span> <button type="button" data-bin-change>Change container</button>';

    const button = valueCell.querySelector('[data-bin-change]');
    Object.assign(button.style, {
      marginLeft: '8px',
      padding: '2px 7px',
      fontSize: '11px',
      cursor: 'pointer'
    });

    button.addEventListener('click', () => {
      const current = getSavedContainer();
      const replacement = askForContainer(current);
      if (replacement) {
        lastFnsku = '';
        scheduleLookup(0);
      }
    });

    row.append(labelCell, valueCell);
    dimensionsRow.insertAdjacentElement('afterend', row);
    return row;
  }

  function setStatus(text, kind = 'normal') {
    const row = ensureDisplayRow();
    const value = row?.querySelector('[data-bin-value]');
    if (!value) return;

    value.textContent = text;
    value.style.fontWeight = kind === 'success' ? '700' : '600';
    value.style.color = kind === 'error' ? '#b12704' : '';
  }

  function makeRequestId() {
    if (crypto?.randomUUID) {
      return `amzn1.fc.v1.common.request-id.v1.AFTPoirotWebsite.${crypto.randomUUID()}`;
    }
    return `amzn1.fc.v1.common.request-id.v1.AFTPoirotWebsite.${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function lookupBinSize(fnsku, container) {
    setStatus('Checking Sideline…');

    GM_xmlhttpRequest({
      method: 'POST',
      url: API_URL,
      headers: {
        Accept: '*/*',
        'Content-Type': 'application/json'
      },
      data: JSON.stringify({
        containerScannableId: container,
        isMasterpack: null,
        itemAndonContext: null,
        itemBarcode: fnsku,
        requestId: makeRequestId(),
        tool: 'V3'
      }),
      timeout: 15000,
      anonymous: false,
      onload: response => {
        let payload;
        try {
          payload = JSON.parse(response.responseText || '{}');
        } catch {
          setStatus(`Bad response (${response.status})`, 'error');
          return;
        }

        if (response.status === 401 || response.status === 403) {
          setStatus('Open Sideline once, then retry', 'error');
          return;
        }

        const item = Array.isArray(payload.items)
          ? payload.items.find(entry => entry?.binDescription) || payload.items[0]
          : null;
        const binDescription = item?.binDescription;

        if (payload.success && binDescription) {
          setStatus(binDescription, 'success');
          return;
        }

        const message = payload.message || payload.errorMessage || payload.error || '';
        if (/container|source/i.test(String(message))) {
          clearSavedContainer();
          setStatus('Container rejected — click Change container', 'error');
          return;
        }

        setStatus(message ? `No bin size: ${message}` : 'No bin size returned', 'error');
      },
      ontimeout: () => setStatus('Sideline request timed out', 'error'),
      onerror: () => setStatus('Sideline request blocked/failed', 'error')
    });
  }

  function runLookup() {
    const fnsku = extractFnsku();
    if (!fnsku) return;

    ensureDisplayRow();
    if (fnsku === lastFnsku) return;

    const container = getContainer();
    if (!container) {
      setStatus('Container required', 'error');
      return;
    }

    lastFnsku = fnsku;
    lookupBinSize(fnsku, container);
  }

  function scheduleLookup(delay = 250) {
    clearTimeout(lookupTimer);
    lookupTimer = setTimeout(runLookup, delay);
  }

  const observer = new MutationObserver(() => scheduleLookup());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scheduleLookup(500);
})();
