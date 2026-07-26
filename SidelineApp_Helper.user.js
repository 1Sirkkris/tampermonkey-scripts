// ==UserScript==
// @name         v0.9.40 SidelineApp Helper
// @namespace    https://github.com/1Sirkkris
// @version      0.9.40
// @description  SidelineApp merged helper tools.
// @match        https://aft-poirot-website-nrt.nrt.proxy.amazon.com/*
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SidelineApp_Helper.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SidelineApp_Helper.user.js
// @grant        none
// ==/UserScript==
// SidelineApp Merged Helper
// Version: v0.9.40
// Combines:
// - Tote Scrubber Auto Close
// - Lazy Scrub Helper Queue UI
// - QTY Barcode Helper buttons
// - Manual CLEAR TOTE double-click action (no page refresh)

// NOTE:
// This revision swaps the helper sides, keeps tote scrubbing merged, and adds a compact menu for feature toggles.
// - Lazy Sideline panel docks on the left
// - QTY Helper panel docks on the right
// - Sideline Tools menu can show/hide Lazy Sideline and QTY Helper
// - Sideline Tools menu is docked bottom-center to avoid the main scrubber button.
// - v0.9.20 makes the bottom menu more minimal and enlarges Lazy Sideline stats for distance glancing.
// - v0.9.21 makes every feature independently togglable and applies a cleaner Sideline/OEM-style UI.
// - v0.9.22 renames QTY Helper to Qty quick select and removes helper explainer text.
// - v0.9.23 makes Qty quick select persistent across scan/page refresh by removing screen-based hide/show.
// - v0.9.24 adds PAO toggle to auto-enter today + 900 days on expiry date screen after item scan.
// - v0.9.25 makes PAO mode auto-confirm Scan item and Verify item before expiry date entry.
// - v0.9.26 removes the PAO toggle and asks on the expiry screen: PAO item? Yes = today + 900 days, No = manual entry.
// - v0.9.27 focuses the Month/MM box when user chooses NO / manual on the PAO prompt.
// - v0.9.28 stops normal item barcode scans from auto-confirming Verify Item.
//   This keeps Damaged / No match / Item dimension options usable.
// - v0.9.30 fixes Lazy Sideline overlay event shield so SRC/DEST Enter and Inventory counting work again.
// - v0.9.31 adds manual predicant recovery.
// - v0.9.32 fixes the safety rescan trigger: after the Predicant banner appears, rescan the same DEST
//   into Sideline's normal destination scan box.
// - v0.9.33 follows the exact recovery workflow: pause -> Back to Source -> Change container -> NO
//   for the original source -> open DEST as source -> Change container -> YES -> restart Lazy from SOURCE.
// - v0.9.34 adds a three-tap expiry picker: month -> day -> year, then fills and confirms the date.
// - v0.9.35 keeps Month, Day, and Year choices visible together immediately on the expiry screen.
// - v0.9.36 replaces the large button grids with compact Month / Day / Year dropdowns and Apply.
// - v0.9.37 restores the cleaner three-step expiry picker: Month -> Day -> Year.
// - v0.9.38 shows PAO and Month choices immediately, removing the extra Choose Date click.
// - v0.9.39 docks Month / Day / Year selectors below their native boxes and moves PAO +900 days to a full-width footer.
// - v0.9.40 keeps all Day / Year buttons visible from the start and groups the expiry controls inside a translucent backing window.



/* ===== ORIGINAL SCRIPT 1: Tote Scrubbing Auto Close ===== */

// ==UserScript==
// @name         v0.9.40 SidelineApp Helper
// @description  ONE Start/Stop button. Defaults OFF. Attaches at appearance, fires on first enable via attribute observer + microtask + rAF. Auto “Change container [C]” → “Yes” with bright beacon.
// @version      0.9.40
// @author       Simon Craven
// @match        https://aft-poirot-website-nrt.nrt.proxy.amazon.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  if (window.__sidelineScrub_v382) return;
  window.__sidelineScrub_v382 = true;

  /* Tunables */
  const BEACON_INTERVAL_MS = 2200, BEACON_FLASH_MS = 120, BEACON_GAP_MS = 160;
  const SMART_WAIT_MS = 6000, OVERLAY_POLL_MS = 200, REOPEN_DEBOUNCE_MS = 75; // safety cadence only
  const YES_RAF_BURST_MS = 800; // rAF hunt window for “Yes”

  // Optional: add a stable selector here if you have one (faster than text search)
  const SELECTOR_HINTS = [
    // 'button[data-testid="change-container"]',
    // '#change-container-button',
  ];

  /* Utils */
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const raf   = () => new Promise(r => requestAnimationFrame(r));
  const norm  = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const qmt   = (fn) => (window.queueMicrotask ? queueMicrotask(fn) : Promise.resolve().then(fn));

  /* State (default OFF each load) */
  const STORAGE_KEY = 'kadabraScriptEnabled';
  const isOn  = () => sessionStorage.getItem(STORAGE_KEY) === '1';
  const setOn = (v) => sessionStorage.setItem(STORAGE_KEY, v ? '1' : '0');
  setOn(false);

  /* Deep/shadow helpers */
  function* walkDeep(root = document) {
    const stack = [root];
    while (stack.length) {
      const n = stack.pop(); if (!n) continue;
      yield n;
      if (n.shadowRoot) stack.push(n.shadowRoot);
      if (n.children) for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
    }
  }
  function findByTextDeep(labels) {
    const want = labels.map(norm);
    for (const el of walkDeep(document)) {
      if (!(el instanceof Element)) continue;
      if (!/^(button|a|div|span|input|alchemy-button|mdw-button)$/i.test(el.tagName) && !el.hasAttribute('role')) continue;
      const txt = norm(el.textContent);
      if (txt && want.some(w => txt.includes(w))) return el;
    }
    return null;
  }
  function findChangeHost() {
    for (const sel of SELECTOR_HINTS) {
      try { const el = document.querySelector(sel); if (el) return el; } catch {}
    }
    return document.getElementById('change-container-button') ||
           findByTextDeep(['change container [c]', 'change container']);
  }
  function innerClickable(el) {
    if (!el) return null;
    if (el.shadowRoot) {
      const inner = el.shadowRoot.querySelector('button,[role="button"],input[type="button"],input[type="submit"]');
      if (inner) return inner;
    }
    return el;
  }

  /* ===== Bright BEACON banner ===== */
  let banner = null, styleEl = null, beaconTimer = null;
  function injectStyles() {
    if (styleEl) return;
    styleEl = document.createElement('style');
    styleEl.textContent = `
      @keyframes kadabraBright {
        0%   { transform: scale(1);    opacity:1;   background:#cc0000; color:#fff; }
        50%  { transform: scale(1.06); opacity:.98; background:#fff16c; color:#111; }
        100% { transform: scale(1);    opacity:1;   background:#cc0000; color:#fff; }
      }
      #kadabra-active-banner {
        position:fixed; left:0; right:0; bottom:0; z-index:2147483646;
        padding:10px 16px; text-align:center; font-weight:800; letter-spacing:.5px;
        font-family:system-ui, Segoe UI, Arial, sans-serif; pointer-events:none;
        box-shadow:0 -2px 8px rgba(0,0,0,.25); background:#cc0000; color:#fff;
        border-top:2px solid rgba(255,255,255,.6); will-change:transform,opacity;
      }
      .kadabra-bright-flash { animation:kadabraBright var(--flash-ms) ease-in-out 1; }
      @media (prefers-reduced-motion: reduce) { .kadabra-bright-flash { animation:none !important; } }
    `;
    document.head.appendChild(styleEl);
  }
  function ensureBanner() {
    injectStyles();
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'kadabra-active-banner';
      banner.textContent = 'Kadabra Tote Scrubbing — ACTIVE';
      document.documentElement.appendChild(banner);
    }
  }
  function startBeacon() {
    stopBeacon();
    if (!banner) return;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const burst = () => {
      if (!banner || reduced) return;
      banner.style.setProperty('--flash-ms', `${BEACON_FLASH_MS}ms`);
      banner.classList.add('kadabra-bright-flash');
      setTimeout(() => banner?.classList.remove('kadabra-bright-flash'), BEACON_FLASH_MS);
      setTimeout(() => {
        if (!banner) return;
        banner.classList.add('kadabra-bright-flash');
        setTimeout(() => banner?.classList.remove('kadabra-bright-flash'), BEACON_FLASH_MS);
      }, BEACON_GAP_MS);
    };
    burst();
    beaconTimer = setInterval(burst, BEACON_INTERVAL_MS);
  }
  function stopBeacon() { if (beaconTimer) { clearInterval(beaconTimer); beaconTimer = null; } }
  function showBanner() { ensureBanner(); startBeacon(); }
  function hideBanner() { stopBeacon(); banner?.remove(); banner = null; }

  /* ===== Toggle (robust) ===== */
  const TOGGLE_ID = 'kadabra-toggle-singleton';
  function reflectToggle(btn) { btn.textContent = isOn() ? 'Stop Scrubbing' : 'Start Scrubbing'; isOn() ? showBanner() : hideBanner(); }
  function mountToggle() {
    if (!document.body || document.getElementById(TOGGLE_ID)) return;
    const btn = document.createElement('button');
    btn.id = TOGGLE_ID; btn.type = 'button';
    Object.assign(btn.style, {
      position: 'fixed', top: '12px', right: '16px',
      zIndex: 2147483647, padding: '6px 10px', borderRadius: '8px',
      border: '1px solid #0b5ed7', background: '#0d6efd',
      color: '#fff', fontFamily: 'system-ui, Segoe UI, Arial, sans-serif',
      fontSize: '14px', cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,.2)'
    });
    reflectToggle(btn);
    btn.addEventListener('click', () => { const next = !isOn(); setOn(next); reflectToggle(btn); if (!next) location.reload(); });
    document.body.appendChild(btn);
  }
  new MutationObserver(() => { if (!document.getElementById(TOGGLE_ID)) mountToggle(); })
    .observe(document.documentElement, { childList: true, subtree: true });
  setInterval(() => { if (!document.getElementById(TOGGLE_ID)) mountToggle(); }, 1000);
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const next = !isOn(); setOn(next);
      const btn = document.getElementById(TOGGLE_ID);
      if (btn) reflectToggle(btn);
      if (!next) location.reload();
    }
  });

  /* ===== FAST READINESS (no layout thrash) ===== */
  const isHotReady = (el) => {
    if (!(el instanceof Element)) return false;
    const btn = innerClickable(el) || el;
    if (!(btn instanceof Element)) return false;
    const disabled = btn.disabled || btn.getAttribute('aria-disabled') === 'true' || btn.hasAttribute('disabled');
    const hidden   = btn.hidden || btn.getAttribute('aria-hidden') === 'true' || btn.style?.display === 'none' || btn.style?.visibility === 'hidden';
    return !disabled && !hidden;
  };

  /* Sticky watch on current Change host */
  let changeHostRef = null, changeHostAttrObs = null, innerAttrObs = null;
  let guard = false, lastCloseAt = 0;

  function unbindHostWatch() {
    try { changeHostAttrObs?.disconnect(); } catch {}
    try { innerAttrObs?.disconnect(); } catch {}
    changeHostAttrObs = innerAttrObs = null;
    changeHostRef = null;
  }

  function bindHostWatch(host) {
    if (!host || host === changeHostRef) return;
    unbindHostWatch();
    changeHostRef = host;

    const attrOpts = { attributes: true, attributeFilter: ['disabled','aria-disabled','hidden','class','style'] };

    const onFlip = () => {
      if (!isOn()) return;
      if (isHotReady(changeHostRef)) {
        qmt(() => (innerClickable(changeHostRef) || changeHostRef).click());
        huntYesFast();
      }
    };

    changeHostAttrObs = new MutationObserver(onFlip);
    try { changeHostAttrObs.observe(changeHostRef, attrOpts); } catch {}

    const inner = innerClickable(changeHostRef);
    if (inner && inner !== changeHostRef) {
      innerAttrObs = new MutationObserver(onFlip);
      try { innerAttrObs.observe(inner, attrOpts); } catch {}
    }

    onFlip();
  }

  function findChangeHostFresh() {
    const pick = findChangeHost();
    if (pick) bindHostWatch(pick);
    return pick;
  }

  /* Modal “Yes” hunter — rAF burst + tiny grace */
  function queryYesButton() {
    const scopes = [
      document.getElementById('modal-root'),
      ...document.querySelectorAll('[role="dialog"], .modal, .Dialog, .dialog, .ReactModal__Content')
    ].filter(Boolean);
    const scan = (root) => {
      const btns = root.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]');
      for (const b of btns) {
        const t = norm(b.textContent);
        if (t === 'yes' || t === 'ok' || t === 'confirm' || t === 'yes, close') return b;
        const span = b.querySelector('span.text'); if (span && norm(span.textContent) === 'yes') return b;
        if ((b.className || '').includes('btn-primary') && t.includes('yes')) return b;
      }
      return null;
    };
    for (const s of scopes) { const b = scan(s); if (b) return b; }
    return scan(document);
  }
  async function huntYesFast() {
    const deadline = performance.now() + YES_RAF_BURST_MS;
    let yes = null;
    while (!yes && performance.now() < deadline) { await raf(); yes = queryYesButton(); }
    if (!yes) {
      const start = performance.now();
      while (!yes && performance.now() - start < 500) { await raf(); yes = queryYesButton(); }
    }
    yes?.click();
    lastCloseAt = Date.now();
  }

  /* Single-shot driver (safety net) */
  async function autoCloseOnce() {
    if (!isOn() || guard) return;
    if (Date.now() - lastCloseAt < REOPEN_DEBOUNCE_MS) return;

    let host = changeHostRef || findChangeHostFresh();
    if (!host) return;

    guard = true;
    try {
      if (isHotReady(host)) {
        qmt(() => (innerClickable(host) || host).click());
        await huntYesFast();
      }
    } finally { guard = false; }
  }

  const fastAttach = new MutationObserver((mutations) => {
    if (!isOn()) return;
    for (const m of mutations) {
      for (const node of m.addedNodes || []) {
        if (!(node instanceof Element)) continue;
        for (const sel of SELECTOR_HINTS) {
          if (sel && (node.matches?.(sel) || node.querySelector?.(sel))) {
            bindHostWatch(node.matches?.(sel) ? node : node.querySelector(sel));
            qmt(autoCloseOnce);
            return;
          }
        }
        const txt = norm(node.textContent || '');
        if (txt.includes('change container')) {
          qmt(() => { findChangeHostFresh(); autoCloseOnce(); });
          return;
        }
      }
    }
  });
  fastAttach.observe(document.documentElement, { childList: true, subtree: true });

  setInterval(() => { if (isOn()) autoCloseOnce(); }, OVERLAY_POLL_MS);

  (async () => {
    while (!document.body) await sleep(10);
    injectStyles(); hideBanner(); mountToggle();
  })();


  /* ===== v0.9.10-clean: Tote Queue - uses existing scrubber only ===== */
  const TQ_ID = 'tote-queue-panel-v0910';
  const TQ_KEY = 'sideline_v0910_tote_queue_text';
  const TQ = {
    root: null,
    ta: null,
    status: null,
    errors: null,
    running: false,
    paused: false,
    queue: [],
    index: 0,
    failed: [],
    busy: false,
  };

  function tqVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function tqPretty(raw) {
    const s = String(raw || '').trim();
    const m = s.match(/^([ct]s)x(.+)$/i);
    return m ? (m[1].toLowerCase() + 'X' + m[2]) : s;
  }

  function tqParse(text) {
    const seen = new Set();
    const out = [];
    const matches = String(text || '').match(/\b(?:tsX|csX)[A-Za-z0-9_-]+\b/gi) || [];
    for (const raw of matches) {
      const code = tqPretty(raw);
      const key = code.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(code);
      }
    }
    return out;
  }

  function tqAppText() {
    const clone = document.body ? document.body.cloneNode(true) : null;
    if (!clone) return '';
    clone.querySelectorAll(`#${TQ_ID}, #sideline-tabs-v0910, #scrubber-panel-v0910, #slh-panel, #slh-mini, #qty-helper-panel-v105`).forEach(n => n.remove());
    return norm(clone.innerText || clone.textContent || '');
  }

  function tqHasError() {
    const t = tqAppText();
    return /\b(error|invalid|unable|failed|failure|not found|cannot|try again|not eligible|problem)\b/i.test(t);
  }

  function* tqWalkDeep(root = document) {
    const stack = [root];
    while (stack.length) {
      const n = stack.pop();
      if (!n) continue;
      yield n;
      if (n.shadowRoot) stack.push(n.shadowRoot);
      if (n.children) for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
    }
  }

  function tqInsideHelper(el) {
    let cur = el;
    while (cur) {
      if (cur.nodeType === 1 && cur.matches?.(`#${TQ_ID}, #sideline-tabs-v0910, #slh-panel, #slh-mini, #qty-helper-panel-v105, #${TOGGLE_ID}, #scrubber-panel-v0910`)) return true;
      cur = cur.parentElement || cur.getRootNode?.().host || null;
    }
    return false;
  }

  function tqFindScanInput() {
    const preferred = [];
    const byId = document.getElementById('scan-text-input');
    if (byId) preferred.push(byId);

    for (const el of tqWalkDeep(document)) {
      if (!(el instanceof Element)) continue;
      const tag = el.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || el.isContentEditable || el.getAttribute('role') === 'textbox') preferred.push(el);
    }

    const seen = new Set();
    const candidates = preferred.filter(el => {
      if (!el || seen.has(el)) return false;
      seen.add(el);
      return true;
    });

    return candidates
      .filter(el => tqVisible(el))
      .filter(el => !tqInsideHelper(el))
      .filter(el => !el.disabled && !el.readOnly && el.getAttribute('aria-disabled') !== 'true')
      .find(el => {
        if (el.isContentEditable || el.getAttribute('role') === 'textbox') return true;
        const type = String(el.type || '').toLowerCase();
        if (el.tagName.toLowerCase() !== 'textarea' && type && !['text', 'search', 'tel', ''].includes(type)) return false;
        const r = el.getBoundingClientRect();
        return r.width >= 40 && r.height >= 12;
      }) || null;
  }

  function tqInputReady() {
    const input = tqFindScanInput();
    if (!input) return false;

    // Tote Queue must ONLY scan containers on the Scan source container page.
    // If the app is on Scan item with a source already loaded, close that source first.
    if (!tqIsScanSourceScreen()) return false;

    const t = tqAppText();
    if (/enter quantity|verify item|item match|processing|loading|please wait/i.test(t)) return false;

    return true;
  }

  function tqSetValue(input, value) {
    if (!input) return false;
    if (input.isContentEditable || input.getAttribute('role') === 'textbox') {
      input.textContent = String(value);
      input.dispatchEvent(new InputEvent('input', { bubbles:true, inputType:'insertText', data:String(value) }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    const proto = Object.getPrototypeOf(input);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value') ||
                 Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') ||
                 Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    const prev = input.value;
    if (desc && desc.set) desc.set.call(input, String(value));
    else input.value = String(value);
    const tracker = input._valueTracker;
    if (tracker && typeof tracker.setValue === 'function') tracker.setValue(prev);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function tqKeyTarget(el) {
    if (el && !tqInsideHelper(el)) return el;
    return document.body || document.documentElement || document;
  }

  function tqFireKey(el, type, key) {
    const target = tqKeyTarget(el);
    const keyCode = key === 'Enter' ? 13 : (key.length === 1 ? key.charCodeAt(0) : 0);
    const opts = { key, code:key === 'Enter' ? 'Enter' : key.length === 1 ? `Key${key.toUpperCase()}` : key, keyCode, which:keyCode, bubbles:true, cancelable:true, composed:true };
    target.dispatchEvent(new KeyboardEvent(type, opts));
  }

  function tqFindConfirmButton() {
    const buttons = [];
    const byId = document.getElementById('confirm-button');
    if (byId) buttons.push(byId);
    for (const el of tqWalkDeep(document)) {
      if (!(el instanceof Element)) continue;
      if (el.tagName?.toLowerCase() === 'button' || el.getAttribute('role') === 'button') buttons.push(el);
    }
    const seen = new Set();
    return buttons.filter(b => b && !seen.has(b) && (seen.add(b), true))
      .filter(b => tqVisible(b) && !tqInsideHelper(b))
      .find(b => /confirm|enter|continue|submit/i.test(String(b.innerText || b.textContent || b.value || ''))) || null;
  }

  async function tqClickConfirmIfReady(timeoutMs = 700) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const btn = tqFindConfirmButton();
      if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true' && !btn.hasAttribute('disabled')) {
        try { btn.click(); return true; } catch {}
      }
      await sleep(25);
    }
    return false;
  }

  function tqEnter(el) {
    tqFireKey(el, 'keydown', 'Enter');
    tqFireKey(el, 'keypress', 'Enter');
    tqFireKey(el, 'keyup', 'Enter');
  }

  async function tqTypeLikeScanner(input, code) {
    const target = tqKeyTarget(input);
    try { target.focus?.(); } catch {}
    tqSetValue(input, '');
    await sleep(35);
    let built = '';
    for (const ch of String(code)) {
      tqFireKey(target, 'keydown', ch);
      tqFireKey(target, 'keypress', ch);
      built += ch;
      if (input) tqSetValue(input, built);
      tqFireKey(target, 'keyup', ch);
      await sleep(4);
    }
    tqEnter(target);
  }

  function tqTryFocusScanArea() {
    const scanWords = ['scan container', 'scan source container', 'scan tote', 'scan item', 'scan barcode'];
    for (const el of tqWalkDeep(document)) {
      if (!(el instanceof Element) || tqInsideHelper(el) || !tqVisible(el)) continue;
      const txt = norm(el.textContent || '');
      if (scanWords.some(w => txt.includes(w))) {
        try { el.click(); el.focus?.(); } catch {}
        return true;
      }
    }
    try { document.activeElement?.blur?.(); } catch {}
    return false;
  }

  async function tqWaitForInput(timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (!TQ.running || TQ.paused) return null;
      const input = tqFindScanInput();
      if (input && tqInputReady()) return input;
      tqTryFocusScanArea();
      await sleep(60);
    }
    return null;
  }

  // v0.9.15: Tote Queue no longer turns on the global tote scrubber and no longer misreads its own queue as the loaded source.
  // It directly clicks Change container -> Yes for the queued container only.
  function tqSetScrubber(on) {
    void on;
    setOn(false);
    const btn = document.getElementById(TOGGLE_ID);
    if (btn) reflectToggle(btn);
  }

  function tqIsScanSourceScreen() {
    const t = tqAppText();
    return /scan\s+source\s+container/i.test(t) && !!tqFindScanInput();
  }

  function tqCurrentSourceContainer() {
    // Only trust the right-side loaded-source card.
    // Do not parse the whole page text, because the helper queue itself can be read as "Source container" text.
    if (tqIsScanSourceScreen()) return '';

    const panels = [];
    for (const el of tqWalkDeep(document)) {
      if (!(el instanceof Element) || tqInsideHelper(el) || !tqVisible(el)) continue;
      const txt = String(el.innerText || el.textContent || '');
      if (/Source\s+container/i.test(txt) && /(?:tsX|csX)[A-Za-z0-9_-]+/i.test(txt)) panels.push(txt);
    }

    // Prefer the tightest block containing the label + value.
    panels.sort((a, b) => a.length - b.length);
    for (const text of panels) {
      const m = text.match(/Source\s+container\s*((?:tsX|csX)[A-Za-z0-9_-]+)/i) ||
                text.match(/Source\s+container[\s\S]{0,80}?((?:tsX|csX)[A-Za-z0-9_-]+)/i);
      if (m) return tqPretty(m[1]);
    }
    return '';
  }

  function tqFindChangeButtonDirect() {
    const byId = document.getElementById('change-container-button');
    if (byId && !tqInsideHelper(byId)) return byId;

    for (const el of tqWalkDeep(document)) {
      if (!(el instanceof Element) || tqInsideHelper(el) || !tqVisible(el)) continue;
      const txt = norm(el.innerText || el.textContent || el.value || '');
      if (txt.includes('change container')) return el;
    }
    return null;
  }

  function tqClickElement(el) {
    if (!el) return false;
    const target = innerClickable(el) || el;
    try {
      target.dispatchEvent(new MouseEvent('mouseover', { bubbles:true, cancelable:true, composed:true }));
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles:true, cancelable:true, composed:true }));
      target.dispatchEvent(new MouseEvent('mouseup', { bubbles:true, cancelable:true, composed:true }));
      target.click();
      return true;
    } catch {
      try { target.click(); return true; } catch {}
    }
    return false;
  }

  async function tqClickYesDirect(timeoutMs = 1200) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const yes = queryYesButton();
      if (yes && tqVisible(yes) && !yes.disabled && yes.getAttribute('aria-disabled') !== 'true') {
        tqClickElement(yes);
        lastCloseAt = Date.now();
        return true;
      }
      await raf();
    }
    return false;
  }

  async function tqWaitLoadedSource(code, timeoutMs = 6000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (!TQ.running || TQ.paused) return 'paused';
      if (tqHasError()) return 'error text found';
      const loaded = tqCurrentSourceContainer();
      if (loaded && (!code || norm(loaded) === norm(code))) return 'loaded';
      if (tqFindChangeButtonDirect()) return 'loaded';
      await sleep(45);
    }
    return 'source load timeout';
  }

  async function tqClickChangeYesDirect(code = '', timeoutMs = 9000) {
    const loaded = await tqWaitLoadedSource(code, Math.min(timeoutMs, 6000));
    if (loaded !== 'loaded') return loaded;

    const start = Date.now();
    let sentShortcut = false;

    while (Date.now() - start < timeoutMs) {
      if (!TQ.running || TQ.paused) return 'paused';
      if (tqHasError()) return 'error text found';

      const host = tqFindChangeButtonDirect();
      if (host && isHotReady(host)) {
        tqUpdate('change container -> yes');
        tqClickElement(host);
        const yes = await tqClickYesDirect(1600);
        if (yes) return 'closed';
      }

      // Keyboard fallback only; user does not need to press it.
      if (!sentShortcut && tqCurrentSourceContainer()) {
        sentShortcut = true;
        tqUpdate('change shortcut -> yes');
        tqFireKey(document.body, 'keydown', 'c');
        tqFireKey(document.body, 'keypress', 'c');
        tqFireKey(document.body, 'keyup', 'c');
        const yes = await tqClickYesDirect(1600);
        if (yes) return 'closed';
      }

      await sleep(60);
    }
    return 'change button timeout';
  }

  async function tqWaitNextScanReady(timeoutMs = 9000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (!TQ.running || TQ.paused) return 'paused';
      if (tqHasError()) return 'error text found';
      if (tqInputReady()) return 'ready';
      await sleep(60);
    }
    return 'next scan box timeout';
  }

  function tqUpdate(note = '') {
    if (!TQ.status) return;
    const total = TQ.queue.length;
    const done = Math.min(TQ.index, total);
    const left = Math.max(0, total - done);
    const cur = TQ.queue[TQ.index] || '—';
    const mode = TQ.running ? (TQ.paused ? 'PAUSED' : 'RUNNING') : 'STOPPED';

    TQ.status.textContent = `${mode} | ${done}/${total} done | ${left} left | Current: ${cur}${note ? ' | ' + note : ''}`;
    TQ.errors.textContent = TQ.failed.length
      ? `Errors/skipped: ${TQ.failed.map(x => `${x.code}${x.reason ? ' (' + x.reason + ')' : ''}`).join(', ')}`
      : 'Errors/skipped: none';
  }

  function tqBtn(text, bg) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    Object.assign(b.style, {
      border:'0', borderRadius:'8px', padding:'8px 9px', fontWeight:'900',
      fontSize:'12px', cursor:'pointer', color:'#fff', background:bg
    });
    return b;
  }

  function tqMount() {
    if (!document.body || document.getElementById(TQ_ID)) return;

    const root = document.createElement('div');
    root.id = TQ_ID;
    Object.assign(root.style, {
      position:'fixed', right:'14px', bottom:'74px', width:'460px',
      maxWidth:'calc(100vw - 28px)', zIndex:2147483646, boxSizing:'border-box',
      background:'#111827', color:'#fff', border:'2px solid #facc15', borderRadius:'12px',
      boxShadow:'0 4px 16px rgba(0,0,0,.35)', padding:'10px',
      fontFamily:'system-ui, Segoe UI, Arial, sans-serif'
    });

    const title = document.createElement('div');
    title.textContent = 'Tote Queue v0.9.24-clean';
    Object.assign(title.style, { fontWeight:'900', fontSize:'15px', marginBottom:'8px', color:'#facc15' });

    const ta = document.createElement('textarea');
    ta.placeholder = 'Paste tsX/csX list here\none per line';
    ta.value = sessionStorage.getItem(TQ_KEY) || '';
    Object.assign(ta.style, {
      width:'100%', height:'92px', boxSizing:'border-box', resize:'vertical',
      borderRadius:'8px', border:'1px solid #4b5563', padding:'8px',
      fontSize:'13px', fontWeight:'700', outline:'none'
    });
    ta.addEventListener('input', () => sessionStorage.setItem(TQ_KEY, ta.value));

    const row = document.createElement('div');
    Object.assign(row.style, { display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:'6px', marginTop:'8px' });

    const start = tqBtn('Start', '#16a34a');
    const pause = tqBtn('Pause', '#ca8a04');
    const skip = tqBtn('Skip', '#2563eb');
    const stop = tqBtn('Stop', '#dc2626');
    row.append(start, pause, skip, stop);

    const status = document.createElement('div');
    Object.assign(status.style, { marginTop:'8px', fontSize:'12px', fontWeight:'900', lineHeight:'1.35', color:'#e5e7eb' });

    const errors = document.createElement('div');
    Object.assign(errors.style, { marginTop:'5px', fontSize:'12px', fontWeight:'900', lineHeight:'1.35', color:'#fecaca', maxHeight:'64px', overflow:'auto' });

    root.append(title, ta, row, status, errors);
    document.body.appendChild(root);

    TQ.root = root;
    TQ.ta = ta;
    TQ.status = status;
    TQ.errors = errors;

    start.addEventListener('click', tqStart);
    pause.addEventListener('click', () => {
      TQ.paused = !TQ.paused;
      pause.textContent = TQ.paused ? 'Resume' : 'Pause';
      tqUpdate();
      if (!TQ.paused) setTimeout(tqPump, 200);
    });
    skip.addEventListener('click', () => tqSkip('manual skip'));
    stop.addEventListener('click', tqStop);

    tqUpdate();
  }

  function tqStart() {
    const list = tqParse(TQ.ta ? TQ.ta.value : '');
    TQ.queue = list;
    TQ.index = 0;
    TQ.failed = [];
    TQ.running = list.length > 0;
    TQ.paused = false;
    TQ.busy = false;
    tqSetScrubber(false);
    tqUpdate(list.length ? 'starting' : 'no valid tsX/csX found');
    if (list.length) setTimeout(tqPump, 250);
  }

  function tqStop() {
    TQ.running = false;
    TQ.paused = false;
    TQ.busy = false;
    tqSetScrubber(false);
    tqUpdate('stopped');
  }

  function tqSkip(reason) {
    if (!TQ.queue[TQ.index]) return;
    TQ.failed.push({ code:TQ.queue[TQ.index], reason:reason || 'skipped' });
    TQ.index += 1;
    TQ.busy = false;
    tqSetScrubber(false);
    tqUpdate(reason || 'skipped');
    setTimeout(tqPump, 150);
  }

  async function tqSubmit(code) {
    tqUpdate('waiting for scan box');
    const input = await tqWaitForInput(18000);
    if (!input) return false;

    try { input.focus(); if (typeof input.select === 'function') input.select(); } catch {}
    await sleep(20);
    tqSetValue(input, '');
    await sleep(10);
    tqSetValue(input, code);
    await sleep(35);

    // Prefer the app's own Confirm button; Enter fallback remains for scanner-style screens.
    const clicked = await tqClickConfirmIfReady(850);
    if (!clicked) tqEnter(input);

    await sleep(80);
    return true;
  }

  async function tqWaitDone(code, timeoutMs) {
    const closed = await tqClickChangeYesDirect(code, timeoutMs);
    if (closed !== 'closed') return closed;

    tqUpdate('waiting for next source scan');
    const ready = await tqWaitNextScanReady(10000);
    return ready === 'ready' ? 'cleared' : ready;
  }

  async function tqPump() {
    if (!TQ.running || TQ.paused || TQ.busy) return;

    if (TQ.index >= TQ.queue.length) {
      TQ.running = false;
      TQ.busy = false;
      tqSetScrubber(false);
      tqUpdate(TQ.failed.length ? 'done with errors' : 'done');
      return;
    }

    TQ.busy = true;
    const code = TQ.queue[TQ.index];
    tqSetScrubber(false);

    const loadedBefore = tqCurrentSourceContainer();
    if (loadedBefore) {
      tqUpdate(`loaded source ${loadedBefore} - closing`);
      const closeResult = await tqWaitDone('', 14000);

      if (closeResult === 'cleared') {
        if (norm(loadedBefore) === norm(code)) TQ.index += 1;
        TQ.busy = false;
        tqUpdate(norm(loadedBefore) === norm(code) ? 'cleared' : 'closed stray source');
        setTimeout(tqPump, 90);
        return;
      }

      if (closeResult === 'paused') {
        TQ.busy = false;
        tqUpdate('paused');
        return;
      }

      TQ.failed.push({ code: loadedBefore, reason: closeResult });
      TQ.busy = false;
      tqUpdate(closeResult);
      setTimeout(tqPump, 150);
      return;
    }

    tqUpdate('scanning source');
    const ok = await tqSubmit(code);
    if (!ok) {
      TQ.failed.push({ code, reason:'no source scan box' });
      TQ.index += 1;
      TQ.busy = false;
      tqUpdate('no source scan box');
      setTimeout(tqPump, 120);
      return;
    }

    const result = await tqWaitDone(code, 14000);

    if (result === 'cleared') {
      TQ.index += 1;
      TQ.busy = false;
      tqUpdate('cleared');
      setTimeout(tqPump, 90);
      return;
    }

    if (result === 'paused') {
      TQ.busy = false;
      tqUpdate('paused');
      return;
    }

    TQ.failed.push({ code, reason:result });
    TQ.index += 1;
    TQ.busy = false;
    tqUpdate(result);
    setTimeout(tqPump, 150);
  }

  setInterval(tqMount, 1500);

})();


/* ===== ORIGINAL SCRIPT 2: Lazy Scrub Helper ===== */

// ==UserScript==
// @name         v0.8.3 SidelineApp Lazy Scrub Helper (Compact UI + STRICT ORDER + AUTO VERIFY + Queue)
// @namespace    Violentmonkey Scripts
// @version      0.8.3
// @description  SidelineApp helper: SRC -> ITEM -> VERIFY -> QTY -> DEST loop.
// @author       (USER)
// @match        *://aft-poirot-website-*.proxy.amazon.com/*
// @match        *://aft-poirot-website-*.nrt.proxy.amazon.com/*
// @match        https://aft-poirot-website-nrt.nrt.proxy.amazon.com/*
// @match        *://aft-poirot-website-*.corp.amazon.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const SCRIPT_ID = 'slh_v084';
  if (window[SCRIPT_ID]) return;
  window[SCRIPT_ID] = true;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

  const QTY_BACKSPACE_DELAY = 10;
  const QTY_DIGIT_DELAY = 8;
  const QTY_POST_TYPE_DELAY = 35;
  const QTY_FILL_COOLDOWN = 220;
  const QTY_CONFIRM_COOLDOWN = 180;
  const QTY_STICKY_RETYPE_AFTER = 500;
  const QTY_STICKY_STATUS_AFTER = 900;
  const CLEAR_SOURCE_ON_DONE_KEY = 'slh_v0919_clear_source_on_done';

  function readClearSourceOnDone() {
    try { return localStorage.getItem(CLEAR_SOURCE_ON_DONE_KEY) === '1'; } catch { return false; }
  }

  function writeClearSourceOnDone(v) {
    try { localStorage.setItem(CLEAR_SOURCE_ON_DONE_KEY, v ? '1' : '0'); } catch {}
  }

  const state = {
    running: false, paused: false, stage: 'IDLE', idx: 0, queue: [],
    src: '', dest: '', cur: '', lastError: '', lastActionAt: 0, busy: false,
    qtyPendingSince: 0, qtyLastFillAt: 0, qtyLastConfirmAt: 0, qtyRecoveryCount: 0,
    recoveryRequested: false, recoveryRunning: false,
    clearSourceOnDone: readClearSourceOnDone(),
  };

  const ui = { root: null, mini: null, badge: null, status: null, srcIn: null, destIn: null, invTa: null, itemsBox: null, clearToggle: null };

  function isVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function qs(sel, root = document) { try { return root.querySelector(sel); } catch { return null; } }
  function qsa(sel, root = document) { try { return Array.from(root.querySelectorAll(sel)); } catch { return []; } }

  function setNativeValue(input, value) {
    if (!input) return false;
    const proto = Object.getPrototypeOf(input);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function setReactTrackedValue(input, value) {
    if (!input) return false;
    const proto = Object.getPrototypeOf(input);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    const prev = input.value;
    if (desc && desc.set) desc.set.call(input, value);
    else input.value = value;
    const tracker = input._valueTracker;
    if (tracker && typeof tracker.setValue === 'function') tracker.setValue(prev);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function fireKey(el, type, key) {
    if (!el) return;
    let keyCode = 0;
    if (key === 'Enter') keyCode = 13;
    else if (key === 'Backspace') keyCode = 8;
    else if (/^\d$/.test(key)) keyCode = key.charCodeAt(0);
    const opts = {
      key,
      code: key === 'Enter' ? 'Enter' : key === 'Backspace' ? 'Backspace' : `Digit${key}`,
      keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true,
    };
    el.dispatchEvent(new KeyboardEvent(type, opts));
  }
  function fireEnter(el) {
    if (!el) return;
    fireKey(el, 'keydown', 'Enter');
    fireKey(el, 'keypress', 'Enter');
    fireKey(el, 'keyup', 'Enter');
  }

  function clickEl(el) {
    if (!el) return false;
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    el.click();
    return true;
  }

  function getVisibleAppInputs() {
    return qsa('input, textarea').filter(el => isVisible(el) && !el.closest('#slh-panel') && !el.closest('#slh-mini'));
  }

  function getMainScanInput(screenHint) {
    const byId = qs('#scan-text-input');
    if (byId && isVisible(byId) && !byId.closest('#slh-panel') && !byId.closest('#slh-mini')) return byId;

    const inputs = getVisibleAppInputs();
    if (!inputs.length) return null;
    const normAttr = (s) => (s || '').toString().toLowerCase();

    if (screenHint === 'ENTER_QTY') {
      return inputs.find(el =>
        normAttr(el.type) === 'number' ||
        normAttr(el.inputMode) === 'numeric' ||
        /qty|quantity/i.test(normAttr(el.name) + ' ' + normAttr(el.id) + ' ' + normAttr(el.placeholder))
      ) || inputs.find(el => (el.value || '').trim() === '0') || inputs[0];
    }

    return inputs.find(el => normAttr(el.type) !== 'number') || inputs[0];
  }

  function getConfirmButton() {
    let btn = qs('#confirm-button');
    if (btn && isVisible(btn) && !btn.closest('#slh-panel') && !btn.closest('#slh-mini')) return btn;

    const buttons = qsa('button').filter(b => isVisible(b) && !b.closest('#slh-panel') && !b.closest('#slh-mini'));
    const label = (b) => norm((b.innerText || b.textContent || '').replace(/\s+/g, ' '));

    return buttons.find(b => /item\s*match/.test(label(b)))
      || buttons.find(b => /^confirm\b/.test(label(b)))
      || buttons.find(b => /confirm/.test(label(b)))
      || null;
  }

  function getPrimaryTitleText() {
    const el = qs('h1, h2, .text-layout__text, .text-layout__title, .page-title, [data-testid="page-title"], .box_outer h1, .box_outer h2');
    return norm(el?.textContent || '');
  }
  function getBodySnippet() { return norm((document.body?.innerText || '').slice(0, 10000)); }

  function findVisibleExactText(target) {
    const wanted = norm(target);
    const nodes = qsa('h1,h2,h3,h4,label,legend,span,div,p,strong,b');
    for (const el of nodes) {
      if (!isVisible(el) || el.closest('#slh-panel') || el.closest('#slh-mini')) continue;
      if (norm(el.textContent || '') === wanted) return el;
    }
    return null;
  }

  function looksLikeQtyScreenStrict() {
    const exactHeading = findVisibleExactText('Enter quantity');
    const title = getPrimaryTitleText();
    const text = getBodySnippet();
    if (!(exactHeading || title.includes('enter quantity') || text.includes('enter quantity'))) return false;

    const input = getMainScanInput('ENTER_QTY');
    if (!input) return false;

    const type = norm(input.type || '');
    const inputMode = norm(input.inputMode || '');
    const hint = norm((input.name || '') + ' ' + (input.id || '') + ' ' + (input.placeholder || ''));
    const val = String(input.value ?? '').trim();

    return type === 'number' || inputMode === 'numeric' || /qty|quantity/.test(hint) || val === '0' || !!exactHeading;
  }

  function getScreen() {
    const title = getPrimaryTitleText();
    const text = getBodySnippet();

    if (findVisibleExactText('Enter quantity') || looksLikeQtyScreenStrict()) return 'ENTER_QTY';
    if (findVisibleExactText('Scan source container') || title.includes('scan source') || text.includes('scan source container')) return 'SCAN_SOURCE';
    if (findVisibleExactText('Scan destination container') || title.includes('scan destination') || text.includes('scan destination container')) return 'SCAN_DEST';
    if (findVisibleExactText('Scan item') || title.includes('scan item') || text.includes('scan item')) return 'SCAN_ITEM';
    if (findVisibleExactText('Verify item') || title.includes('verify item') || text.includes('verify item')) return 'VERIFY_ITEM';
    if (title.includes('expiration date') || title.includes('expiry date') || text.includes('expiration date') || text.includes('expiry date')) return 'EXPIRY';
    if (title.includes('success') || text.includes('successfully')) return 'SUCCESS';

    const btn = getConfirmButton();
    const btnLabel = norm((btn && (btn.innerText || btn.textContent)) || '');
    if (btnLabel.includes('item match')) return 'VERIFY_ITEM';
    return 'UNKNOWN';
  }

  function readSourceShown() {
    const text = document.body?.innerText || '';
    const m = text.match(/\bts[xX][0-9a-z]{6,}\b/);
    return m ? m[0] : '';
  }

  function dedupeCounts(lines) {
    const counts = new Map();
    for (const raw of lines) {
      const v = String(raw || '').trim();
      if (!v) continue;
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    return counts;
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  function isValidContainerCode(value) {
    return /^(?:cs|ts)x[0-9a-z]+$/i.test(String(value || '').trim());
  }

  function markContainerValidity(input) {
    if (!input) return true;
    const ok = !input.value.trim() || isValidContainerCode(input.value);
    input.style.borderColor = ok ? 'rgba(0,0,0,.14)' : '#ef4444';
    input.style.background = ok ? '#fff' : '#fff1f2';
    return ok;
  }

  function setContainerError(which) {
    state.lastError = `${which} must start with csX or tsX.`;
    renderUI();
  }

  function hasPredicantErrorVisible() {
    const text = norm((document.body?.innerText || '').slice(0, 16000));
    return text.includes('predicant container') &&
      (text.includes('cannot be used as a destination container') ||
       text.includes('cannot be used as destination container'));
  }

  function predicantRecoveryCanBeVerified() {
    return state.running &&
      !state.recoveryRunning &&
      ['DEST', 'AFTER_SUCCESS', 'PREDICANT_RECOVERY_FAILED'].includes(state.stage) &&
      getScreen() === 'SCAN_DEST' &&
      hasPredicantErrorVisible();
  }

  function setInputValueQuiet(input, value) {
    if (!input) return;
    try {
      const proto = Object.getPrototypeOf(input);
      const desc = Object.getOwnPropertyDescriptor(proto, 'value') ||
                   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') ||
                   Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
      if (desc?.set) desc.set.call(input, String(value));
      else input.value = String(value);
    } catch {
      try { input.value = String(value); } catch {}
    }
  }

  function requestPredicantRecovery(value, input, restoreExpectedInInput = false) {
    if (!predicantRecoveryCanBeVerified()) return '';

    const expected = String(state.dest || '').trim();
    const scanned = String(value || '').trim();
    if (!expected || !scanned) return '';

    const resetVerificationInput = () => {
      if (!input) return;
      if (restoreExpectedInInput) {
        setInputValueQuiet(input, expected);
        input.dataset.lastGoodContainer = expected;
      } else {
        setInputValueQuiet(input, '');
      }
    };

    if (norm(scanned) !== norm(expected)) {
      resetVerificationInput();
      state.lastError = `Recovery blocked — scanned ${scanned}; expected ${expected}.`;
      renderUI();
      return 'mismatch';
    }

    resetVerificationInput();
    if (!state.recoveryRequested && !state.recoveryRunning) {
      state.recoveryRequested = true;
      state.paused = false;
      state.lastError = `DEST verified — starting recovery...`;
      renderUI();
    }
    return 'started';
  }

  function handlePredicantRecoveryRescan(label, value, input) {
    if (label !== 'DEST') return '';
    return requestPredicantRecovery(value, input, true);
  }

  // The user verifies recovery by rescanning DEST into Sideline's large/native scan box.
  // This listener only becomes active while the visible Predicant error is present.
  let predicantAppScanBuffer = '';
  let predicantAppScanLastKeyAt = 0;

  function installPredicantAppRescanListener() {
    const isTarget = (target) => {
      const input = getMainScanInput('SCAN_DEST');
      return !!input && target === input && !input.closest('#slh-panel') && !input.closest('#slh-mini');
    };

    document.addEventListener('keydown', (e) => {
      if (!predicantRecoveryCanBeVerified()) {
        predicantAppScanBuffer = '';
        return;
      }
      if (!isTarget(e.target) || e.isComposing) return;

      const input = e.target;
      const now = Date.now();
      if (now - predicantAppScanLastKeyAt > 120) predicantAppScanBuffer = '';
      predicantAppScanLastKeyAt = now;

      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const scanned = (predicantAppScanBuffer || String(input.value || '')).trim();
        predicantAppScanBuffer = '';
        requestPredicantRecovery(scanned, input, false);
        return;
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        predicantAppScanBuffer = predicantAppScanBuffer.slice(0, -1);
        setInputValueQuiet(input, predicantAppScanBuffer);
        return;
      }

      if (e.ctrlKey || e.altKey || e.metaKey || e.key.length !== 1) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      predicantAppScanBuffer += e.key;
      setInputValueQuiet(input, predicantAppScanBuffer);
    }, true);

    document.addEventListener('input', (e) => {
      if (!predicantRecoveryCanBeVerified() || !isTarget(e.target)) return;
      const value = String(e.target.value || '').trim();
      if (value) predicantAppScanBuffer = value;
    }, true);

    document.addEventListener('paste', (e) => {
      if (!predicantRecoveryCanBeVerified() || !isTarget(e.target)) return;
      const pasted = (e.clipboardData || window.clipboardData)?.getData('text') || '';
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      predicantAppScanBuffer = '';
      requestPredicantRecovery(pasted, e.target, false);
    }, true);
  }

  function rebuildQueueFromTextarea({ resetIndex = true } = {}) {
    if (!ui.invTa) return;
    const lines = ui.invTa.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const counts = dedupeCounts(lines);
    state.queue = Array.from(counts.entries()).map(([code, qty]) => ({ code, qty }));
    if (resetIndex) state.idx = 0;
    if (state.idx >= state.queue.length) state.idx = 0;
    state.cur = state.queue[state.idx]?.code || '';
  }

  function clearAllUserInputs() {
    Object.assign(state, { src:'', dest:'', cur:'', idx:0, queue:[], lastError:'', qtyPendingSince:0, qtyLastFillAt:0, qtyLastConfirmAt:0, qtyRecoveryCount:0, recoveryRequested:false, recoveryRunning:false });
    if (ui.srcIn) ui.srcIn.value = '';
    if (ui.destIn) ui.destIn.value = '';
    if (ui.invTa) ui.invTa.value = '';
  }

  function isContainerPartial(value) {
    const v = String(value || '').trim();
    return /^(|c|cs|csx|csx[0-9a-z]*|t|ts|tsx|tsx[0-9a-z]*)$/i.test(v);
  }

  function isContainerComplete(value) {
    return /^(csx|tsx)[0-9a-z]+$/i.test(String(value || '').trim());
  }

  function installContainerBlocker(input, label, nextElGetter) {
    if (!input) return;

    let scanBuf = '';
    let lastKeyAt = 0;
    const SCAN_GAP_MS = 80;

    const errMsg = `${label} must start with csX or tsX.`;

    const advanceNext = () => {
      const nextEl = typeof nextElGetter === 'function' ? nextElGetter() : null;
      if (!nextEl) return;
      setTimeout(() => {
        try { nextEl.focus(); } catch {}
      }, 0);
    };

    const reject = () => {
      input.value = '';
      input.dataset.lastGoodContainer = '';
      scanBuf = '';
      state.lastError = errMsg;
      renderUI();
    };

    const accept = (value) => {
      const v = String(value || '').trim();
      if (!isContainerComplete(v)) {
        reject();
        return false;
      }
      input.value = v;
      input.dataset.lastGoodContainer = v;

      const recoveryResult = handlePredicantRecoveryRescan(label, v, input);
      if (recoveryResult === 'mismatch') return false;
      if (recoveryResult === 'started') return true;

      if (state.lastError === errMsg) state.lastError = '';
      renderUI();
      return true;
    };

    input.dataset.lastGoodContainer = '';

    input.addEventListener('keydown', (e) => {
      const now = Date.now();

      if (now - lastKeyAt > SCAN_GAP_MS) scanBuf = '';
      lastKeyAt = now;

      if (e.key === 'Enter' || e.key === 'Tab') {
        if (scanBuf) {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (accept(scanBuf)) advanceNext();
          scanBuf = '';
          return;
        }
        if (!isContainerComplete(input.value)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          reject();
          return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        advanceNext();
        return;
      }

      if (e.key === 'Backspace' || e.key === 'Delete' || e.key.startsWith('Arrow') || e.ctrlKey || e.metaKey) return;
      if (e.key.length !== 1) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      // During manual predicant verification, a fresh scanner burst replaces the
      // existing DEST value instead of appending to it.
      const recoveryRescanMode = label === 'DEST' && state.running &&
        ['DEST', 'AFTER_SUCCESS', 'PREDICANT_RECOVERY_FAILED'].includes(state.stage);
      if (recoveryRescanMode && scanBuf.length === 0) {
        input.value = '';
        input.dataset.lastGoodContainer = '';
        try { input.setSelectionRange(0, 0); } catch {}
      }

      const nextBuf = scanBuf + e.key;
      const nextManual = (input.value || '').slice(0, input.selectionStart ?? input.value.length)
        + e.key
        + (input.value || '').slice(input.selectionEnd ?? input.value.length);

      // Full scanner behaviour: if the barcode starts wrong, block/clear the whole scan immediately.
      if (!isContainerPartial(nextBuf) && scanBuf.length === 0) {
        reject();
        return;
      }

      // Continued invalid scanner text also stays blocked.
      if (scanBuf && !isContainerPartial(nextBuf)) {
        reject();
        return;
      }

      // Manual/safe entry path.
      if (!isContainerPartial(nextManual)) {
        reject();
        return;
      }

      scanBuf = nextBuf;
      input.value = nextManual;
      input.dataset.lastGoodContainer = nextManual;

      if (state.lastError === errMsg) {
        state.lastError = '';
        renderUI();
      }
    }, true);

    input.addEventListener('beforeinput', (e) => {
      if (e.inputType && e.inputType.startsWith('delete')) return;
      if (!e.data) return;
      const next = (input.value || '').slice(0, input.selectionStart ?? input.value.length)
        + e.data
        + (input.value || '').slice(input.selectionEnd ?? input.value.length);
      if (!isContainerPartial(next)) {
        e.preventDefault();
        reject();
      }
    }, true);

    input.addEventListener('paste', (e) => {
      const pasted = (e.clipboardData || window.clipboardData)?.getData('text') || '';
      e.preventDefault();
      accept(pasted);
    }, true);

    input.addEventListener('drop', (e) => {
      e.preventDefault();
      reject();
    }, true);

    input.addEventListener('input', () => {
      const v = String(input.value || '').trim();
      if (!v) {
        input.dataset.lastGoodContainer = '';
        return;
      }
      if (!isContainerPartial(v)) {
        reject();
        return;
      }
      input.dataset.lastGoodContainer = v;
    }, true);
  }

  function findLazyButtonByText(labels) {
    const wanted = labels.map(norm);
    const buttons = qsa('button,[role="button"],input[type="button"],input[type="submit"],alchemy-button,mdw-button')
      .filter(el => isVisible(el) && !el.closest('#slh-panel') && !el.closest('#slh-mini'));
    for (const b of buttons) {
      const txt = norm(b.textContent || b.innerText || b.value || '');
      if (txt && wanted.some(w => txt === w || txt.includes(w))) return b;
    }
    return null;
  }

  function getLazyChangeContainerButton() {
    const byId = qs('#change-container-button');
    if (byId && isVisible(byId) && !byId.closest('#slh-panel') && !byId.closest('#slh-mini')) return byId;
    return findLazyButtonByText(['change container [c]', 'change container']);
  }

  function getLazyBackToSourceButton() {
    return findLazyButtonByText(['back to source container [s]', 'back to source container']);
  }

  function getLazyModalChoiceButton(choice) {
    const wanted = norm(choice);
    const scopes = [
      document.getElementById('modal-root'),
      ...qsa('[role="dialog"], .modal, .Dialog, .dialog, .ReactModal__Content, [aria-modal="true"]')
    ].filter(Boolean);

    const scan = (root) => {
      const btns = qsa('button,[role="button"],input[type="button"],input[type="submit"],alchemy-button,mdw-button', root)
        .filter(el => isVisible(el) && !el.closest('#slh-panel') && !el.closest('#slh-mini'));
      const label = (b) => norm(b.textContent || b.innerText || b.value || '');

      if (wanted === 'no') {
        return btns.find(b => label(b) === 'no') ||
          btns.find(b => /^no\b/.test(label(b))) ||
          null;
      }

      return btns.find(b => ['yes', 'empty', 'empty container', 'yes, close'].includes(label(b))) ||
        btns.find(b => /^(yes|empty)\b/.test(label(b))) ||
        null;
    };

    for (const scope of scopes) {
      const hit = scan(scope);
      if (hit) return hit;
    }

    // Final exact-label fallback for Sideline's confirmation overlay.
    // Never accepts the page's large Confirm [ENTER] button.
    return scan(document);
  }

  function getLazyModalConfirmButton() { return getLazyModalChoiceButton('yes'); }
  function getLazyModalNoButton() { return getLazyModalChoiceButton('no'); }

  async function waitLazy(getter, timeoutMs = 1800) {
    const end = Date.now() + timeoutMs;
    let el = null;
    while (!el && Date.now() < end) {
      el = getter();
      if (el) return el;
      await sleep(40);
    }
    return null;
  }

  async function clearSourceContainerOnDone() {
    const changeBtn = getLazyChangeContainerButton() || await waitLazy(getLazyChangeContainerButton, 1800);
    if (!changeBtn) return false;

    clickEl(changeBtn);

    const confirmBtn = getLazyModalConfirmButton() || await waitLazy(getLazyModalConfirmButton, 2600);
    if (!confirmBtn) return false;

    clickEl(confirmBtn);
    await sleep(120);
    return true;
  }

  async function waitRecoveryCondition(test, timeoutMs = 9000, pollMs = 60) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      try { if (test()) return true; } catch {}
      await sleep(pollMs);
    }
    return false;
  }

  function setRecoveryStatus(message) {
    state.lastError = message;
    renderUI();
  }

  async function waitForSourceScanRecovery(timeoutMs = 9000) {
    return waitRecoveryCondition(() => getScreen() === 'SCAN_SOURCE' && !!getMainScanInput('SCAN_SOURCE'), timeoutMs);
  }

  function readLoadedSourceRecovery() {
    const text = String(document.body?.innerText || '');
    const m = text.match(/Source\s+container[\s\r\n:]*((?:ts|cs)x[0-9a-z_-]+)/i);
    return m ? m[1] : '';
  }

  async function waitForLoadedSourceRecovery(code, timeoutMs = 10000) {
    const expected = norm(code);
    return waitRecoveryCondition(() => {
      const shown = norm(readLoadedSourceRecovery());
      return shown === expected && getScreen() !== 'SCAN_SOURCE' && !!getLazyChangeContainerButton();
    }, timeoutMs);
  }

  async function returnToOriginalSourceRecovery() {
    const alreadyBack = norm(readLoadedSourceRecovery()) === norm(state.src) &&
      getScreen() === 'SCAN_ITEM' && !!getLazyChangeContainerButton();
    if (alreadyBack) return;

    const backBtn = getLazyBackToSourceButton() || await waitLazy(getLazyBackToSourceButton, 5000);
    if (!backBtn) throw new Error('Could not find Back to Source Container.');

    clickEl(backBtn);
    const ready = await waitRecoveryCondition(() =>
      norm(readLoadedSourceRecovery()) === norm(state.src) &&
      getScreen() === 'SCAN_ITEM' &&
      !!getLazyChangeContainerButton(), 10000);
    if (!ready) throw new Error('Back to Source did not return to the original source.');
  }

  async function closeLoadedContainerRecovery(label, emptyChoice) {
    const changeBtn = getLazyChangeContainerButton() || await waitLazy(getLazyChangeContainerButton, 5000);
    if (!changeBtn) throw new Error(`Could not find Change container for ${label}.`);

    clickEl(changeBtn);

    const getter = emptyChoice ? getLazyModalConfirmButton : getLazyModalNoButton;
    const choiceBtn = getter() || await waitLazy(getter, 6000);
    if (!choiceBtn) throw new Error(`Could not find ${emptyChoice ? 'YES' : 'NO'} while closing ${label}.`);

    clickEl(choiceBtn);
    const ready = await waitForSourceScanRecovery(12000);
    if (!ready) throw new Error(`Timed out waiting for Scan source after closing ${label} with ${emptyChoice ? 'YES' : 'NO'}.`);
  }

  async function openContainerRecovery(code, label) {
    const ready = await waitForSourceScanRecovery(10000);
    if (!ready) throw new Error(`Scan source was not ready for ${label}.`);

    const submitted = await actFillAndConfirm(code, { postSetDelay: 40, retries: 3, waitConfirmEnabled: true, screenHint: 'SCAN_SOURCE' });
    if (!submitted) throw new Error(`Could not scan ${label} ${code}.`);

    const loaded = await waitForLoadedSourceRecovery(code, 12000);
    if (!loaded) throw new Error(`${label} ${code} did not open as the source container.`);
  }

  async function runPredicantRecovery() {
    if (!state.recoveryRequested || state.recoveryRunning) return;

    const savedIndex = state.idx;
    state.recoveryRequested = false;
    state.recoveryRunning = true;
    state.paused = true;
    state.stage = 'PREDICANT_RECOVERY';

    try {
      setRecoveryStatus('Predicant recovery 1/4 — Back to Source...');
      await returnToOriginalSourceRecovery();

      setRecoveryStatus('Predicant recovery 2/4 — closing original source with NO...');
      await closeLoadedContainerRecovery('original source', false);

      setRecoveryStatus(`Predicant recovery 3/4 — opening destination ${state.dest}...`);
      await openContainerRecovery(state.dest, 'destination');

      setRecoveryStatus(`Predicant recovery 4/4 — emptying destination ${state.dest} with YES...`);
      await closeLoadedContainerRecovery('destination', true);

      // Recovery ends on Scan source. Restart the normal Lazy flow from SOURCE so
      // it reopens the original source, retries the same item/qty, then DEST.
      state.idx = savedIndex;
      state.cur = state.queue[state.idx]?.code || '';
      Object.assign(state, {
        stage:'SOURCE', paused:false,
        qtyPendingSince:0, qtyLastFillAt:0, qtyLastConfirmAt:0, qtyRecoveryCount:0,
        lastActionAt:0
      });
      setRecoveryStatus(`Destination reset — restarting ${state.cur} x ${state.queue[state.idx]?.qty ?? 1}.`);
      await sleep(500);
      state.lastError = '';
    } catch (e) {
      state.idx = savedIndex;
      state.cur = state.queue[state.idx]?.code || '';
      state.stage = 'PREDICANT_RECOVERY_FAILED';
      state.paused = true;
      state.lastError = `Predicant recovery stopped: ${e?.message || e}.`;
    } finally {
      state.recoveryRunning = false;
      renderUI();
    }
  }

  function stopAndClearAll() { state.running = false; state.paused = false; state.stage = 'IDLE'; clearAllUserInputs(); renderUI(); }
  async function finishRunAndClearAll() {
    state.running = false;
    state.paused = false;
    state.stage = 'IDLE';

    let finishError = '';
    if (state.clearSourceOnDone) {
      state.lastError = 'Done — clearing source container...';
      renderUI();
      const ok = await clearSourceContainerOnDone();
      if (!ok) finishError = 'Done, but could not clear source container.';
    }

    clearAllUserInputs();
    state.lastError = finishError;
    renderUI();
  }

  function css() {
    return `
#slh-panel{position:fixed;left:14px;bottom:14px;width:620px;max-width:calc(100vw - 28px);background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.14);z-index:2147483646;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827;}
#slh-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border-bottom:1px solid rgba(0,0,0,.08);}
#slh-left{display:flex;align-items:center;gap:8px;min-width:0;}
#slh-badge{flex:0 0 auto;font-weight:800;font-size:11px;line-height:1;padding:5px 9px;border-radius:999px;background:#eee;}
#slh-title{font-weight:800;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#slh-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;}
.slh-btn{border:0;border-radius:9px;padding:7px 9px;font-weight:800;font-size:11px;line-height:1.1;cursor:pointer;white-space:nowrap;}
.slh-btn:disabled{opacity:.45;cursor:not-allowed;}
.slh-btn.start{background:#3b82f6;color:#fff;}.slh-btn.pause{background:#fb923c;color:#111;}.slh-btn.stop{background:#ef4444;color:#fff;}.slh-btn.ghost{background:#f3f4f6;color:#111;}
#slh-body{padding:8px 10px 10px;}#slh-status{display:none;font-size:11px;line-height:1.3;color:#111827;margin-bottom:8px;}#slh-status.has-error{display:block;}#slh-status .slh-muted{color:#6b7280;}
#slh-grid{display:grid;grid-template-columns:210px 1fr;gap:8px;align-items:start;}
.slh-card{border:1px solid rgba(0,0,0,.08);border-radius:10px;padding:8px;background:#fcfcfd;}.slh-card h4{margin:0 0 6px 0;font-size:11px;font-weight:800;}
.slh-in{width:100%;box-sizing:border-box;padding:8px 9px;border-radius:9px;border:1px solid rgba(0,0,0,.14);font-size:12px;background:#fff;}
#slh-src{margin-bottom:6px;}#slh-inv{width:100%;height:94px;min-height:94px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;line-height:1.22;}
#slh-options{margin-top:7px;display:flex;align-items:center;gap:6px;font-size:11px;font-weight:800;color:#374151;}#slh-options input{width:14px;height:14px;margin:0;}#slh-items{margin-top:10px;padding-top:9px;border-top:1px dashed rgba(0,0,0,.12);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.45;max-height:190px;overflow:auto;white-space:pre-wrap;}#slh-stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;}.slh-statcard{border:2px solid #111827;border-radius:10px;background:#fef3c7;padding:8px 10px;text-align:center;}.slh-statlabel{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.04em;color:#374151;}.slh-statnum{display:block;font-weight:1000;font-size:46px;line-height:.95;color:#111827;}
.slh-curline{display:block;background:#fff3bf;border:1px solid #f59f00;border-radius:7px;padding:4px 8px;font-weight:900;color:#7a4b00;margin:3px 0;}
.slh-curqty{display:inline-block;background:#ffd8a8;border:1px solid #fd7e14;border-radius:999px;padding:1px 7px;font-weight:800;color:#8a3c00;margin-left:6px;}
#slh-mini{position:fixed;left:14px;bottom:14px;z-index:2147483646;display:none;}#slh-mini button{border:0;border-radius:999px;padding:7px 11px;background:#111;color:#fff;font-weight:800;font-size:11px;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.14);}
`.trim();
  }

  function renderItemsBox() {
    const entries = state.queue
      .map((it, i) => ({ ...it, i }))
      .slice(0, 80);

    const totalQty = state.queue.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
    const uniqueCount = entries.length;
    let html = `<div id="slh-stats"><div class="slh-statcard"><div class="slh-statlabel">Total Qty</div><span class="slh-statnum">${totalQty}</span></div><div class="slh-statcard"><div class="slh-statlabel">Unique</div><span class="slh-statnum">${uniqueCount}</span></div></div>`;
    for (const row of entries) {
      const code = escapeHtml(row.code);
      const qty = escapeHtml(row.qty);
      const isCurrent = row.i === state.idx && !!state.cur;

      if (isCurrent) {
        html += `\n<span class="slh-curline">&gt; ${code} <span class="slh-curqty">${qty}x</span></span>`;
      } else {
        html += `\n${qty}x  ${code}`;
      }
    }
    ui.itemsBox.innerHTML = html.replace(/\n/g, '<br>');
  }

  function installLazyOverlayEventShield(panel, mini) {
    // v0.9.30: Lazy overlay still takes priority over Sideline,
    // but target input handlers must run FIRST.
    // Capture-phase stopPropagation was blocking:
    // - SRC Enter -> DEST focus
    // - DEST Enter -> Inventory focus
    // - Inventory input -> Total/Unique rebuild
    const shield = (e) => {
      const target = e.target;
      if (!target || !target.closest) return;
      if (target.closest('#slh-panel') || target.closest('#slh-mini')) {
        e.stopPropagation();
      }
    };

    [
      'keydown', 'keypress', 'keyup',
      'beforeinput', 'input', 'change',
      'paste', 'drop',
      'click', 'mousedown', 'mouseup'
    ].forEach((type) => {
      // Bubble phase only. Input/textarea handlers run first, then this blocks the app underneath.
      try { panel.addEventListener(type, shield, false); } catch {}
      try { mini.addEventListener(type, shield, false); } catch {}
    });
  }

  function renderUI() {
    if (!ui.root) return;
    const scr = getScreen();
    const qtyForCurrent = state.queue[state.idx]?.qty ?? '';
    ui.status.classList.toggle('has-error', !!state.lastError);
    ui.status.innerHTML = state.lastError ? `<b style="color:#b91c1c">${escapeHtml(state.lastError)}</b>` : '';
    const mode = state.recoveryRunning ? 'FIXING' : (state.lastError ? 'ERROR' : (state.running ? (state.paused ? 'PAUSED' : 'RUNNING') : 'IDLE'));
    ui.badge.textContent = mode;
    ui.badge.style.background = mode === 'RUNNING' ? '#16a34a' : mode === 'FIXING' ? '#0ea5e9' : mode === 'PAUSED' ? '#7c3aed' : mode === 'ERROR' ? '#ef4444' : '#e5e7eb';
    ui.badge.style.color = mode === 'IDLE' ? '#111' : '#fff';
    if (ui.clearToggle) ui.clearToggle.checked = !!state.clearSourceOnDone;
    renderItemsBox();
  }

  function buildUI() {
    const style = document.createElement('style');
    style.textContent = css();
    document.documentElement.appendChild(style);

    const mini = document.createElement('div');
    mini.id = 'slh-mini';
    mini.innerHTML = `<button type="button" id="slh-mini-btn">SLH</button>`;
    document.body.appendChild(mini);

    const panel = document.createElement('div');
    panel.id = 'slh-panel';
    panel.innerHTML = `
<div id="slh-head"><div id="slh-left"><div id="slh-badge">IDLE</div><div id="slh-title">v0.9.40 Sideline Lazy</div></div><div id="slh-actions"><button class="slh-btn start" id="slh-start">Start</button><button class="slh-btn pause" id="slh-pause">Pause</button><button class="slh-btn stop" id="slh-stop">Stop</button><button class="slh-btn ghost" id="slh-hide">Hide</button></div></div>
<div id="slh-body"><div id="slh-status"></div><div id="slh-grid"><div class="slh-card"><h4>Containers</h4><input class="slh-in" id="slh-src" placeholder="Source container (csX / tsX only)" autocomplete="off" /><input class="slh-in" id="slh-dest" placeholder="Destination container (csX / tsX only)" autocomplete="off" /><label id="slh-options"><input type="checkbox" id="slh-clear-source-done" /> Clear source when done</label></div><div class="slh-card"><h4>Inventory</h4><textarea class="slh-in" id="slh-inv" placeholder="Scan/paste one per line (duplicates = qty)."></textarea></div></div><div id="slh-items"></div></div>`;
    document.body.appendChild(panel);

   ui.root = panel; ui.mini = mini; ui.badge = qs('#slh-badge', panel); ui.status = qs('#slh-status', panel);
   ui.srcIn = qs('#slh-src', panel); ui.destIn = qs('#slh-dest', panel); ui.invTa = qs('#slh-inv', panel); ui.itemsBox = qs('#slh-items', panel); ui.clearToggle = qs('#slh-clear-source-done', panel);

   installLazyOverlayEventShield(panel, mini);

   installContainerBlocker(ui.srcIn, 'SRC', () => ui.destIn);
   installContainerBlocker(ui.destIn, 'DEST', () => ui.invTa);

 panel.style.display = 'none';
 mini.style.display = 'block';

    const btn = { start: qs('#slh-start', panel), pause: qs('#slh-pause', panel), stop: qs('#slh-stop', panel), hide: qs('#slh-hide', panel), miniBtn: qs('#slh-mini-btn', mini) };

    const refreshInventoryQueue = (resetIndex = true) => {
      if (!state.running) {
        rebuildQueueFromTextarea({ resetIndex });
        renderUI();
      }
    };
    ui.invTa.addEventListener('input', () => refreshInventoryQueue(true));
    ui.invTa.addEventListener('change', () => refreshInventoryQueue(true));
    ui.invTa.addEventListener('keyup', () => refreshInventoryQueue(true));
    ui.invTa.addEventListener('paste', () => setTimeout(() => refreshInventoryQueue(true), 0));
    if (ui.clearToggle) {
      ui.clearToggle.checked = !!state.clearSourceOnDone;
      ui.clearToggle.addEventListener('change', () => {
        state.clearSourceOnDone = !!ui.clearToggle.checked;
        writeClearSourceOnDone(state.clearSourceOnDone);
        renderUI();
      });
    }

    btn.start.addEventListener('click', () => {
      state.lastError = '';
      state.src = (ui.srcIn.value || '').trim();
      state.dest = (ui.destIn.value || '').trim();
      markContainerValidity(ui.srcIn);
      markContainerValidity(ui.destIn);
      if (!state.src || !state.dest) { state.lastError = 'Fill SRC + DEST first.'; renderUI(); return; }
      if (!isValidContainerCode(state.src)) { setContainerError('SRC'); return; }
      if (!isValidContainerCode(state.dest)) { setContainerError('DEST'); return; }
      rebuildQueueFromTextarea({ resetIndex: true });
      if (!state.queue.length) { state.lastError = 'Queue empty. Scan/paste inventory first.'; renderUI(); return; }
      Object.assign(state, { running:true, paused:false, stage:'SOURCE', idx:0, cur:state.queue[0]?.code || '', qtyPendingSince:0, qtyLastFillAt:0, qtyLastConfirmAt:0, qtyRecoveryCount:0, recoveryRequested:false, recoveryRunning:false });
      renderUI();
    });
    btn.pause.addEventListener('click', () => { if (!state.running) return; state.paused = !state.paused; renderUI(); });
    btn.stop.addEventListener('click', () => stopAndClearAll());
    btn.hide.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
    btn.miniBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });

    [ui.srcIn, ui.destIn].forEach((input) => {
      input.addEventListener('input', () => {
        markContainerValidity(input);
        if (state.lastError && isValidContainerCode(ui.srcIn.value) && isValidContainerCode(ui.destIn.value)) {
          state.lastError = '';
          renderUI();
        }
      });
    });

    ui.srcIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!isValidContainerCode(ui.srcIn.value)) { setContainerError('SRC'); return; }
        ui.destIn.focus();
      }
    });
    ui.destIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!isValidContainerCode(ui.destIn.value)) { setContainerError('DEST'); return; }
        ui.invTa.focus();
      }
    });

    renderUI();
  }

  async function actFillAndConfirm(value, opts = {}) {
    const { postSetDelay = 40, retries = 2, waitConfirmEnabled = false, screenHint = null } = opts;
    for (let i = 0; i < retries; i++) {
      const input = getMainScanInput(screenHint || getScreen());
      if (!input) { await sleep(40); continue; }
      try { input.focus(); if (typeof input.select === 'function') input.select(); } catch {}
      setNativeValue(input, String(value));
      if (screenHint === 'ENTER_QTY') input.dispatchEvent(new Event('blur', { bubbles: true }));
      await sleep(postSetDelay);
      const btn = getConfirmButton();
      if (!btn) { await sleep(50); continue; }
      if (waitConfirmEnabled) {
        const start = Date.now();
        while (Date.now() - start < 450) {
          if (!btn.disabled && btn.getAttribute('aria-disabled') !== 'true') break;
          await sleep(20);
        }
      }
      clickEl(btn);
      return true;
    }
    return false;
  }

  async function typeQtyLikeUser(input, qty) {
    if (!input) return false;
    try {
      input.focus();
      if (typeof input.select === 'function') input.select();
      if (typeof input.setSelectionRange === 'function') {
        const len = String(input.value ?? '').length;
        input.setSelectionRange(0, len);
      }
    } catch {}
    fireKey(input, 'keydown', 'Backspace');
    setReactTrackedValue(input, '');
    fireKey(input, 'keyup', 'Backspace');
    await sleep(QTY_BACKSPACE_DELAY);
    let built = '';
    for (const ch of String(qty)) {
      fireKey(input, 'keydown', ch);
      built += ch;
      setReactTrackedValue(input, built);
      input.setAttribute('value', built);
      fireKey(input, 'keyup', ch);
      await sleep(QTY_DIGIT_DELAY);
    }
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    return String(input.value ?? '').trim() === String(qty);
  }

  async function actQtySubmit(qty) {
    const input = getMainScanInput('ENTER_QTY');
    if (!input) return false;
    const typedOk = await typeQtyLikeUser(input, qty);
    state.qtyLastFillAt = Date.now();
    await sleep(QTY_POST_TYPE_DELAY);
    const btn = getConfirmButton();
    if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') {
      clickEl(btn);
      state.qtyLastConfirmAt = Date.now();
      await sleep(20);
    }
    fireEnter(input);
    state.qtyLastConfirmAt = Date.now();
    return typedOk;
  }

  async function actConfirmOnly() { const btn = getConfirmButton(); if (!btn) return false; clickEl(btn); return true; }
  function shouldThrottle(minGap = 250) { const now = Date.now(); if (now - state.lastActionAt < minGap) return true; state.lastActionAt = now; return false; }

  buildUI();
  installPredicantAppRescanListener();

  async function tick() {
    if (!state.running || state.busy || (state.paused && !state.recoveryRequested)) return;
    state.busy = true;

    try {
      if (state.recoveryRequested) {
        await runPredicantRecovery();
        return;
      }
      if (state.paused) return;

      const scr = getScreen();

      if (scr === 'EXPIRY') { state.stage = 'EXPIRY_WAIT'; state.lastError = 'Waiting for user to handle Expiration Date screen...'; renderUI(); return; }
      if (state.stage === 'EXPIRY_WAIT' && scr !== 'EXPIRY') state.lastError = '';

      if (scr === 'ENTER_QTY' && state.stage !== 'QTY') {
        state.stage = 'QTY';
        state.qtyPendingSince = state.qtyPendingSince || Date.now();
        state.lastError = '';
        renderUI();
        return;
      }

      state.cur = state.queue[state.idx]?.code || '';
      if (!state.cur) { await finishRunAndClearAll(); return; }

      const shown = readSourceShown();
      const want = state.src;
      const sourceMatches = want && shown && norm(shown) === norm(want);

      if (state.stage === 'SOURCE') {
        if (scr === 'SCAN_SOURCE') {
          if (shouldThrottle()) return;
          await actFillAndConfirm(want, { postSetDelay: 30, retries: 2, waitConfirmEnabled: true });
          renderUI(); return;
        }
        if (scr === 'SCAN_ITEM' || scr === 'VERIFY_ITEM' || scr === 'ENTER_QTY' || scr === 'EXPIRY' || scr === 'SUCCESS') {
          state.stage = 'ITEM'; state.lastError = ''; renderUI(); return;
        }
        renderUI(); return;
      }

      if (state.stage === 'ITEM') {
        if (scr === 'SCAN_SOURCE' && !sourceMatches) { state.stage = 'SOURCE'; renderUI(); return; }
        if (scr === 'SCAN_ITEM') {
          if (shouldThrottle()) return;
          await actFillAndConfirm(state.cur, { postSetDelay: 25, retries: 2, waitConfirmEnabled: true });
          state.stage = 'VERIFY'; renderUI(); return;
        }
        if (scr === 'VERIFY_ITEM') { state.stage = 'VERIFY'; renderUI(); return; }
        if (scr === 'ENTER_QTY') { state.stage = 'QTY'; state.qtyPendingSince = 0; renderUI(); return; }
        renderUI(); return;
      }

      if (state.stage === 'VERIFY') {
        if (scr === 'VERIFY_ITEM') {
          if (shouldThrottle()) return;
          const ok = await actConfirmOnly();
          if (!ok) { state.lastError = 'Could not find confirm button on Verify screen.'; renderUI(); return; }
          state.lastError = ''; renderUI(); return;
        }
        if (scr === 'ENTER_QTY') { state.stage = 'QTY'; state.qtyPendingSince = 0; state.lastError = ''; renderUI(); return; }
        if (scr === 'EXPIRY') { state.stage = 'EXPIRY_WAIT'; renderUI(); return; }
        if (scr === 'SCAN_DEST') { state.stage = 'DEST'; renderUI(); return; }
        renderUI(); return;
      }

      if (state.stage === 'QTY') {
        const qty = String(state.queue[state.idx]?.qty ?? 1);

        if (scr === 'SCAN_SOURCE') { Object.assign(state, { qtyPendingSince:0, qtyLastFillAt:0, qtyLastConfirmAt:0, qtyRecoveryCount:0, stage: sourceMatches ? 'ITEM' : 'SOURCE', lastError:'' }); renderUI(); return; }
        if (scr === 'SCAN_DEST') { Object.assign(state, { qtyPendingSince:0, qtyLastFillAt:0, qtyLastConfirmAt:0, qtyRecoveryCount:0, stage:'DEST', lastError:'' }); renderUI(); return; }
        if (scr === 'SCAN_ITEM') { Object.assign(state, { qtyPendingSince:0, qtyLastFillAt:0, qtyLastConfirmAt:0, qtyRecoveryCount:0, stage:'ITEM', lastError:'' }); renderUI(); return; }

        if (scr === 'ENTER_QTY') {
          const now = Date.now();
          const input = getMainScanInput('ENTER_QTY');
          const currentVal = input ? String(input.value ?? '').trim() : '';
          const btn = getConfirmButton();
          const btnReady = !!(btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true');

          if (!state.qtyPendingSince) state.qtyPendingSince = now;

          if (currentVal !== qty) {
            if (now - state.qtyLastFillAt < QTY_FILL_COOLDOWN) { renderUI(); return; }
            if (shouldThrottle(140)) return;
            const ok = await actQtySubmit(qty);
            state.lastError = ok ? '' : `Could not type quantity ${qty}.`;
            renderUI(); return;
          }

          if (currentVal === qty && now - state.qtyPendingSince > QTY_STICKY_RETYPE_AFTER && state.qtyRecoveryCount < 2 && now - state.qtyLastFillAt > QTY_FILL_COOLDOWN) {
            state.qtyRecoveryCount += 1;
            state.lastError = `Qty page sticky - retyping ${qty} (attempt ${state.qtyRecoveryCount}).`;
            await actQtySubmit(qty);
            renderUI(); return;
          }

          if (btnReady && now - state.qtyLastConfirmAt > QTY_CONFIRM_COOLDOWN) {
            clickEl(btn);
            state.qtyLastConfirmAt = now;
            state.lastError = '';
            renderUI(); return;
          }

          state.lastError = now - state.qtyPendingSince > QTY_STICKY_STATUS_AFTER ? `Qty ${qty} is in the field; waiting for page to advance...` : '';
          renderUI(); return;
        }

        Object.assign(state, { qtyPendingSince:0, qtyLastFillAt:0, qtyLastConfirmAt:0, qtyRecoveryCount:0 });
        if (scr === 'SUCCESS') { state.stage = 'AFTER_SUCCESS'; renderUI(); return; }
        renderUI(); return;
      }

      if (state.stage === 'DEST') {
        if (scr === 'SCAN_DEST') {
          if (shouldThrottle()) return;
          await actFillAndConfirm(state.dest, { postSetDelay: 30, retries: 2, waitConfirmEnabled: true });
          state.stage = 'AFTER_SUCCESS'; state.lastError = ''; renderUI(); return;
        }
        if (scr === 'SUCCESS') { state.stage = 'AFTER_SUCCESS'; renderUI(); return; }
        if (scr === 'SCAN_SOURCE' && sourceMatches) { state.stage = 'ITEM'; renderUI(); return; }
        renderUI(); return;
      }

      if (state.stage === 'AFTER_SUCCESS') {
        if (scr !== 'SUCCESS' && scr !== 'SCAN_SOURCE' && scr !== 'SCAN_ITEM') { renderUI(); return; }
        state.idx += 1;
        Object.assign(state, { qtyPendingSince:0, qtyLastFillAt:0, qtyLastConfirmAt:0, qtyRecoveryCount:0 });
        if (state.idx >= state.queue.length) { await finishRunAndClearAll(); return; }
        state.cur = state.queue[state.idx]?.code || '';
        state.stage = scr === 'SCAN_ITEM' ? 'ITEM' : (scr === 'SCAN_SOURCE' ? (sourceMatches ? 'ITEM' : 'SOURCE') : 'ITEM');
        renderUI(); return;
      }

      renderUI();
    } catch (e) {
      state.lastError = (e && e.message) ? `Error: ${e.message}` : 'Unknown error';
      console.error('[SLH]', e);
      renderUI();
    } finally {
      state.busy = false;
    }
  }

  setInterval(() => { tick(); }, 120);
})();

/* ===== ORIGINAL SCRIPT 3: QTY Barcode Helper ===== */

// ==UserScript==
// @name         v1.2.6 QTY Barcode Helper (Qty + Clear Tote + Inline Expiry Picker)
// @namespace    Violentmonkey Scripts
// @version      1.2.6
// @description  QTY quick select, CLEAR TOTE, always-visible Month / Day / Year selectors, translucent expiry window, and PAO +900 days footer.
// @author       (USER)
// @match        *://aft-poirot-website-*.proxy.amazon.com/*
// @match        *://aft-poirot-website-*.nrt.proxy.amazon.com/*
// @match        https://aft-poirot-website-nrt.nrt.proxy.amazon.com/*
// @match        *://aft-poirot-website-*.corp.amazon.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const TRIGGER_REGEX = /^QTY(\d{1,3})$/i;
  const SCAN_TIMEOUT_MS = 80;

  const PANEL_ID = 'qty-helper-panel-v105';
  const STYLE_ID = 'qty-helper-style-v105';
  const HIDDEN_KEY = 'qty_helper_hidden_v106';

  const CLEAR_TOTE_ARM_MS = 1600;
  const CLEAR_TOTE_WAIT_MS = 2400;

  let buffer = '';
  let lastKeyTime = 0;
  let busy = false;
  let panelTicking = false;
  let clearToteBusy = false;
  let clearToteArmedUntil = 0;
  let paoBusy = false;
  let paoLastScanAt = 0;
  let paoPromptShowing = false;
  let paoManualUntilScreenChange = false;
  let paoLastScreen = 'UNKNOWN';
  let paoDockReposition = null;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const raf = () => new Promise(r => requestAnimationFrame(r));
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

  function isVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function qs(sel, root = document) {
    try { return root.querySelector(sel); } catch { return null; }
  }

  function qsa(sel, root = document) {
    try { return Array.from(root.querySelectorAll(sel)); } catch { return []; }
  }

  function setReactTrackedValue(input, value) {
    if (!input) return false;

    const proto = Object.getPrototypeOf(input);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    const prev = input.value;

    if (desc && desc.set) desc.set.call(input, value);
    else input.value = value;

    const tracker = input._valueTracker;
    if (tracker && typeof tracker.setValue === 'function') tracker.setValue(prev);

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function fireKey(el, type, key) {
    if (!el) return;

    let keyCode = 0;
    if (key === 'Enter') keyCode = 13;
    else if (key === 'Backspace') keyCode = 8;
    else if (/^\d$/.test(key)) keyCode = key.charCodeAt(0);

    const opts = {
      key,
      code: key === 'Enter' ? 'Enter' : key === 'Backspace' ? 'Backspace' : `Digit${key}`,
      keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true
    };

    el.dispatchEvent(new KeyboardEvent(type, opts));
  }

  function fireEnter(el) {
    fireKey(el, 'keydown', 'Enter');
    fireKey(el, 'keypress', 'Enter');
    fireKey(el, 'keyup', 'Enter');
  }

  function clickEl(el) {
    if (!el) return false;
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    el.click();
    return true;
  }

  function findVisibleExactText(target) {
    const wanted = norm(target);
    const nodes = qsa('h1,h2,h3,h4,label,legend,span,div,p,strong,b,button');

    for (const el of nodes) {
      if (!isVisible(el)) continue;
      if (norm(el.textContent || '') === wanted) return el;
    }
    return null;
  }

  function getConfirmButton() {
    const byId = qs('#confirm-button');
    if (byId && isVisible(byId)) return byId;

    const buttons = qsa('button').filter(isVisible);
    const label = (b) => norm((b.innerText || b.textContent || '').replace(/\s+/g, ' '));

    return buttons.find(b => /item\s*match/.test(label(b)))
      || buttons.find(b => /^confirm\b/.test(label(b)))
      || buttons.find(b => /confirm/.test(label(b)))
      || null;
  }

  function getScreen() {
    if (findVisibleExactText('Enter quantity')) return 'ENTER_QTY';
    if (findVisibleExactText('Verify item')) return 'VERIFY_ITEM';
    if (findVisibleExactText('Scan item')) return 'SCAN_ITEM';
    if (findVisibleExactText('Scan source container')) return 'SCAN_SOURCE';
    if (findVisibleExactText('Scan destination container')) return 'SCAN_DEST';
    if (findVisibleExactText('Enter expiry date displayed on item') || findVisibleExactText('Enter expiration date displayed on item')) return 'EXPIRY';

    const text = norm((document.body?.innerText || '').slice(0, 8000));
    if (text.includes('enter quantity')) return 'ENTER_QTY';
    if (text.includes('verify item')) return 'VERIFY_ITEM';
    if (text.includes('scan item')) return 'SCAN_ITEM';
    if (text.includes('scan source container')) return 'SCAN_SOURCE';
    if (text.includes('scan destination container')) return 'SCAN_DEST';
    if (text.includes('enter expiry date') || text.includes('enter expiration date')) return 'EXPIRY';

    const btn = getConfirmButton();
    const btnLabel = norm((btn && (btn.innerText || btn.textContent)) || '');
    if (btnLabel.includes('item match')) return 'VERIFY_ITEM';

    return 'UNKNOWN';
  }

  function getQtyInput() {
    const byId = qs('#scan-text-input');
    if (byId && isVisible(byId)) return byId;

    const inputs = qsa('input, textarea').filter(isVisible);
    const normAttr = (s) => (s || '').toString().toLowerCase();

    return inputs.find(el =>
      normAttr(el.type) === 'number' ||
      normAttr(el.inputMode) === 'numeric' ||
      /qty|quantity/i.test(normAttr(el.name) + ' ' + normAttr(el.id) + ' ' + normAttr(el.placeholder))
    ) || inputs.find(el => String(el.value ?? '').trim() === '0') || null;
  }

  function* walkDeep(root = document) {
    const stack = [root];
    while (stack.length) {
      const n = stack.pop();
      if (!n) continue;
      yield n;
      if (n.shadowRoot) stack.push(n.shadowRoot);
      if (n.children) {
        for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
      }
    }
  }

  function findButtonByTextDeep(labels) {
    const wanted = labels.map(norm);
    for (const el of walkDeep(document)) {
      if (!(el instanceof Element)) continue;
      if (!isVisible(el)) continue;
      const clickable = /^(button|a|alchemy-button|mdw-button)$/i.test(el.tagName) || el.getAttribute('role') === 'button' || el.id === 'change-container-button';
      if (!clickable) continue;
      const txt = norm(el.textContent || el.innerText || '');
      if (txt && wanted.some(w => txt.includes(w))) return el;
    }
    return null;
  }

  function getChangeContainerButton() {
    const byId = qs('#change-container-button');
    if (byId && isVisible(byId)) return byId;
    return findButtonByTextDeep(['change container [c]', 'change container']);
  }

  function getModalConfirmButton() {
    const scopes = [
      document.getElementById('modal-root'),
      ...document.querySelectorAll('[role="dialog"], .modal, .Dialog, .dialog, .ReactModal__Content')
    ].filter(Boolean);

    const labels = ['yes', 'empty', 'confirm', 'ok', 'yes, close'];

    const scan = (root) => {
      const btns = qsa('button,[role="button"],input[type="button"],input[type="submit"],alchemy-button,mdw-button', root)
        .filter(isVisible);
      for (const b of btns) {
        const txt = norm(b.textContent || b.innerText || b.value || '');
        if (!txt) continue;
        if (labels.some(label => txt === label || txt.includes(label))) return b;
      }
      return null;
    };

    for (const scope of scopes) {
      const hit = scan(scope);
      if (hit) return hit;
    }
    return scan(document);
  }

  async function waitForElement(getter, timeoutMs = 1600) {
    const deadline = performance.now() + timeoutMs;
    let el = null;
    while (!el && performance.now() < deadline) {
      await raf();
      el = getter();
    }
    return el;
  }

  async function typeQty(input, qty) {
    if (!input) return false;

    try {
      input.focus();
      if (typeof input.select === 'function') input.select();
      if (typeof input.setSelectionRange === 'function') {
        const len = String(input.value ?? '').length;
        input.setSelectionRange(0, len);
      }
    } catch {}

    fireKey(input, 'keydown', 'Backspace');
    setReactTrackedValue(input, '');
    fireKey(input, 'keyup', 'Backspace');
    await sleep(12);

    const strQty = String(qty);
    let built = '';
    for (const ch of strQty) {
      fireKey(input, 'keydown', ch);
      built += ch;
      setReactTrackedValue(input, built);
      input.setAttribute('value', built);
      fireKey(input, 'keyup', ch);
      await sleep(10);
    }

    input.dispatchEvent(new Event('blur', { bubbles: true }));
    await sleep(20);

    return String(input.value ?? '').trim() === strQty;
  }



  function getPAODateParts() {
    const d = new Date();
    d.setDate(d.getDate() + 900);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    return { mm, dd, yyyy, label: `${mm}/${dd}/${yyyy}` };
  }

  function getExpiryInputs() {
    const inputs = qsa('input, textarea')
      .filter(el => isVisible(el) && !el.closest('#' + PANEL_ID));

    const byHint = (re) => inputs.find(el => re.test(norm(`${el.name || ''} ${el.id || ''} ${el.placeholder || ''} ${el.getAttribute('aria-label') || ''}`)));

    const month = byHint(/\b(mm|month)\b/);
    const day = byHint(/\b(dd|day)\b/);
    const year = byHint(/\b(yyyy|year)\b/);

    if (month && day && year) return { month, day, year };

    const textInputs = inputs.filter(el => {
      const type = norm(el.type || 'text');
      return !type || ['text', 'tel', 'number', 'search'].includes(type);
    });

    if (textInputs.length >= 3) return { month: textInputs[0], day: textInputs[1], year: textInputs[2] };
    return null;
  }

  async function waitForExpiryInputs(timeoutMs = 4500) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (getScreen() === 'EXPIRY') {
        const inputs = getExpiryInputs();
        if (inputs) return inputs;
      }
      await sleep(45);
    }
    return null;
  }

  async function waitForScreen(screen, timeoutMs = 2500) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const current = getScreen();
      if (current === screen) return true;
      await sleep(35);
    }
    return false;
  }

  function getScanItemInput() {
    const byId = qs('#scan-text-input');
    if (byId && isVisible(byId) && !byId.closest('#' + PANEL_ID)) return byId;
    return qsa('input, textarea').filter(el => isVisible(el) && !el.closest('#' + PANEL_ID))[0] || null;
  }

  async function pressScanItemEnterIfStuck(scannedCode = '') {
    await sleep(90);
    if (getScreen() !== 'SCAN_ITEM') return;

    const input = getScanItemInput();
    if (input) {
      try { input.focus(); } catch {}
      if (scannedCode && !String(input.value || '').trim()) {
        setReactTrackedValue(input, scannedCode);
        input.setAttribute('value', scannedCode);
        await sleep(20);
      }
    }

    const btn = getConfirmButton();
    if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') clickEl(btn);
    else fireEnter(input || document.body);
  }

  async function pressVerifyItemIfShown(timeoutMs = 3500) {
    const seenVerify = await waitForScreen('VERIFY_ITEM', timeoutMs);
    if (!seenVerify) return false;

    await sleep(70);
    const btn = getConfirmButton();
    if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') clickEl(btn);
    else fireEnter(document.body);
    return true;
  }

  function fillOneExpiryInput(input, value) {
    if (!input) return false;
    try {
      input.focus();
      if (typeof input.select === 'function') input.select();
    } catch {}
    setReactTrackedValue(input, '');
    setReactTrackedValue(input, String(value));
    input.setAttribute('value', String(value));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }

  function makeExpiryDateParts(month, day, year) {
    const m = Number(month);
    const d = Number(day);
    const y = Number(year);
    if (!Number.isInteger(m) || !Number.isInteger(d) || !Number.isInteger(y)) return null;

    const check = new Date(y, m - 1, d);
    if (check.getFullYear() !== y || check.getMonth() !== m - 1 || check.getDate() !== d) return null;

    const mm = String(m).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    const yyyy = String(y);
    return { mm, dd, yyyy, label: `${mm}/${dd}/${yyyy}` };
  }

  function isFutureOrTodayExpiry(month, day, year) {
    const parts = makeExpiryDateParts(month, day, year);
    if (!parts) return false;

    const selected = new Date(Number(parts.yyyy), Number(parts.mm) - 1, Number(parts.dd));
    selected.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return selected >= today;
  }

  async function fillExpiryDateParts(parts) {
    if (!parts || paoBusy || busy || clearToteBusy) return;
    paoBusy = true;
    schedulePanelRefresh();

    try {
      const inputs = await waitForExpiryInputs(6500);
      if (!inputs) return;

      fillOneExpiryInput(inputs.month, parts.mm);
      await sleep(35);
      fillOneExpiryInput(inputs.day, parts.dd);
      await sleep(35);
      fillOneExpiryInput(inputs.year, parts.yyyy);
      await sleep(60);

      const btn = getConfirmButton();
      if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') {
        clickEl(btn);
      } else {
        fireEnter(inputs.year);
      }
    } finally {
      setTimeout(() => {
        paoBusy = false;
        schedulePanelRefresh();
      }, 300);
    }
  }

  async function fillPAOExpiryDateNow() {
    await fillExpiryDateParts(getPAODateParts());
  }

  async function focusManualExpiryMonthBox() {
    const inputs = await waitForExpiryInputs(2500);
    const month = inputs?.month;
    if (!month) return false;

    try {
      month.focus();
      if (typeof month.select === 'function') month.select();
      if (typeof month.setSelectionRange === 'function') {
        const len = String(month.value ?? '').length;
        month.setSelectionRange(0, len);
      }
      month.scrollIntoView?.({ block: 'center', inline: 'nearest' });
      return true;
    } catch {
      try { month.focus(); return true; } catch {}
    }
    return false;
  }

  async function advanceItemScanAfterBarcode(scannedCode = '') {
    if (paoBusy || busy || clearToteBusy) return;
    const now = Date.now();
    if (now - paoLastScanAt < 450) return;
    paoLastScanAt = now;

    await pressScanItemEnterIfStuck(scannedCode);
    await pressVerifyItemIfShown(4500);
    setTimeout(checkExpiryPrompt, 250);
  }

  function removePAOPrompt() {
    if (paoDockReposition) {
      window.removeEventListener('resize', paoDockReposition, true);
      window.removeEventListener('scroll', paoDockReposition, true);
      paoDockReposition = null;
    }

    const existing = qs('#qty-helper-pao-prompt');
    if (existing) existing.remove();
    paoPromptShowing = false;
  }

  const EXPIRY_MONTHS = [
    ['JAN', 1], ['FEB', 2], ['MAR', 3], ['APR', 4],
    ['MAY', 5], ['JUN', 6], ['JUL', 7], ['AUG', 8],
    ['SEP', 9], ['OCT', 10], ['NOV', 11], ['DEC', 12],
  ];

  function getPickerMaxDay(month) {
    const m = Number(month);
    if (m === 2) return 29;
    if ([4, 6, 9, 11].includes(m)) return 30;
    return 31;
  }

  function setExpiryDockBoxPosition(el, rect) {
    if (!el || !rect) return;

    const viewportGap = 6;
    const left = Math.max(viewportGap, Math.min(rect.left, window.innerWidth - viewportGap - 180));
    const maxWidth = Math.max(180, window.innerWidth - left - viewportGap);
    const width = Math.min(Math.max(180, rect.width), maxWidth);

    Object.assign(el.style, {
      left: `${Math.round(left)}px`,
      top: `${Math.round(rect.bottom + 6)}px`,
      width: `${Math.round(width)}px`,
    });
  }

  function positionExpiryDock(prompt) {
    if (!prompt || !prompt.isConnected || getScreen() !== 'EXPIRY') return;

    const inputs = getExpiryInputs();
    if (!inputs) return;

    const map = [
      ['month', inputs.month],
      ['day', inputs.day],
      ['year', inputs.year],
    ];

    const panelBottoms = [];
    const fieldRects = [];

    for (const [name, input] of map) {
      const panel = prompt.querySelector(`[data-pao-dock="${name}"]`);
      if (!panel || !input) continue;

      const rect = input.getBoundingClientRect();
      fieldRects.push(rect);
      setExpiryDockBoxPosition(panel, rect);

      const panelRect = panel.getBoundingClientRect();
      panelBottoms.push(panelRect.bottom);
    }

    const footer = prompt.querySelector('[data-pao-dock="footer"]');
    if (!footer || !fieldRects.length) return;

    const viewportGap = 6;
    const minLeft = Math.max(viewportGap, Math.min(...fieldRects.map(r => r.left)));
    const maxRight = Math.min(window.innerWidth - viewportGap, Math.max(...fieldRects.map(r => r.right)));
    const footerTop = Math.max(...panelBottoms, ...fieldRects.map(r => r.bottom)) + 8;

    Object.assign(footer.style, {
      left: `${Math.round(minLeft)}px`,
      top: `${Math.round(footerTop)}px`,
      width: `${Math.max(240, Math.round(maxRight - minLeft))}px`,
    });

    const backing = prompt.querySelector('[data-pao-dock="window"]');
    if (backing) {
      const boxes = [
        ...Array.from(prompt.querySelectorAll('.pao-dock-panel')).map(el => el.getBoundingClientRect()),
        footer.getBoundingClientRect(),
      ].filter(r => r.width > 0 && r.height > 0);

      if (boxes.length) {
        const pad = 9;
        const left = Math.max(4, Math.min(...boxes.map(r => r.left)) - pad);
        const top = Math.max(4, Math.min(...boxes.map(r => r.top)) - pad);
        const right = Math.min(window.innerWidth - 4, Math.max(...boxes.map(r => r.right)) + pad);
        const bottom = Math.min(window.innerHeight - 4, Math.max(...boxes.map(r => r.bottom)) + pad);

        Object.assign(backing.style, {
          left: `${Math.round(left)}px`,
          top: `${Math.round(top)}px`,
          width: `${Math.max(260, Math.round(right - left))}px`,
          height: `${Math.max(80, Math.round(bottom - top))}px`,
        });
      }
    }
  }

  function renderExpiryPicker(prompt, selection) {
    if (!prompt) return;

    const monthLabel = EXPIRY_MONTHS.find(([, value]) => value === selection.month)?.[0] || '';
    const maxDay = selection.month ? getPickerMaxDay(selection.month) : 31;
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 16 }, (_, i) => currentYear + i);
    const paoParts = getPAODateParts();

    const monthButtons = EXPIRY_MONTHS.map(([label, value]) => `
      <button
        type="button"
        data-pao-action="month"
        data-value="${value}"
        class="${selection.month === value ? 'is-selected' : ''}"
      >${label}</button>
    `).join('');

    const dayContent = `<div class="pao-picker-grid pao-day-grid">
      ${Array.from({ length: 31 }, (_, i) => i + 1).map(day => {
        const disabled = !selection.month || day > maxDay;
        return `
          <button
            type="button"
            data-pao-action="day"
            data-value="${day}"
            class="${selection.day === day ? 'is-selected' : ''}"
            ${disabled ? 'disabled' : ''}
          >${day}</button>
        `;
      }).join('')}
    </div>`;

    const yearContent = `<div class="pao-picker-grid pao-year-grid">
      ${years.map(year => {
        const disabled = !selection.month || !selection.day || !isFutureOrTodayExpiry(selection.month, selection.day, year);
        return `
          <button
            type="button"
            data-pao-action="year"
            data-value="${year}"
            class="${selection.year === year ? 'is-selected' : ''}"
            ${disabled ? 'disabled' : ''}
          >${year}</button>
        `;
      }).join('')}
    </div>`;

    prompt.innerHTML = `
      <div class="pao-dock-window" data-pao-dock="window"></div>

      <section class="pao-dock-panel" data-pao-dock="month">
        <div class="pao-dock-title">
          <span>MONTH</span>
          <strong>${monthLabel || '—'}</strong>
        </div>
        <div class="pao-picker-grid pao-month-grid">${monthButtons}</div>
      </section>

      <section class="pao-dock-panel" data-pao-dock="day">
        <div class="pao-dock-title">
          <span>DAY</span>
          <strong>${selection.day ? String(selection.day).padStart(2, '0') : '—'}</strong>
        </div>
        ${dayContent}
      </section>

      <section class="pao-dock-panel" data-pao-dock="year">
        <div class="pao-dock-title">
          <span>YEAR</span>
          <strong>${selection.year || '—'}</strong>
        </div>
        ${yearContent}
      </section>

      <div class="pao-dock-footer" data-pao-dock="footer">
        <button type="button" class="pao-yes" data-pao-action="pao">
          PAO +900 DAYS <span>${paoParts.label}</span>
        </button>
      </div>
    `;

    requestAnimationFrame(() => positionExpiryDock(prompt));
  }

  function showPAOPrompt() {
    if (paoPromptShowing || paoManualUntilScreenChange || paoBusy || busy || clearToteBusy) return;
    if (getScreen() !== 'EXPIRY') return;

    paoPromptShowing = true;
    const selection = { month: null, day: null, year: null };
    const prompt = document.createElement('div');
    prompt.id = 'qty-helper-pao-prompt';

    paoDockReposition = () => positionExpiryDock(prompt);
    window.addEventListener('resize', paoDockReposition, true);
    window.addEventListener('scroll', paoDockReposition, true);

    renderExpiryPicker(prompt, selection);
    (document.body || document.documentElement).appendChild(prompt);
    requestAnimationFrame(paoDockReposition);

    prompt.addEventListener('click', async (e) => {
      const button = e.target.closest('button[data-pao-action]');
      if (!button || button.disabled) return;

      e.preventDefault();
      e.stopPropagation();

      const action = button.dataset.paoAction;
      const value = Number(button.dataset.value);
      const inputs = getExpiryInputs();

      if (action === 'pao') {
        removePAOPrompt();
        await fillPAOExpiryDateNow();
        return;
      }

      if (action === 'month') {
        selection.month = value;
        selection.day = null;
        selection.year = null;

        if (inputs?.month) {
          fillOneExpiryInput(inputs.month, String(value).padStart(2, '0'));
          if (inputs.day) {
            setReactTrackedValue(inputs.day, '');
            inputs.day.setAttribute('value', '');
          }
          if (inputs.year) {
            setReactTrackedValue(inputs.year, '');
            inputs.year.setAttribute('value', '');
          }
        }

        renderExpiryPicker(prompt, selection);
        return;
      }

      if (action === 'day') {
        selection.day = value;
        selection.year = null;

        if (inputs?.day) {
          fillOneExpiryInput(inputs.day, String(value).padStart(2, '0'));
          if (inputs.year) {
            setReactTrackedValue(inputs.year, '');
            inputs.year.setAttribute('value', '');
          }
        }

        renderExpiryPicker(prompt, selection);
        return;
      }

      if (action === 'year') {
        selection.year = value;
        const selectedParts = makeExpiryDateParts(selection.month, selection.day, selection.year);
        if (!selectedParts || !isFutureOrTodayExpiry(selection.month, selection.day, selection.year)) return;

        removePAOPrompt();
        await fillExpiryDateParts(selectedParts);
      }
    }, true);
  }

  function checkExpiryPrompt() {
    const screen = getScreen();
    if (screen !== paoLastScreen) {
      paoLastScreen = screen;
      if (screen !== 'EXPIRY') {
        paoManualUntilScreenChange = false;
        removePAOPrompt();
      }
    }

    if (screen === 'EXPIRY') {
      showPAOPrompt();
      if (paoDockReposition) paoDockReposition();
    }
  }

  async function handleQTY(qty) {
    if (busy || clearToteBusy) return;
    busy = true;
    schedulePanelRefresh();

    try {
      const screen = getScreen();

      if (screen === 'VERIFY_ITEM') {
        const btn = getConfirmButton();
        if (btn) clickEl(btn);
      }

      let qtyInput = null;
      for (let i = 0; i < 20; i++) {
        qtyInput = getQtyInput();
        if (qtyInput) break;
        await sleep(40);
      }

      if (!qtyInput) return;

      const ok = await typeQty(qtyInput, qty);
      if (!ok) return;

      await sleep(25);

      const btn = getConfirmButton();
      if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') {
        clickEl(btn);
        await sleep(15);
      }

      fireEnter(qtyInput);
    } finally {
      setTimeout(() => {
        busy = false;
        schedulePanelRefresh();
      }, 150);
    }
  }

  async function runClearTote() {
    if (clearToteBusy || busy) return false;
    clearToteBusy = true;
    schedulePanelRefresh();

    try {
      const changeBtn = getChangeContainerButton() || await waitForElement(getChangeContainerButton, 1200);
      if (!changeBtn) return false;

      clickEl(changeBtn);

      const confirmBtn = getModalConfirmButton() || await waitForElement(getModalConfirmButton, CLEAR_TOTE_WAIT_MS);
      if (!confirmBtn) return false;

      clickEl(confirmBtn);
      await sleep(80);
      return true;
    } finally {
      setTimeout(() => {
        clearToteBusy = false;
        schedulePanelRefresh();
      }, 250);
    }
  }

  function readHidden() {
    try { return localStorage.getItem(HIDDEN_KEY) === '1'; } catch { return false; }
  }

  function writeHidden(v) {
    try { localStorage.setItem(HIDDEN_KEY, v ? '1' : '0'); } catch {}
  }

  function ensureStyle() {
    if (qs('#' + STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      #${PANEL_ID} {
        position: fixed;
        left: 14px;
        bottom: 14px;
        z-index: 2147483646;
        width: 332px;
        box-sizing: border-box;
        background: rgba(255, 255, 255, 0.72);
        color: #233043;
        border: 1px solid rgba(28, 45, 68, 0.10);
        border-radius: 14px;
        box-shadow: 0 8px 20px rgba(27, 39, 55, 0.10);
        padding: 10px 10px 12px;
        font: 12px/1.3 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        backdrop-filter: blur(3px);
        -webkit-backdrop-filter: blur(3px);
      }
      #${PANEL_ID}[data-hidden="1"] .qty-helper-body {
        display: none;
      }
      #${PANEL_ID} .qty-helper-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 6px;
      }
      #${PANEL_ID} .qty-helper-title {
        font-weight: 800;
        letter-spacing: 0.15px;
        color: rgba(22, 37, 57, 0.78);
      }
      #${PANEL_ID} .qty-helper-toggle {
        border: 1px solid rgba(30, 46, 70, 0.10);
        background: rgba(255,255,255,0.55);
        color: rgba(22, 37, 57, 0.76);
        border-radius: 9px;
        padding: 5px 10px;
        cursor: pointer;
        font-weight: 700;
      }
      #${PANEL_ID} .qty-helper-sub {
        opacity: 0.64;
        margin-bottom: 10px;
      }
      #qty-helper-pao-prompt {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        pointer-events: none;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      }
      #qty-helper-pao-prompt .pao-dock-window {
        position: fixed;
        z-index: 0;
        pointer-events: none;
        box-sizing: border-box;
        background: rgba(15, 23, 42, .64);
        border: 1px solid rgba(255, 255, 255, .24);
        border-radius: 16px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, .34);
        backdrop-filter: blur(7px);
        -webkit-backdrop-filter: blur(7px);
      }
      #qty-helper-pao-prompt .pao-dock-panel,
      #qty-helper-pao-prompt .pao-dock-footer {
        position: fixed;
        z-index: 1;
        box-sizing: border-box;
        pointer-events: auto;
      }
      #qty-helper-pao-prompt .pao-dock-panel {
        max-height: calc(100vh - 230px);
        overflow: auto;
        background: rgba(255,255,255,.94);
        color: #111827;
        border: 2px solid #f97316;
        border-radius: 11px;
        box-shadow: 0 8px 22px rgba(0,0,0,.20);
        padding: 8px;
      }
      #qty-helper-pao-prompt .pao-dock-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        min-height: 24px;
        margin-bottom: 6px;
        color: #9a3412;
        font-size: 12px;
        font-weight: 1000;
        letter-spacing: .25px;
      }
      #qty-helper-pao-prompt .pao-dock-title strong {
        color: #111827;
        font-size: 13px;
      }
      #qty-helper-pao-prompt button {
        border: 0;
        border-radius: 8px;
        font-weight: 1000;
        cursor: pointer;
      }
      #qty-helper-pao-prompt button:active {
        transform: translateY(1px);
      }
      #qty-helper-pao-prompt button:disabled {
        opacity: .48;
        cursor: not-allowed;
        transform: none;
      }
      #qty-helper-pao-prompt .pao-picker-grid {
        display: grid;
        gap: 5px;
      }
      #qty-helper-pao-prompt .pao-picker-grid button {
        min-height: 34px;
        padding: 0 3px;
        background: #eef2ff;
        color: #1e3a8a;
        border: 1px solid #c7d2fe;
        font-size: 13px;
      }
      #qty-helper-pao-prompt .pao-picker-grid button.is-selected {
        background: #2563eb;
        color: #fff;
        border-color: #1d4ed8;
        box-shadow: 0 0 0 2px rgba(37,99,235,.16);
      }
      #qty-helper-pao-prompt .pao-month-grid,
      #qty-helper-pao-prompt .pao-year-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
      #qty-helper-pao-prompt .pao-day-grid {
        grid-template-columns: repeat(7, minmax(0, 1fr));
      }
      #qty-helper-pao-prompt .pao-dock-wait {
        display: grid;
        place-items: center;
        min-height: 74px;
        border: 1px dashed #cbd5e1;
        border-radius: 8px;
        background: #f8fafc;
        color: #64748b;
        font-size: 13px;
        font-weight: 850;
      }
      #qty-helper-pao-prompt .pao-dock-footer {
        min-height: 50px;
        padding: 0;
      }
      #qty-helper-pao-prompt .pao-yes {
        width: 100%;
        min-height: 50px;
        background: #7c3aed;
        color: #fff;
        border: 2px solid #6d28d9;
        border-radius: 11px;
        box-shadow: 0 8px 22px rgba(0,0,0,.28), 0 0 0 1px rgba(255,255,255,.16) inset;
        font-size: 16px;
      }
      #qty-helper-pao-prompt .pao-yes:hover {
        background: #6d28d9;
      }
      #qty-helper-pao-prompt .pao-yes span {
        margin-left: 10px;
        font-size: 12px;
        opacity: .94;
      }
      #${PANEL_ID} .qty-helper-grid {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 10px;
      }
      #${PANEL_ID} .qty-helper-btn {
        min-height: 52px;
        border: 1px solid rgba(34, 52, 78, 0.12);
        background: rgba(248, 250, 252, 0.92);
        color: #1f2f46;
        border-radius: 12px;
        padding: 0;
        cursor: pointer;
        font-weight: 800;
        font-size: 18px;
        text-align: center;
        user-select: none;
        box-shadow: 0 1px 0 rgba(255,255,255,0.7) inset;
      }
      #${PANEL_ID} .qty-helper-btn:hover {
        background: rgba(241, 245, 249, 0.98);
      }
      #${PANEL_ID} .qty-helper-btn:active {
        transform: translateY(1px);
      }
      #${PANEL_ID} .qty-helper-btn:disabled {
        opacity: 0.45;
        cursor: default;
      }
      #${PANEL_ID} .qty-helper-clear {
        width: 100%;
        margin-top: 10px;
        min-height: 46px;
        border: 1px solid rgba(153, 27, 27, 0.16);
        background: rgba(255, 247, 237, 0.96);
        color: #9a3412;
        border-radius: 12px;
        padding: 0 12px;
        cursor: pointer;
        font-weight: 900;
        font-size: 15px;
        letter-spacing: 0.2px;
        text-align: center;
      }
      #${PANEL_ID} .qty-helper-clear.is-armed {
        background: rgba(254, 226, 226, 0.98);
        color: #991b1b;
        border-color: rgba(153, 27, 27, 0.28);
      }
      #${PANEL_ID} .qty-helper-clear:disabled {
        opacity: 0.5;
        cursor: default;
      }
      #${PANEL_ID} .qty-helper-foot {
        margin-top: 10px;
        opacity: 0.56;
        font-size: 11px;
      }
    `;
    document.documentElement.appendChild(s);
  }

  function shouldShowPanel() {
    // v0.9.23: Do not hide during Sideline screen transitions.
    // Visibility is controlled only by the QTY dock toggle / persisted hidden key.
    return !readHidden();
  }

  function ensurePanel() {
    ensureStyle();

    let panel = qs('#' + PANEL_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;
      panel.setAttribute('data-hidden', readHidden() ? '1' : '0');
      panel.innerHTML = `
        <div class="qty-helper-head">
          <div class="qty-helper-title">Qty quick select</div>
          <button type="button" class="qty-helper-toggle">Hide</button>
        </div>
        <div class="qty-helper-body">
          <div class="qty-helper-grid"></div>
          <button type="button" class="qty-helper-clear" title="Double-click to clear current tote">CLEAR TOTE</button>
        </div>
      `;
      (document.body || document.documentElement).appendChild(panel);

      const grid = panel.querySelector('.qty-helper-grid');
      for (let i = 1; i <= 10; i++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'qty-helper-btn';
        b.textContent = String(i);
        b.title = 'QTY' + i;
        b.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          handleQTY(i);
        }, true);
        grid.appendChild(b);
      }


      const clearBtn = panel.querySelector('.qty-helper-clear');
      clearBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const now = Date.now();
        const armed = clearToteArmedUntil > now;

        if (!armed) {
          clearToteArmedUntil = now + CLEAR_TOTE_ARM_MS;
          schedulePanelRefresh();
          setTimeout(() => schedulePanelRefresh(), CLEAR_TOTE_ARM_MS + 20);
          return;
        }

        clearToteArmedUntil = 0;
        schedulePanelRefresh();
        await runClearTote();
      }, true);

      const toggle = panel.querySelector('.qty-helper-toggle');
      toggle.addEventListener('click', () => {
        const hidden = panel.getAttribute('data-hidden') === '1';
        panel.setAttribute('data-hidden', hidden ? '0' : '1');
        writeHidden(hidden ? false : true);
        toggle.textContent = hidden ? 'Hide' : 'Show';
      }, true);
    }

    const hiddenNow = readHidden();
    panel.setAttribute('data-hidden', hiddenNow ? '1' : '0');
    panel.style.display = shouldShowPanel() ? 'block' : 'none';
    qsa('.qty-helper-btn', panel).forEach(btn => { btn.disabled = busy || clearToteBusy || paoBusy; });


    const clearBtn = qs('.qty-helper-clear', panel);
    if (clearBtn) {
      const armed = clearToteArmedUntil > Date.now();
      clearBtn.disabled = busy || clearToteBusy || paoBusy;
      clearBtn.classList.toggle('is-armed', armed);
      clearBtn.textContent = clearToteBusy ? 'CLEARING…' : armed ? 'DOUBLE-CLICK AGAIN' : 'CLEAR TOTE';
    }

    const toggle = panel.querySelector('.qty-helper-toggle');
    if (toggle) {
      const hidden = panel.getAttribute('data-hidden') === '1';
      toggle.textContent = hidden ? 'Show' : 'Hide';
    }

    return panel;
  }

  function schedulePanelRefresh() {
    if (panelTicking) return;
    panelTicking = true;
    requestAnimationFrame(() => {
      panelTicking = false;
      try { ensurePanel(); } catch {}
    });
  }

  document.addEventListener('keydown', function (e) {
    const now = Date.now();

    if (now - lastKeyTime > SCAN_TIMEOUT_MS) {
      buffer = '';
    }
    lastKeyTime = now;

    if (e.key.length === 1) {
      buffer += e.key;
      return;
    }

    if (e.key === 'Enter') {
      const scanned = buffer.toUpperCase();
      buffer = '';

      const match = scanned.match(TRIGGER_REGEX);
      if (!match) {
        // v0.9.28: Normal item scans must be left alone.
        // User may need to choose Damaged / No match / Item dimension issue.
        // PAO prompt still appears if app reaches EXPIRY screen via normal flow.
        return;
      }

      const qty = parseInt(match[1], 10);
      if (!Number.isFinite(qty) || qty <= 0) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      handleQTY(qty);
    }
  }, true);

  const boot = () => {
    schedulePanelRefresh();
    checkExpiryPrompt();
    setInterval(checkExpiryPrompt, 250);

    const mo = new MutationObserver(() => {
      schedulePanelRefresh();
    });

    try {
      mo.observe(document.documentElement, { childList: true, subtree: true });
    } catch {}
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();


/* ===== v0.9.24-clean: OEM feature toggles ===== */
(() => {
  'use strict';

  const DOCK_ID = 'sideline-tabs-v0910';
  const SCRUB_PANEL_ID = 'scrubber-panel-v0910';
  const QTY_ID = 'qty-helper-panel-v105';
  const OLD_ACTIVE_KEY = 'sideline_v0910_active_tab';
  const QTY_VISIBLE_KEY = 'sideline_v0919_qty_visible';
  const FEATURE_KEYS = {
    tote: 'sideline_v0921_feature_tote_visible',
    scrubber: 'sideline_v0921_feature_scrubber_visible',
    lazy: 'sideline_v0921_feature_lazy_visible',
    qty: QTY_VISIBLE_KEY,
  };
  const FEATURES = [
    { key:'tote', label:'Tote', panelId:'tote-queue-panel-v0910', side:'right' },
    { key:'scrubber', label:'Scrub', panelId:SCRUB_PANEL_ID, side:'right' },
    { key:'lazy', label:'Lazy', panelId:'slh-panel', side:'right' },
    { key:'qty', label:'QTY', panelId:QTY_ID, side:'left' },
  ];

  function read(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : v === '1';
    } catch { return fallback; }
  }

  function write(key, val) {
    try { localStorage.setItem(key, val ? '1' : '0'); } catch {}
  }

  function legacyDefault(feature) {
    if (feature === 'qty') return read(QTY_VISIBLE_KEY, true);
    let old = 'lazy';
    try { old = localStorage.getItem(OLD_ACTIVE_KEY) || 'lazy'; } catch {}
    return feature === old;
  }

  function visible(feature) {
    return read(FEATURE_KEYS[feature], legacyDefault(feature));
  }

  function setVisible(feature, val) {
    write(FEATURE_KEYS[feature], val);
    if (feature === 'qty') {
      try { localStorage.setItem('qty_helper_hidden_v106', val ? '0' : '1'); } catch {}
    }
  }

  function ensureStyle() {
    if (document.getElementById('sideline-tabs-v0910-style')) return;
    const s = document.createElement('style');
    s.id = 'sideline-tabs-v0910-style';
    s.textContent = `
      #${DOCK_ID}{
        position:fixed!important; right:14px!important; bottom:12px!important;
        width:304px!important; max-width:calc(100vw - 28px)!important;
        display:grid!important; grid-template-columns:repeat(4,1fr)!important; gap:6px!important;
        padding:6px!important; box-sizing:border-box!important; z-index:2147483647!important;
        background:#ffffff!important; border:1px solid #c7d0dd!important;
        border-radius:4px!important; box-shadow:0 2px 8px rgba(0,0,0,.18)!important;
        font-family:Arial, Helvetica, sans-serif!important;
      }
      #${DOCK_ID} button{
        border:1px solid #aeb8c5!important; border-radius:3px!important; padding:8px 5px!important;
        font-weight:700!important; font-size:12px!important; line-height:1!important;
        cursor:pointer!important; color:#1f2937!important; background:#f5f7fa!important;
        white-space:nowrap!important; box-shadow:none!important;
      }
      #${DOCK_ID} button.is-on{
        background:#146eb4!important; color:#fff!important; border-color:#0f5c99!important;
      }
      #${DOCK_ID} button:hover{ filter:brightness(.98)!important; }

      #slh-mini, #slh-hide, #qty-helper-panel-v105 .qty-helper-toggle{
        display:none!important; pointer-events:none!important;
      }

      #tote-queue-panel-v0910, #scrubber-panel-v0910, #slh-panel, #qty-helper-panel-v105{
        background:#fff!important; color:#111827!important; border:1px solid #c7d0dd!important;
        border-radius:4px!important; box-shadow:0 2px 8px rgba(0,0,0,.18)!important;
        font-family:Arial, Helvetica, sans-serif!important; box-sizing:border-box!important;
      }
      #tote-queue-panel-v0910, #scrubber-panel-v0910, #slh-panel{
        right:14px!important; left:auto!important; top:auto!important;
        width:460px!important; max-width:calc(100vw - 28px)!important; z-index:2147483646!important;
      }
      #qty-helper-panel-v105{
        left:14px!important; right:auto!important; bottom:14px!important; top:auto!important;
        width:332px!important; max-width:calc(100vw - 28px)!important; z-index:2147483646!important;
      }

      #tote-queue-panel-v0910 > div:first-child,
      #scrubber-panel-v0910 > div:first-child,
      #qty-helper-panel-v105 .qty-helper-head,
      #slh-head{
        background:#f3f5f8!important; color:#111827!important; border-bottom:1px solid #d5dbe3!important;
        margin:-10px -10px 8px -10px!important; padding:9px 10px!important; border-radius:4px 4px 0 0!important;
        font-weight:700!important;
      }
      #slh-head{ margin:0!important; }
      #slh-title, #slh-badge, #qty-helper-panel-v105 .qty-helper-title{
        color:#111827!important;
      }
      #slh-badge{
        background:#e5e7eb!important; border:1px solid #c7d0dd!important; color:#111827!important;
      }
      #slh-body{ padding:8px 10px 10px!important; }
      .slh-card{
        background:#fff!important; border:1px solid #d5dbe3!important; border-radius:4px!important;
      }
      .slh-in, #tote-queue-panel-v0910 textarea, #qty-helper-panel-v105 button{
        border-radius:3px!important; border-color:#b8c2cf!important;
      }
      #tote-queue-panel-v0910 button,
      #scrubber-panel-v0910 button,
      #slh-actions .slh-btn,
      #qty-helper-panel-v105 .qty-helper-btn{
        border-radius:3px!important; box-shadow:none!important; font-weight:700!important;
      }
      #tote-queue-panel-v0910 button,
      #scrubber-panel-v0910 button,
      #slh-actions .slh-btn.start,
      #qty-helper-panel-v105 .qty-helper-btn{
        background:#146eb4!important; color:#fff!important; border:1px solid #0f5c99!important;
      }
      #slh-actions .slh-btn.pause{ background:#f5f7fa!important; color:#111827!important; border:1px solid #aeb8c5!important; }
      #slh-actions .slh-btn.stop, #qty-helper-panel-v105 .qty-helper-clear{
        background:#fff7ed!important; color:#9a3412!important; border:1px solid #fed7aa!important;
      }
      #slh-items{
        font-size:15px!important; max-height:220px!important;
      }
      .slh-statrow{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important;margin-bottom:8px!important;}
      .slh-statcard{background:#f3f5f8!important;border:1px solid #c7d0dd!important;border-radius:4px!important;padding:8px 10px!important;font-family:Arial, Helvetica, sans-serif!important;}
      .slh-statlabel{font-size:12px!important;font-weight:700!important;color:#4b5563!important;text-transform:uppercase!important;letter-spacing:.02em!important;}
      .slh-statbig{font-size:34px!important;line-height:1!important;font-weight:800!important;color:#111827!important;margin-top:2px!important;}
      .slh-curline{background:#fff7ed!important;border-color:#f59e0b!important;border-radius:4px!important;color:#111827!important;}
      .slh-curqty{background:#ffedd5!important;border-color:#fb923c!important;color:#9a3412!important;}
    `;
    document.documentElement.appendChild(s);
  }

  function show(el, yes) {
    if (!el) return;
    el.style.setProperty('display', yes ? 'block' : 'none', 'important');
    el.style.setProperty('visibility', yes ? 'visible' : 'hidden', 'important');
    el.style.setProperty('pointer-events', yes ? 'auto' : 'none', 'important');
  }

  function setPanelBase(el, side) {
    if (!el) return;
    el.style.setProperty('position', 'fixed', 'important');
    el.style.setProperty('top', 'auto', 'important');
    el.style.setProperty('z-index', '2147483646', 'important');
    el.style.setProperty('box-sizing', 'border-box', 'important');
    if (side === 'left') {
      el.style.setProperty('left', '14px', 'important');
      el.style.setProperty('right', 'auto', 'important');
      el.style.setProperty('bottom', '14px', 'important');
      el.style.setProperty('width', '332px', 'important');
      el.style.setProperty('max-width', 'calc(100vw - 28px)', 'important');
    } else {
      el.style.setProperty('right', '14px', 'important');
      el.style.setProperty('left', 'auto', 'important');
      el.style.setProperty('width', '460px', 'important');
      el.style.setProperty('max-width', 'calc(100vw - 28px)', 'important');
    }
  }

  function ensureDock() {
    ensureStyle();
    let dock = document.getElementById(DOCK_ID);
    if (!dock) {
      dock = document.createElement('div');
      dock.id = DOCK_ID;
      (document.body || document.documentElement).appendChild(dock);
    }
    if (dock.childElementCount !== FEATURES.length) {
      dock.innerHTML = '';
      for (const f of FEATURES) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = f.label;
        b.dataset.feature = f.key;
        b.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          setVisible(f.key, !visible(f.key));
          apply();
        }, true);
        dock.appendChild(b);
      }
    }
    dock.querySelectorAll('button').forEach(b => {
      const on = visible(b.dataset.feature);
      b.classList.toggle('is-on', on);
      b.title = `${b.textContent}: ${on ? 'shown' : 'hidden'}`;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function ensureScrubberPanel() {
    let panel = document.getElementById(SCRUB_PANEL_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = SCRUB_PANEL_ID;
      panel.style.padding = '10px';
      const title = document.createElement('div');
      title.textContent = 'Tote Scrubber';
      panel.appendChild(title);
      (document.body || document.documentElement).appendChild(panel);
    }
    const btn = document.getElementById('kadabra-toggle-singleton');
    if (btn && btn.parentElement !== panel) {
      panel.appendChild(btn);
      btn.style.setProperty('position', 'static', 'important');
      btn.style.setProperty('right', 'auto', 'important');
      btn.style.setProperty('top', 'auto', 'important');
      btn.style.setProperty('bottom', 'auto', 'important');
      btn.style.setProperty('left', 'auto', 'important');
      btn.style.setProperty('width', '100%', 'important');
      btn.style.setProperty('margin', '0', 'important');
    }
    return panel;
  }

  function stackRightPanels(panels) {
    let bottom = 58;
    for (const el of panels) {
      if (!el) continue;
      el.style.setProperty('bottom', `${bottom}px`, 'important');
      const h = Math.max(80, Math.ceil(el.getBoundingClientRect().height || 0));
      bottom += h + 10;
    }
  }

  function apply() {
    ensureDock();

    const map = {
      tote: document.getElementById('tote-queue-panel-v0910'),
      scrubber: ensureScrubberPanel(),
      lazy: document.getElementById('slh-panel'),
      qty: document.getElementById(QTY_ID),
    };

    for (const f of FEATURES) setPanelBase(map[f.key], f.side);

    const rightVisible = [];
    for (const f of FEATURES) {
      const el = map[f.key];
      const on = visible(f.key);
      if (f.key === 'qty' && el) {
        el.setAttribute('data-hidden', on ? '0' : '1');
        el.setAttribute('data-sideline-tab-hidden', on ? '0' : '1');
      }
      show(el, on);
      if (on && f.side === 'right') rightVisible.push(el);
    }
    stackRightPanels(rightVisible.reverse());

    show(document.getElementById('slh-mini'), false);
    show(document.getElementById('slh-hide'), false);
    ensureDock();
  }

  setInterval(apply, 800);
  window.addEventListener('click', () => setTimeout(apply, 40), true);
  window.addEventListener('focus', () => setTimeout(apply, 80), true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply, { once: true });
  } else {
    apply();
  }
})();
