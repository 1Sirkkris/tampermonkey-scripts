// ==UserScript==
// @name         v0.1.2 FCResearch Sideline Bin Size
// @namespace    https://github.com/1Sirkkris
// @version      0.1.2
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
  const PANEL_ID = 'fcr-sideline-bin-panel';

  let lastItem = '';
  let requestRunning = false;

  function normalise(value) {
    return String(value || '').trim();
  }

  function validContainer(value) {
    return /^(?:csX|tsX)[A-Za-z0-9]+$/i.test(normalise(value));
  }

  function validItem(value) {
    return /^(?:B[A-Z0-9]{9}|X[A-Z0-9]{9})$/i.test(normalise(value));
  }

  function clearContainer() {
    GM_setValue(STORAGE_KEY, '');
    GM_setValue(STORAGE_TIME_KEY, 0);
  }

  function savedContainer() {
    const value = normalise(GM_getValue(STORAGE_KEY, ''));
    const savedAt = Number(GM_getValue(STORAGE_TIME_KEY, 0));
    if (!validContainer(value) || !savedAt || Date.now() - savedAt > MAX_AGE_MS) {
      clearContainer();
      return '';
    }
    return value;
  }

  function askContainer(current = '') {
    const entered = prompt('Enter valid Sideline source container (csX / tsX).\nSaved for 24 hours.', current);
    if (entered === null) return '';

    const value = normalise(entered);
    if (!validContainer(value)) {
      alert('Invalid container. Must begin with csX or tsX.');
      return askContainer(current);
    }

    GM_setValue(STORAGE_KEY, value);
    GM_setValue(STORAGE_TIME_KEY, Date.now());
    return value;
  }

  function extractCurrentItem() {
    const params = new URLSearchParams(location.search);
    const queryValue = normalise(params.get('s'));
    if (validItem(queryValue)) return queryValue.toUpperCase();

    const searchInput = [...document.querySelectorAll('input')].find(input => validItem(input.value));
    if (searchInput) return normalise(searchInput.value).toUpperCase();

    const productSection = [...document.querySelectorAll('section, div')].find(el => {
      const heading = el.querySelector('h1, h2, h3, h4');
      return normalise(heading?.textContent) === 'Product';
    });

    if (productSection) {
      const asinLabel = [...productSection.querySelectorAll('td, th, div, span')]
        .find(el => normalise(el.textContent) === 'ASIN');
      const row = asinLabel?.closest('tr');
      if (row) {
        const match = normalise(row.textContent).match(/\bB[A-Z0-9]{9}\b/i);
        if (match) return match[0].toUpperCase();
      }
    }

    return '';
  }

  function findDimensionsAnchor() {
    const candidates = [...document.querySelectorAll('td, th, div, span')];
    return candidates.find(el => normalise(el.textContent) === 'Dimensions') || null;
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = '<b>Bin size:</b> <span data-value>Loaded — waiting for item</span> <button type="button" data-change>Change</button>';
    Object.assign(panel.style, {
      padding: '5px 8px',
      margin: '4px 0',
      border: '1px solid #9ca3af',
      borderRadius: '4px',
      background: '#f8fafc',
      fontSize: '12px',
      width: 'fit-content'
    });

    const button = panel.querySelector('[data-change]');
    Object.assign(button.style, {
      marginLeft: '8px',
      padding: '1px 6px',
      fontSize: '11px',
      cursor: 'pointer'
    });

    button.addEventListener('click', () => {
      const replacement = askContainer(savedContainer());
      if (replacement) {
        lastItem = '';
        tick();
      }
    });

    const anchor = findDimensionsAnchor();
    if (anchor) {
      const row = anchor.closest('tr');
      if (row?.parentElement) {
        const wrapper = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = Math.max(2, row.children.length || 2);
        cell.appendChild(panel);
        wrapper.appendChild(cell);
        row.insertAdjacentElement('afterend', wrapper);
      } else {
        anchor.parentElement?.appendChild(panel);
      }
    } else {
      Object.assign(panel.style, {
        position: 'fixed',
        right: '12px',
        bottom: '12px',
        zIndex: '99999'
      });
      document.body.appendChild(panel);
    }

    return panel;
  }

  function status(text, error = false) {
    const value = ensurePanel().querySelector('[data-value]');
    value.textContent = text;
    value.style.color = error ? '#b12704' : '';
    value.style.fontWeight = '700';
  }

  function requestId() {
    const id = crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `amzn1.fc.v1.common.request-id.v1.AFTPoirotWebsite.${id}`;
  }

  function lookup(itemBarcode, container) {
    requestRunning = true;
    status(`Checking ${itemBarcode}…`);

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
        itemBarcode,
        requestId: requestId(),
        tool: 'V3'
      }),
      timeout: 15000,
      anonymous: false,
      onload: response => {
        requestRunning = false;
        let payload;
        try {
          payload = JSON.parse(response.responseText || '{}');
        } catch {
          status(`Bad response (${response.status})`, true);
          return;
        }

        if (response.status === 401 || response.status === 403) {
          status('Open Sideline once, then refresh', true);
          return;
        }

        const items = Array.isArray(payload.items) ? payload.items : [];
        const exactItem = items.find(entry => {
          const values = [
            entry?.scannableId,
            entry?.value,
            entry?.skuDetail?.fnSku,
            entry?.skuDetail?.asin,
            entry?.skuDetail?.fcSku
          ].map(value => normalise(value).toUpperCase());
          return values.includes(itemBarcode.toUpperCase());
        });
        const item = exactItem || items.find(entry => entry?.binDescription) || items[0];

        if (item?.binDescription) {
          status(item.binDescription);
          return;
        }

        const message = String(payload.message || payload.errorMessage || payload.error || 'No bin size returned');
        if (/container|source/i.test(message)) clearContainer();
        status(message, true);
      },
      ontimeout: () => {
        requestRunning = false;
        status('Request timed out', true);
      },
      onerror: () => {
        requestRunning = false;
        status('Request blocked/failed', true);
      }
    });
  }

  function tick() {
    ensurePanel();

    const currentItem = extractCurrentItem();
    if (!currentItem || requestRunning || currentItem === lastItem) return;

    const container = savedContainer() || askContainer();
    if (!container) {
      status('Container required', true);
      return;
    }

    lastItem = currentItem;
    lookup(currentItem, container);
  }

  ensurePanel();
  tick();
  setInterval(tick, 1000);
})();
