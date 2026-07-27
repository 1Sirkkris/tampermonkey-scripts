// ==UserScript==
// @name         v0.3.0 SidelineApp Standalone Tote Queue TEST
// @namespace    https://github.com/1Sirkkris
// @version      0.3.0
// @description  Standalone Tote Queue with built-in Change container -> Yes scrubber logic.
// @match        https://aft-poirot-website-nrt.nrt.proxy.amazon.com/*
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SidelineApp_Fast_Tote_Queue_TEST.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SidelineApp_Fast_Tote_Queue_TEST.user.js
// @run-at       document-end
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  if (window.__standaloneToteQueue_v030) return;
  window.__standaloneToteQueue_v030 = true;

  const VERSION = '0.3.0';
  const PANEL_ID = 'standalone-tote-queue-test';
  const STORE_KEY = 'standalone_tote_queue_text';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const norm = value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

  const state = {
    running: false,
    paused: false,
    busy: false,
    queue: [],
    index: 0,
    failed: [],
    root: null,
    textarea: null,
    status: null,
    errors: null,
  };

  function pretty(raw) {
    const value = String(raw || '').trim();
    const match = value.match(/^([ct]s)x(.+)$/i);
    return match ? `${match[1].toLowerCase()}X${match[2]}` : value;
  }

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

  function visible(el) {
    if (!(el instanceof Element) || !el.isConnected) return false;
    if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function enabled(el) {
    return visible(el) && !el.disabled && !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true';
  }

  function scanInput() {
    const direct = document.getElementById('scan-text-input');
    if (enabled(direct)) return direct;

    return [...document.querySelectorAll('input,textarea,[role="textbox"],[contenteditable="true"]')]
      .find(el => {
        if (!enabled(el) || el.closest(`#${PANEL_ID}`)) return false;
        const type = norm(el.type);
        return !type || ['text', 'search', 'tel'].includes(type) || el.tagName === 'TEXTAREA' || el.isContentEditable;
      }) || null;
  }

  function sourceScreenReady() {
    const input = scanInput();
    if (!input) return false;
    return /scan\s+source\s+container/i.test(document.body?.innerText || '');
  }

  function changeButton() {
    const direct = document.getElementById('change-container-button');
    if (enabled(direct)) return direct;

    return [...document.querySelectorAll('button,[role="button"],a,alchemy-button,mdw-button')]
      .find(el => enabled(el) && !el.closest(`#${PANEL_ID}`) && /change container/i.test(el.innerText || el.textContent || el.value || '')) || null;
  }

  function yesButton() {
    const scopes = [
      document.getElementById('modal-root'),
      ...document.querySelectorAll('[role="dialog"],dialog,.modal,.Dialog,.dialog,.ReactModal__Content')
    ].filter(Boolean);

    const search = root => [...root.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]')]
      .find(el => enabled(el) && /^(yes|ok|confirm|yes, close)$/i.test((el.innerText || el.textContent || el.value || '').trim()));

    for (const scope of scopes) {
      const found = search(scope);
      if (found) return found;
    }
    return search(document);
  }

  function setValue(input, value) {
    const proto = Object.getPrototypeOf(input);
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value') ||
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') ||
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    const previous = input.value;
    if (descriptor?.set) descriptor.set.call(input, String(value));
    else input.value = String(value);
    input._valueTracker?.setValue?.(previous);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function enter(el) {
    for (const type of ['keydown', 'keypress', 'keyup']) {
      el.dispatchEvent(new KeyboardEvent(type, {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
        bubbles: true, cancelable: true, composed: true,
      }));
    }
  }

  function click(el) {
    if (!el) return false;
    const target = el.shadowRoot?.querySelector('button,[role="button"],input[type="button"],input[type="submit"]') || el;
    try {
      target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, composed: true }));
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
      target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, composed: true }));
      target.click();
      return true;
    } catch {
      return false;
    }
  }

  async function waitFor(test, timeoutMs, intervalMs = 60) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (!state.running || state.paused) return null;
      const result = test();
      if (result) return result;
      await sleep(intervalMs);
    }
    return null;
  }

  async function submitContainer(code) {
    update('waiting for source scan');
    const input = await waitFor(() => sourceScreenReady() && scanInput(), 15000, 80);
    if (!input) return 'source scan timeout';

    try { input.focus(); input.select?.(); } catch {}
    setValue(input, '');
    await sleep(15);
    setValue(input, code);
    await sleep(20);

    const confirm = document.getElementById('confirm-button');
    if (enabled(confirm)) click(confirm);
    else enter(input);

    return 'submitted';
  }

  async function scrubCurrentContainer() {
    update('waiting for Change container');
    const change = await waitFor(() => changeButton(), 12000, 45);
    if (!change) return 'change container timeout';

    update('Change container → Yes');
    click(change);

    const yes = await waitFor(() => yesButton(), 3000, 30);
    if (!yes) return 'yes button timeout';
    click(yes);

    update('waiting for next source scan');
    const ready = await waitFor(() => sourceScreenReady(), 12000, 60);
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
      // If a container is already open, scrub it first before scanning the next queued code.
      if (!sourceScreenReady() && changeButton()) {
        const strayResult = await scrubCurrentContainer();
        if (strayResult !== 'cleared') {
          state.failed.push({ code, reason: strayResult });
          state.index += 1;
        }
        return;
      }

      update('scanning source');
      const submitted = await submitContainer(code);
      if (submitted !== 'submitted') {
        state.failed.push({ code, reason: submitted });
        state.index += 1;
        return;
      }

      const result = await scrubCurrentContainer();
      if (result === 'cleared') {
        state.index += 1;
        update('cleared');
      } else {
        state.failed.push({ code, reason: result });
        state.index += 1;
        update(result);
      }
    } finally {
      state.busy = false;
      if (state.running && !state.paused) setTimeout(pump, 50);
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

  function makeButton(label, background) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    Object.assign(button.style, {
      border: '0', borderRadius: '7px', padding: '7px 8px', fontWeight: '900',
      fontSize: '12px', cursor: 'pointer', color: '#fff', background,
    });
    return button;
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
    title.textContent = `Standalone Tote Queue TEST v${VERSION}`;
    Object.assign(title.style, { fontWeight: '900', fontSize: '15px', marginBottom: '7px', color: '#86efac' });

    const note = document.createElement('div');
    note.textContent = 'Main SidelineApp Helper can be disabled for this test.';
    Object.assign(note.style, { fontSize: '11px', marginBottom: '7px', color: '#fde68a' });

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
    const start = makeButton('Start', '#16a34a');
    const pause = makeButton('Pause', '#ca8a04');
    const skip = makeButton('Skip', '#2563eb');
    const stop = makeButton('Stop', '#dc2626');
    row.append(start, pause, skip, stop);

    const status = document.createElement('div');
    Object.assign(status.style, { marginTop: '7px', fontSize: '12px', fontWeight: '900', lineHeight: '1.35' });
    const errors = document.createElement('div');
    Object.assign(errors.style, { marginTop: '4px', fontSize: '11px', fontWeight: '800', color: '#fecaca', maxHeight: '55px', overflow: 'auto' });

    root.append(title, note, textarea, row, status, errors);
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
      if (!state.paused) setTimeout(pump, 50);
    });

    skip.addEventListener('click', () => {
      const code = state.queue[state.index];
      if (!code) return;
      state.failed.push({ code, reason: 'manual skip' });
      state.index += 1;
      state.busy = false;
      update('manual skip');
      setTimeout(pump, 50);
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

  new MutationObserver(() => {
    if (!document.getElementById(PANEL_ID)) mount();
  }).observe(document.documentElement, { childList: true, subtree: true });

  if (document.body) mount();
  else window.addEventListener('DOMContentLoaded', mount, { once: true });
})();