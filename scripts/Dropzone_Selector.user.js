// ==UserScript==
// @name         v0.2.9 Dropzone Selector
// @namespace    MONKIES
// @version      0.2.9
// @description  Auto-scans selected dz destination on MoveApp. Defaults to dz-P-PRIME. Other DZs require floor selection. Window opens by default. Uses exact P2/P3/P4 DZ codes. Toggle UI with Alt+= or Alt++.
// @match        aft-moveapp-nrt-nrt.nrt.proxy.amazon.com/move-container*
// @match        aft-moveapp-*.proxy.amazon.com/move-container*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Dropzone_Selector.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Dropzone_Selector.user.js
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '0.2.9';

  const STORAGE_DZ = 'moveapp_dz_selector_type_v021';
  const STORAGE_FLOOR = 'moveapp_dz_selector_floor_v021';
  const STORAGE_ENABLED = 'moveapp_dz_selector_enabled_v021';

  const DEFAULT_DZ_TYPE = 'PRIME';

  const DZ_TYPES_UPPER = [
    { key: 'Cubiscan', label: 'Cubiscan', pattern: 'dz-Pcubiscan-{floor}' },
    { key: 'Prep', label: 'Prep', pattern: 'dz-P-Prep-{floor}' },
    { key: 'ISS', label: 'ISS', pattern: 'dz-P-ISS-{floor}' },
    { key: 'Damages', label: 'Damages', pattern: 'dz-P-Damages-{floor}' },
    { key: 'Hazmat', label: 'Hazmat', pattern: 'dz-P-Hazmat-{floor}' },
    { key: 'Nonsort', label: 'Nonsort', pattern: 'dz-Pnonsort-{floor}' }
  ];

  const DZ_TYPES_P1 = [
    { key: 'dz-P-HAZMAT_OUT', label: 'Hazmat' },
    { key: 'dz-P-Ticketland', label: 'Ticketland' },
    { key: 'dz-P-issconsol', label: 'Consolidation' },
    { key: 'dz-S-ISSWIP1', label: 'ISS WIP' },
    { key: 'dz-P-IB-nonsort', label: 'Nonsort' },
    { key: 'dz-P-ISS-Shipdock', label: 'Shipdock' },
    { key: 'dz-Pdamageland', label: 'Damageland' },
    { key: 'dz-P-rcv-Damages', label: 'Receive Damages' }
  ];

  const FLOORS = ['P1', 'P2', 'P3', 'P4'];

  let lastScanAt = 0;
  let armed = false;
  let lastErrorAt = 0;
  let wasDestinationStep = false;

  function isEnabled() {
    const val = localStorage.getItem(STORAGE_ENABLED);
    return val === null || val === 'true';
  }

  function setEnabled(value) {
    localStorage.setItem(STORAGE_ENABLED, value ? 'true' : 'false');
    renderUi();
  }

  function getDzType() {
    return localStorage.getItem(STORAGE_DZ) ?? DEFAULT_DZ_TYPE;
  }

  function setDzType(value) {
    localStorage.setItem(STORAGE_DZ, value);
    if (value === 'PRIME') {
      localStorage.removeItem(STORAGE_FLOOR);
    }
    renderUi();
  }

  function getFloor() {
    return localStorage.getItem(STORAGE_FLOOR) || '';
  }

  function setFloor(value) {
    localStorage.setItem(STORAGE_FLOOR, value);
    const dz = getDzType();
    if (dz === 'PRIME' || dz === '') {
      localStorage.setItem(STORAGE_DZ, '');
    }
    if (value === 'P1') {
      const validP1Keys = DZ_TYPES_P1.map(x => x.key);
      if (dz && dz !== 'PRIME' && !validP1Keys.includes(dz)) {
        localStorage.setItem(STORAGE_DZ, '');
      }
    } else {
      const validUpperKeys = DZ_TYPES_UPPER.map(x => x.key);
      if (dz && dz !== 'PRIME' && !validUpperKeys.includes(dz)) {
        localStorage.setItem(STORAGE_DZ, '');
      }
    }
    renderUi();
  }

  function isP1() {
    return getFloor() === 'P1';
  }

  function activeDzTypes() {
    return isP1() ? DZ_TYPES_P1 : DZ_TYPES_UPPER;
  }

  function selectedDropzone() {
    const dzType = getDzType();
    const floor = getFloor();

    if (dzType === 'PRIME') return 'dz-P-PRIME';
    if (!dzType || !floor) return '';

    if (floor === 'P1') {
      const p1Match = DZ_TYPES_P1.find(x => x.key === dzType);
      if (p1Match) return p1Match.key;
      return '';
    }

    const upperMatch = DZ_TYPES_UPPER.find(x => x.key === dzType);
    if (upperMatch) return upperMatch.pattern.replace('{floor}', floor);
    return '';
  }

  function pageText() {
    return (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
  }

  function isDestinationStep() {
    return /scan destination container/i.test(pageText());
  }

  function isSuccessStep() {
    const t = pageText();
    if (/scan destination container/i.test(t)) return false;
    return /move successful|scan another container/i.test(t);
  }

  function visible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
  }

  function inputs() {
    return [...document.querySelectorAll('input, textarea')]
      .filter(el => visible(el) && !el.disabled && !el.readOnly);
  }

  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter ? setter.call(el, value) : (el.value = value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function key(target, type, ch) {
    const isEnter = ch === 'Enter';
    const ev = new KeyboardEvent(type, {
      key: ch,
      code: isEnter ? 'Enter' : `Key${String(ch).toUpperCase()}`,
      keyCode: isEnter ? 13 : ch.charCodeAt(0),
      which: isEnter ? 13 : ch.charCodeAt(0),
      charCode: isEnter ? 0 : ch.charCodeAt(0),
      bubbles: true,
      cancelable: true,
      composed: true
    });
    try { target.dispatchEvent(ev); } catch (_) {}
  }

  function typeLikeScanner(value) {
    const targets = [
      document.activeElement,
      ...inputs(),
      document.body,
      document,
      window
    ].filter(Boolean);

    for (const target of targets) {
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        try {
          target.focus();
          setNativeValue(target, value);
          key(target, 'keydown', 'Enter');
          key(target, 'keypress', 'Enter');
          key(target, 'keyup', 'Enter');
          const form = target.closest('form');
          if (form) {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            try { form.requestSubmit?.(); } catch (_) {}
          }
        } catch (_) {}
      }

      for (const ch of value) {
        key(target, 'keydown', ch);
        key(target, 'keypress', ch);
        key(target, 'keyup', ch);
      }

      key(target, 'keydown', 'Enter');
      key(target, 'keypress', 'Enter');
      key(target, 'keyup', 'Enter');
    }
  }

  function showError(msg) {
    const now = Date.now();
    if (now - lastErrorAt < 1000) return;
    lastErrorAt = now;
    const box = document.getElementById('moveapp-dz-error');
    if (!box) return;
    box.textContent = msg;
    box.style.display = 'block';
    setTimeout(() => { box.style.display = 'none'; }, 2500);
  }

  function fireDropzone() {
    if (!isEnabled()) return;

    const now = Date.now();
    if (now - lastScanAt < 250) return;

    const dzType = getDzType();
    const floor = getFloor();

    if (dzType === 'PRIME') {
      lastScanAt = now;
      setTimeout(() => {
        if (!isDestinationStep()) return;
        typeLikeScanner('dz-P-PRIME');
      }, 80);
      return;
    }

    if (!floor) {
      showError('Select floor first');
      return;
    }

    if (!dzType) {
      showError('Select a dropzone');
      return;
    }

    const dz = selectedDropzone();
    if (!dz) {
      showError('Select a dropzone');
      return;
    }

    lastScanAt = now;
    console.log(`[MoveApp DZ Selector v${VERSION}] firing ${dz}`);

    setTimeout(() => {
      if (!isDestinationStep()) return;
      typeLikeScanner(dz);
    }, 80);
  }

  function tick() {
    const dest = isDestinationStep();

    if (dest && !wasDestinationStep) {
      wasDestinationStep = true;
      armed = false;
      fireDropzone();
      return;
    }

    if (dest) {
      wasDestinationStep = true;
      return;
    }

    wasDestinationStep = false;

    if (isSuccessStep()) {
      armed = true;
      return;
    }

    armed = true;
  }

  function colorForFloor(floor) {
    if (floor === 'P1') return '#7a5b9e';
    if (floor === 'P2') return '#2f5d9f';
    if (floor === 'P3') return '#2f7d46';
    if (floor === 'P4') return '#a03535';
    return '#555';
  }

  function mkBtn(text, active, color, disabled = false) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = [
      'border:0',
      'border-radius:7px',
      'padding:8px 9px',
      'font:800 12px Arial,sans-serif',
      `cursor:${disabled ? 'not-allowed' : 'pointer'}`,
      'color:white',
      `background:${disabled ? '#3e3e3e' : active ? color : '#666'}`,
      `opacity:${disabled ? '.45' : '1'}`,
      `box-shadow:${active ? '0 0 0 2px rgba(255,255,255,.52) inset' : 'none'}`,
      'min-width:58px'
    ].join(';');
    return btn;
  }

  function toggleUi() {
    const root = document.getElementById('moveapp-dz-selector');
    if (!root) return;
    root.style.display = root.style.display === 'none' ? '' : 'none';
  }

  function renderUi() {
    let root = document.getElementById('moveapp-dz-selector');
    if (!root) {
      root = document.createElement('div');
      root.id = 'moveapp-dz-selector';
      document.documentElement.appendChild(root);
    }

    const dzType = getDzType();
    const floor = getFloor();
    const dz = selectedDropzone();
    const isPrime = dzType === 'PRIME';
    const hasFloor = !!floor;
    const enabled = isEnabled();
    const current = dz || 'SELECT DZ';
    const needsSelection = !dz && !isPrime;

    root.style.cssText = [
      'position:fixed',
      'right:10px',
      'bottom:10px',
      'z-index:999999',
      'width:310px',
      'background:rgba(28,28,28,.94)',
      'color:white',
      'border:1px solid rgba(255,255,255,.22)',
      'border-radius:10px',
      'box-shadow:0 3px 14px rgba(0,0,0,.35)',
      'padding:9px',
      'font:12px Arial,sans-serif',
      'display:block'
    ].join(';');

    root.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-weight:900;">DZ Auto v${VERSION}</span>
          <button id="moveapp-dz-enable-btn" style="
            border:0;
            border-radius:5px;
            padding:3px 7px;
            font:700 10px Arial,sans-serif;
            cursor:pointer;
            color:white;
            background:${enabled ? '#2e7d32' : '#b53131'};
          ">${enabled ? 'ON' : 'OFF'}</button>
        </div>
        <div style="font-weight:900;color:${needsSelection ? '#ffb3b3' : '#bfffcf'};">${current}</div>
      </div>

      <div id="moveapp-dz-error" style="display:none;background:#b53131;color:white;font-weight:900;text-align:center;border-radius:7px;padding:6px;margin-bottom:7px;"></div>

      <div id="moveapp-prime-wrap" style="margin-bottom:6px;"></div>

      <div style="font-weight:800;margin:3px 0 4px;color:#d9d9d9;">Floor</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:7px;" id="moveapp-floor-buttons"></div>

      <div style="font-weight:800;margin:3px 0 4px;color:#d9d9d9;">Dropzone</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px;" id="moveapp-dz-buttons"></div>

    `;

    root.querySelector('#moveapp-dz-enable-btn').addEventListener('click', () => setEnabled(!enabled));

    const primeWrap = root.querySelector('#moveapp-prime-wrap');
    const prime = mkBtn('PRIME  •  dz-P-PRIME', isPrime, '#6b55c9');
    prime.style.width = '100%';
    prime.addEventListener('click', () => setDzType('PRIME'));
    primeWrap.appendChild(prime);

    const floorWrap = root.querySelector('#moveapp-floor-buttons');
    for (const f of FLOORS) {
      const btn = mkBtn(f, f === floor && !isPrime, colorForFloor(f));
      btn.addEventListener('click', () => setFloor(f));
      floorWrap.appendChild(btn);
    }

    const dzWrap = root.querySelector('#moveapp-dz-buttons');

    if (isPrime) {
      const placeholder = document.createElement('div');
      placeholder.style.cssText = 'grid-column:1/-1;text-align:center;color:#888;padding:6px;font-style:italic;';
      placeholder.textContent = 'PRIME selected (no DZ needed)';
      dzWrap.appendChild(placeholder);
    } else if (!hasFloor) {
      const placeholder = document.createElement('div');
      placeholder.style.cssText = 'grid-column:1/-1;text-align:center;color:#888;padding:6px;font-style:italic;';
      placeholder.textContent = 'Select a floor first';
      dzWrap.appendChild(placeholder);
    } else {
      const dzList = activeDzTypes();
      for (const item of dzList) {
        const isActive = item.key === dzType;
        const btn = mkBtn(item.label, isActive, floor === 'P1' ? '#7a5b9e' : '#4c7ed9');
        btn.title = item.key;
        btn.addEventListener('click', () => setDzType(item.key));
        dzWrap.appendChild(btn);
      }
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      toggleUi();
    }
  });

  renderUi();

  new MutationObserver(tick).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  window.addEventListener('pageshow', () => setTimeout(tick, 100));
  document.addEventListener('DOMContentLoaded', () => setTimeout(tick, 100));

  setInterval(tick, 150);
  setTimeout(tick, 150);

  console.log(`[MoveApp DZ Selector v${VERSION}] loaded`);
})();
