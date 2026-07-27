// ==UserScript==
// @name         v0.1.0 SidelineApp Fast Tote Queue TEST
// @namespace    https://github.com/1Sirkkris
// @version      0.1.0
// @description  Standalone low-overhead Tote Queue test. Disable the merged helper's Tote Queue while testing.
// @match        https://aft-poirot-website-nrt.nrt.proxy.amazon.com/*
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SidelineApp_Fast_Tote_Queue_TEST.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SidelineApp_Fast_Tote_Queue_TEST.user.js
// @run-at       document-end
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  if (window.__fastToteQueueTest_v010) return;
  window.__fastToteQueueTest_v010 = true;

  const VERSION = '0.1.0';
  const PANEL_ID = 'fast-tote-queue-test';
  const STORE_KEY = 'fast_tote_queue_test_text';
  const HELPER_SELECTOR = `#${PANEL_ID}, #tote-queue-panel-v0910, #sideline-tabs-v0910, #slh-panel, #slh-mini, #qty-helper-panel-v105, #scrubber-panel-v0910, #kadabra-toggle-singleton`;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const norm = value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const pretty = raw => {
    const value = String(raw || '').trim();
    const match = value.match(/^([ct]s)x(.+)$/i);
    return match ? `${match[1].toLowerCase()}X${match[2]}` : value;
  };

  const state = {
    running: false,
    paused: false,
    busy: false,
    queue: [],
    index: 0,
    failed: [],
    wake: 0,
    inputCache: null,
    changeCache: null,
    root: null,
    textarea: null,
    status: null,
    errors: null,
  };

  function parseQueue(text) {
    const found = String(text || '').match(/\b(?:tsX|csX)[A-Za-z0-9_-]+\b/gi) || [];
    const seen = new Set();
    return found.map(pretty).filter(code => {
      const key = code.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function insideHelper(element) {
    let current = element;
    while (current) {
      if (current.nodeType === 1 && current.matches?.(HELPER_SELECTOR)) return true;
      current = current.parentElement || current.getRootNode?.().host || null;
    }
    return false;
  }

  function visible(element) {
    if (!(element instanceof Element) || !element.isConnected) return false;
    if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function usable(element) {
    return visible(element) && !element.disabled && !element.readOnly &&
      element.getAttribute('aria-disabled') !== 'true' && !element.hasAttribute('disabled');
  }

  function deepRoots() {
    const roots = [document];
    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.shadowRoot) roots.push(node.shadowRoot);
    }
    return roots;
  }

  function queryAllDeep(selector) {
    const output = [];
    for (const root of deepRoots()) {
      try { output.push(...root.querySelectorAll(selector)); } catch {}
    }
    return output;
  }

  function scanInput() {
    if (usable(state.inputCache) && !insideHelper(state.inputCache)) return state.inputCache;

    const direct = document.getElementById('scan-text-input');
    if (usable(direct) && !insideHelper(direct)) {
      state.inputCache = direct;
      return direct;
    }

    state.inputCache = queryAllDeep('input, textarea, [role="textbox"], [contenteditable="true"]')
      .find(element => {
        if (!usable(element) || insideHelper(element)) return false;
        const type = norm(element.type);
        return !type || ['text', 'search', 'tel'].includes(type) || element.tagName === 'TEXTAREA' || element.isContentEditable;
      }) || null;

    return state.inputCache;
  }

  function pageHeadingText() {
    const selectors = 'h1,h2,h3,[role="heading"],main header,.page-title,.screen-title';
    return queryAllDeep(selectors)
      .filter(element => visible(element) && !insideHelper(element))
      .slice(0, 20)
      .map(element => norm(element.textContent))
      .join(' ');
  }

  function isSourceScreen() {
    const input = scanInput();
    if (!input) return false;
    const heading = pageHeadingText();
    if (/scan source container/.test(heading)) return true;

    const nearby = norm(input.closest('main,form,section,div')?.textContent || '');
    return /scan source container/.test(nearby);
  }

  function limitedError() {
    const selectors = '[role="alert"], .alert, .error, .error-message, .notification-error, [data-testid*="error" i]';
    for (const element of queryAllDeep(selectors)) {
      if (!visible(element) || insideHelper(element)) continue;
      const text = norm(element.textContent);
      if (/error|invalid|unable|failed|not found|cannot|try again|not eligible|problem/.test(text)) return text.slice(0, 120);
    }
    return '';
  }

  function changeButton() {
    if (usable(state.changeCache) && !insideHelper(state.changeCache)) return state.changeCache;

    const direct = document.getElementById('change-container-button');
    if (usable(direct) && !insideHelper(direct)) {
      state.changeCache = direct;
      return direct;
    }

    state.changeCache = queryAllDeep('button,[role="button"],a,alchemy-button,mdw-button')
      .find(element => usable(element) && !insideHelper(element) && /change container/.test(norm(element.textContent || element.value))) || null;

    return state.changeCache;
  }

  function yesButton() {
    const dialogs = queryAllDeep('[role="dialog"],dialog,.modal,.Dialog,.dialog,.ReactModal__Content');
    const scopes = dialogs.length ? dialogs : deepRoots();
    for (const scope of scopes) {
      let buttons = [];
      try { buttons = [...scope.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]')]; } catch {}
      const yes = buttons.find(button => usable(button) && /^(yes|ok|confirm|yes, close)$/.test(norm(button.textContent || button.value)));
      if (yes) return yes;
    }
    return null;
  }

  function loadedSource() {
    if (isSourceScreen()) return '';
    const candidates = queryAllDeep('div,section,aside,p,span')
      .filter(element => visible(element) && !insideHelper(element))
      .map(element => String(element.textContent || ''))
      .filter(text => /source\s+container/i.test(text) && /(?:tsX|csX)[A-Za-z0-9_-]+/i.test(text))
      .sort((a, b) => a.length - b.length);

    for (const text of candidates) {
      const match = text.match(/source\s+container[\s:]*((?:tsX|csX)[A-Za-z0-9_-]+)/i) ||
        text.match(/source\s+container[\s\S]{0,80}?((?:tsX|csX)[A-Za-z0-9_-]+)/i);
      if (match) return pretty(match[1]);
    }
    return '';
  }

  function setValue(input, value) {
    if (!input) return;
    if (input.isContentEditable || input.getAttribute('role') === 'textbox') {
      input.textContent = String(value);
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(value) }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    const prototype = Object.getPrototypeOf(input);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value') ||
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') ||
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    const previous = input.value;
    if (descriptor?.set) descriptor.set.call(input, String(value));
    else input.value = String(value);
    input._valueTracker?.setValue?.(previous);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function key(element, type, value) {
    const code = value === 'Enter' ? 'Enter' : `Key${value.toUpperCase()}`;
    const keyCode = value === 'Enter' ? 13 : value.toUpperCase().charCodeAt(0);
    element.dispatchEvent(new KeyboardEvent(type, {
      key: value, code, keyCode, which: keyCode, bubbles: true, cancelable: true, composed: true,
    }));
  }

  function enter(element) {
    key(element, 'keydown', 'Enter');
    key(element, 'keypress', 'Enter');
    key(element, 'keyup', 'Enter');
  }

  function click(element) {
    if (!element) return false;
    const target = element.shadowRoot?.querySelector('button,[role="button"],input[type="button"],input[type="submit"]') || element;
    try {
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
      target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, composed: true }));
      target.click();
      return true;
    } catch {
      return false;
    }
  }

  async function waitUntil(test, timeout = 8000, interval = 120) {
    const started = performance.now();
    let wakeSeen = state.wake;
    while (performance.now() - started < timeout) {
      if (!state.running || state.paused) return null;
      const result = test();
      if (result) return result;

      // MutationObserver wakes us quickly. The timeout is only a safety fallback.
      const delay = wakeSeen !== state.wake ? 0 : interval;
      wakeSeen = state.wake;
      if (delay) await sleep(delay);
      else await Promise.resolve();
    }
    return null;
  }

  async function submit(code) {
    update('waiting for source scan');
    const input = await waitUntil(() => isSourceScreen() && scanInput(), 15000, 150);
    if (!input) return 'source scan timeout';

    try { input.focus(); input.select?.(); } catch {}
    setValue(input, '');
    await sleep(10);
    setValue(input, code);
    await sleep(15);
    enter(input);
    return 'submitted';
  }

  async function closeLoaded(code = '') {
    update('waiting for Change container');
    const change = await waitUntil(() => {
      const error = limitedError();
      if (error) return { error };
      const loaded = loadedSource();
      const button = changeButton();
      if (button && (!code || !loaded || norm(loaded) === norm(code))) return { button };
      return null;
    }, 10000, 120);

    if (!change) return 'change container timeout';
    if (change.error) return change.error;

    update('change container → yes');
    click(change.button);

    const yes = await waitUntil(() => yesButton(), 2500, 50);
    if (!yes) return 'yes button timeout';
    click(yes);

    update('waiting for next source scan');
    const ready = await waitUntil(() => isSourceScreen() && scanInput(), 10000, 120);
    return ready ? 'cleared' : 'next source scan timeout';
  }

  async function pump() {
    if (!state.running || state.paused || state.busy) return;
    if (state.index >= state.queue.length) {
      state.running = false;
      update(state.failed.length ? 'done with errors' : 'done');
      return;
    }

    state.busy = true;
    const code = state.queue[state.index];

    try {
      const stray = loadedSource();
      if (stray) {
        update(`closing loaded ${stray}`);
        const result = await closeLoaded('');
        if (result === 'cleared') {
          if (norm(stray) === norm(code)) state.index += 1;
          update(norm(stray) === norm(code) ? 'cleared' : 'closed stray source');
        } else if (result !== null) {
          state.failed.push({ code: stray, reason: result });
          update(result);
        }
        return;
      }

      update('scanning source');
      const submitted = await submit(code);
      if (submitted !== 'submitted') {
        state.failed.push({ code, reason: submitted });
        state.index += 1;
        update(submitted);
        return;
      }

      const result = await closeLoaded(code);
      if (result === 'cleared') {
        state.index += 1;
        update('cleared');
      } else if (result !== null) {
        state.failed.push({ code, reason: result });
        state.index += 1;
        update(result);
      }
    } finally {
      state.busy = false;
      if (state.running && !state.paused) setTimeout(pump, 40);
    }
  }

  function update(note = '') {
    if (!state.status) return;
    const total = state.queue.length;
    const done = Math.min(state.index, total);
    const current = state.queue[state.index] || '—';
    const mode = state.running ? (state.paused ? 'PAUSED' : 'RUNNING') : 'STOPPED';
    state.status.textContent = `${mode} | ${done}/${total} | Current: ${current}${note ? ` | ${note}` : ''}`;
    state.errors.textContent = state.failed.length
      ? `Errors: ${state.failed.map(item => `${item.code} (${item.reason})`).join(', ')}`
      : 'Errors: none';
  }

  function button(label, background) {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    Object.assign(element.style, {
      border: '0', borderRadius: '7px', padding: '7px 8px', fontWeight: '900',
      fontSize: '12px', cursor: 'pointer', color: '#fff', background,
    });
    return element;
  }

  function mount() {
    if (!document.body || document.getElementById(PANEL_ID)) return;

    const root = document.createElement('div');
    root.id = PANEL_ID;
    Object.assign(root.style, {
      position: 'fixed', right: '14px', bottom: '74px', width: '440px',
      maxWidth: 'calc(100vw - 28px)', zIndex: '2147483647', boxSizing: 'border-box',
      background: '#111827', color: '#fff', border: '2px solid #22c55e', borderRadius: '12px',
      boxShadow: '0 4px 16px rgba(0,0,0,.35)', padding: '10px',
      fontFamily: 'system-ui, Segoe UI, Arial, sans-serif',
    });

    const title = document.createElement('div');
    title.textContent = `Fast Tote Queue TEST v${VERSION}`;
    Object.assign(title.style, { fontWeight: '900', fontSize: '15px', marginBottom: '7px', color: '#86efac' });

    const warning = document.createElement('div');
    warning.textContent = 'Disable the normal Tote Queue toggle while testing.';
    Object.assign(warning.style, { fontSize: '11px', marginBottom: '7px', color: '#fde68a' });

    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Paste tsX/csX list';
    textarea.value = sessionStorage.getItem(STORE_KEY) || '';
    Object.assign(textarea.style, {
      width: '100%', height: '88px', boxSizing: 'border-box', resize: 'vertical',
      borderRadius: '8px', border: '1px solid #4b5563', padding: '8px', fontSize: '13px', fontWeight: '700',
    });
    textarea.addEventListener('input', () => sessionStorage.setItem(STORE_KEY, textarea.value));

    const row = document.createElement('div');
    Object.assign(row.style, { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '6px', marginTop: '7px' });
    const start = button('Start', '#16a34a');
    const pause = button('Pause', '#ca8a04');
    const skip = button('Skip', '#2563eb');
    const stop = button('Stop', '#dc2626');
    row.append(start, pause, skip, stop);

    const status = document.createElement('div');
    Object.assign(status.style, { marginTop: '7px', fontSize: '12px', fontWeight: '900', lineHeight: '1.35' });
    const errors = document.createElement('div');
    Object.assign(errors.style, { marginTop: '4px', fontSize: '11px', fontWeight: '800', color: '#fecaca', maxHeight: '55px', overflow: 'auto' });

    root.append(title, warning, textarea, row, status, errors);
    document.body.appendChild(root);

    Object.assign(state, { root, textarea, status, errors });

    start.addEventListener('click', () => {
      state.queue = parseQueue(textarea.value);
      state.index = 0;
      state.failed = [];
      state.running = state.queue.length > 0;
      state.paused = false;
      state.busy = false;
      pause.textContent = 'Pause';
      update(state.running ? 'starting' : 'no valid containers');
      if (state.running) setTimeout(pump, 50);
    });

    pause.addEventListener('click', () => {
      state.paused = !state.paused;
      pause.textContent = state.paused ? 'Resume' : 'Pause';
      update();
      if (!state.paused) setTimeout(pump, 40);
    });

    skip.addEventListener('click', () => {
      const code = state.queue[state.index];
      if (!code) return;
      state.failed.push({ code, reason: 'manual skip' });
      state.index += 1;
      state.busy = false;
      update('manual skip');
      setTimeout(pump, 40);
    });

    stop.addEventListener('click', () => {
      state.running = false;
      state.paused = false;
      state.busy = false;
      pause.textContent = 'Pause';
      update('stopped');
    });

    update();
  }

  const observer = new MutationObserver(() => {
    state.wake += 1;
    if (state.inputCache && !state.inputCache.isConnected) state.inputCache = null;
    if (state.changeCache && !state.changeCache.isConnected) state.changeCache = null;
    if (!document.getElementById(PANEL_ID)) mount();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'aria-disabled', 'hidden', 'class', 'style'] });

  if (document.body) mount();
  else window.addEventListener('DOMContentLoaded', mount, { once: true });
})();
