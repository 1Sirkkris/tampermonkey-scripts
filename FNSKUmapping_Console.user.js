// ==UserScript==
// @name         v1.2.3 FNSKUmapping Console
// @version      1.2.3
// @description  URL-driven NA/EU fallback lookup: source FNSKU -> scrape ASIN -> jump JP ASIN mappings, then stop/idle. STOP is hard-kill. Manual region swap preserves current search.
// @author       (USER)
// @match        https://fba-fnsku-commingling-console-eu.aka.amazon.com/tool/fnsku-mappings-tool*
// @match        https://fba-fnsku-commingling-console-na.aka.amazon.com/tool/fnsku-mappings-tool*
// @match        https://fba-fnsku-commingling-console-jp.aka.amazon.com/tool/fnsku-mappings-tool*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/FNSKUmapping_Console.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/FNSKUmapping_Console.user.js
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '1.2.3';

  const REGIONS = {
    eu: 'fba-fnsku-commingling-console-eu.aka.amazon.com',
    na: 'fba-fnsku-commingling-console-na.aka.amazon.com',
    jp: 'fba-fnsku-commingling-console-jp.aka.amazon.com',
  };

  // IMPORTANT:
  // Old script versions used different storage keys.
  // STOP clears all of these so an older leftover state cannot keep redirecting.
  const STATE_KEYS = [
    'tm_fnsku_lookup_chain_v120',
    'tm_fnsku_lookup_chain_v121',
    'tm_fnsku_lookup_chain_v122',
    'tm_fnsku_lookup_chain_v123',
  ];

  const STORE_KEY = 'tm_fnsku_lookup_chain_v123';
  const KILL_KEY = 'tm_fnsku_lookup_chain_KILLED';

  let HARD_STOPPED_THIS_PAGE = false;
  let flowTimer = null;

  function getCurrentRegion() {
    const host = window.location.host.toLowerCase();
    for (const [region, regionHost] of Object.entries(REGIONS)) {
      if (host === regionHost) return region;
    }
    return null;
  }

  function stopAll(reason) {
    HARD_STOPPED_THIS_PAGE = true;
    if (flowTimer) {
      clearTimeout(flowTimer);
      flowTimer = null;
    }

    for (const key of STATE_KEYS) {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    }

    // LocalStorage kill survives reloads/region jumps.
    // Start buttons remove this flag.
    localStorage.setItem(KILL_KEY, String(Date.now()));

    setStatus(reason || 'STOPPED. Script idle.');
  }

  function allowRunAgain() {
    HARD_STOPPED_THIS_PAGE = false;
    localStorage.removeItem(KILL_KEY);
  }

  function isKilled() {
    return HARD_STOPPED_THIS_PAGE || !!localStorage.getItem(KILL_KEY);
  }

  function loadState() {
    if (isKilled()) return null;

    for (const key of STATE_KEYS) {
      try {
        const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
        if (raw) return JSON.parse(raw);
      } catch (_) {}
    }

    return null;
  }

  function saveState(state) {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(state));
  }

  function clearStateOnly() {
    for (const key of STATE_KEYS) {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    }
  }

  function sleep(ms) {
    return new Promise(resolve => {
      flowTimer = setTimeout(resolve, ms);
    });
  }

  function buildBlankUrl(region) {
    const current = new URL(window.location.href);
    const token = current.searchParams.get('anti-csrftoken-a2z');

    const url = new URL('/tool/fnsku-mappings-tool', 'https://' + REGIONS[region]);
    url.searchParams.set('getMappingsType', 'FNSKU_MAPPINGS');
    url.searchParams.set('FNSku', '');
    url.searchParams.set('FNSkus', '');
    url.searchParams.set('merchantId', '');
    url.searchParams.set('MSkus', '');
    url.searchParams.set('ASIN', '');
    url.searchParams.set('includeInactive', 'true');
    url.searchParams.set('includeInternalMerchants', 'false');
    if (token) url.searchParams.set('anti-csrftoken-a2z', token);
    url.searchParams.set('paginationToken', '');

    return url.toString();
  }

  function buildToolUrl(region, mappingType, opts = {}) {
    const current = new URL(window.location.href);
    const token = current.searchParams.get('anti-csrftoken-a2z');

    const url = new URL('/tool/fnsku-mappings-tool', 'https://' + REGIONS[region]);
    url.searchParams.set('getMappingsType', mappingType);
    url.searchParams.set('FNSku', '');
    url.searchParams.set('FNSkus', opts.fnsku ? `${opts.fnsku}\r\n` : '');
    url.searchParams.set('merchantId', '');
    url.searchParams.set('MSkus', '');
    url.searchParams.set('ASIN', opts.asin || '');
    url.searchParams.set('includeInactive', 'true');
    url.searchParams.set('includeInternalMerchants', 'false');
    if (token) url.searchParams.set('anti-csrftoken-a2z', token);
    url.searchParams.set('submit', 'get');
    url.searchParams.set('paginationToken', '');

    return url.toString();
  }

  function buildRegionSwapUrl(region) {
    const url = new URL(window.location.href);
    url.host = REGIONS[region];
    return url.toString();
  }

  function gotoRegion(region) {
    // Manual Go NA/EU/JP should stop automation,
    // but preserve current ASIN/FNSKU/search params.
    stopAll('STOPPED. Manual region swap to ' + region.toUpperCase() + '.');
    window.location.assign(buildRegionSwapUrl(region));
  }

  function textNow() {
    return (document.body && document.body.innerText || '').replace(/\s+/g, ' ').trim();
  }

  function looksNoResult(text) {
    return /no\s+(result|mapping|record|data)|0\s+result|nothing\s+found/i.test(text);
  }

  function extractAsins() {
    const body = textNow();
    const fromBody = body.match(/\bB0[A-Z0-9]{8}\b/g) || [];
    const fromLinks = Array.from(document.querySelectorAll('a[href]'))
      .map(a => a.href)
      .join(' ')
      .match(/\bB0[A-Z0-9]{8}\b/g) || [];

    return [...new Set([...fromBody, ...fromLinks])];
  }

  function setStatus(msg) {
    const el = document.getElementById('tm-fnsku-flow-status');
    if (el) el.textContent = msg;
  }

  function createBtn(label, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.style.cssText = [
      'appearance:none',
      'border:1px solid rgba(0,0,0,.2)',
      'background:#fff',
      'border-radius:10px',
      'padding:8px 10px',
      'font:12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
      'cursor:pointer',
      'box-shadow:0 2px 8px rgba(0,0,0,.08)',
    ].join(';');
    btn.addEventListener('mouseenter', () => (btn.style.background = '#f6f7f8'));
    btn.addEventListener('mouseleave', () => (btn.style.background = '#fff'));
    btn.addEventListener('click', onClick);
    return btn;
  }

  function mountUI(currentRegion) {
    if (document.getElementById('tm-fnsku-flow-wrap')) return;

    const wrap = document.createElement('div');
    wrap.id = 'tm-fnsku-flow-wrap';
    wrap.style.cssText = [
      'position:fixed',
      'top:12px',
      'right:12px',
      'z-index:999999',
      'width:330px',
      'display:flex',
      'flex-direction:column',
      'gap:8px',
      'padding:12px',
      'background:rgba(255,255,255,.94)',
      'border:1px solid rgba(0,0,0,.12)',
      'border-radius:14px',
      'backdrop-filter:saturate(140%) blur(8px)',
      'box-shadow:0 8px 24px rgba(0,0,0,.16)',
      'font:12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
      'color:#111',
    ].join(';');

    const top = document.createElement('div');
    top.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;';

    const title = document.createElement('div');
    title.textContent = `FNSKU URL Lookup v${VERSION} — ${currentRegion.toUpperCase()}`;
    title.style.cssText = 'font-weight:700;';

    const close = createBtn('×', () => wrap.remove());
    close.title = 'Close';
    close.style.padding = '4px 9px';
    close.style.fontSize = '14px';

    top.appendChild(title);
    top.appendChild(close);

    const input = document.createElement('input');
    input.id = 'tm-fnsku-flow-input';
    input.placeholder = 'Scan / paste source FNSKU';
    input.autocomplete = 'off';
    input.style.cssText = [
      'width:100%',
      'box-sizing:border-box',
      'border:1px solid rgba(0,0,0,.2)',
      'border-radius:10px',
      'padding:10px',
      'font:13px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
    ].join(';');

    const existing = loadState();
    if (existing && existing.sourceFnsku) input.value = existing.sourceFnsku;

    const row1 = document.createElement('div');
    row1.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';

    function startFlow(firstRegion) {
      const sourceFnsku = input.value.trim().toUpperCase();
      if (!sourceFnsku) {
        setStatus('Scan / paste FNSKU first.');
        input.focus();
        return;
      }

      allowRunAgain();
      clearStateOnly();

      const fallbackRegion = firstRegion === 'na' ? 'eu' : 'na';
      const state = {
        sourceFnsku,
        stage: 'source',
        regionOrder: [firstRegion, fallbackRegion],
        regionIndex: 0,
        foundAsin: '',
        startedAt: Date.now(),
      };

      saveState(state);
      window.location.assign(buildToolUrl(firstRegion, 'FNSKU_MAPPINGS', { fnsku: sourceFnsku }));
    }

    row1.appendChild(createBtn('Start NA → EU → JP', () => startFlow('na')));
    row1.appendChild(createBtn('Start EU → NA → JP', () => startFlow('eu')));

    const row2 = document.createElement('div');
    row2.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';

    const stopBtn = createBtn('STOP', () => {
      stopAll('STOPPED. Reloading blank page.');
      const inputNow = document.getElementById('tm-fnsku-flow-input');
      if (inputNow) inputNow.value = '';
      window.location.assign(buildBlankUrl(currentRegion));
    });
    stopBtn.style.fontWeight = '800';
    stopBtn.style.background = '#ffe8e8';

    row2.appendChild(createBtn('Go NA', () => gotoRegion('na')));
    row2.appendChild(createBtn('Go EU', () => gotoRegion('eu')));
    row2.appendChild(createBtn('Go JP', () => gotoRegion('jp')));
    row2.appendChild(stopBtn);

    const status = document.createElement('div');
    status.id = 'tm-fnsku-flow-status';
    status.style.cssText = [
      'min-height:34px',
      'padding:9px',
      'background:#f6f7f8',
      'border-radius:10px',
      'white-space:pre-wrap',
    ].join(';');

    status.textContent = isKilled()
      ? 'STOPPED / idle. Paste FNSKU and press Start to run again.'
      : 'Idle. URL mode only runs after Start.';

    wrap.appendChild(top);
    wrap.appendChild(input);
    wrap.appendChild(row1);
    wrap.appendChild(row2);
    wrap.appendChild(status);

    document.documentElement.appendChild(wrap);
  }

  async function continueFlow(currentRegion) {
    if (isKilled()) return;

    const state = loadState();
    if (!state || state.stage !== 'source' || !state.sourceFnsku) return;

    if (Date.now() - (state.startedAt || Date.now()) > 45000) {
      stopAll('Timed out. Stopped.');
      return;
    }

    await sleep(900);
    if (isKilled()) return;

    const expectedRegion = state.regionOrder[state.regionIndex];

    if (currentRegion !== expectedRegion) {
      if (isKilled()) return;
      window.location.assign(buildToolUrl(expectedRegion, 'FNSKU_MAPPINGS', { fnsku: state.sourceFnsku }));
      return;
    }

    const body = textNow();
    const asins = extractAsins();

    if (asins.length > 0 && !looksNoResult(body)) {
      const foundAsin = asins[0];

      setStatus(`Found ASIN ${foundAsin} in ${currentRegion.toUpperCase()}.\nOpening JP ASIN mappings, then stopping.`);

      // Clear state BEFORE jumping JP.
      // Do not set KILL_KEY here, because user may still want panel idle on JP.
      clearStateOnly();

      await sleep(250);
      if (isKilled()) return;
      window.location.assign(buildToolUrl('jp', 'ASIN_MAPPINGS', { asin: foundAsin }));
      return;
    }

    state.regionIndex += 1;

    if (state.regionIndex < state.regionOrder.length) {
      const nextRegion = state.regionOrder[state.regionIndex];
      saveState(state);
      setStatus(`No ASIN found in ${currentRegion.toUpperCase()}.\nTrying ${nextRegion.toUpperCase()}...`);
      await sleep(250);
      if (isKilled()) return;
      window.location.assign(buildToolUrl(nextRegion, 'FNSKU_MAPPINGS', { fnsku: state.sourceFnsku }));
      return;
    }

    stopAll(`No ASIN found in NA or EU for ${state.sourceFnsku}.\nStopped.`);
  }

  function boot() {
    const current = getCurrentRegion();
    if (!current) return;

    mountUI(current);
    continueFlow(current);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();