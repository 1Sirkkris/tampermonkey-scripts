// ==UserScript==
// @name         v0.2.0 SidelineApp Tote Queue TEST
// @namespace    https://github.com/1Sirkkris
// @version      0.2.0
// @description  Thin queue wrapper around the existing working Tote Scrubber.
// @match        https://aft-poirot-website-nrt.nrt.proxy.amazon.com/*
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SidelineApp_Fast_Tote_Queue_TEST.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SidelineApp_Fast_Tote_Queue_TEST.user.js
// @run-at       document-end
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  if (window.__sidelineQueueTest_v020) return;
  window.__sidelineQueueTest_v020 = true;

  const VERSION = '0.2.0';
  const PANEL_ID = 'sideline-queue-test-v020';
  const STORE_KEY = 'sideline_queue_test_text';
  const SCRUBBER_KEY = 'kadabraScriptEnabled';

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const norm = value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

  const state = {
    running: false,
    paused: false,
    busy: false,
    queue: [],
    index: 0,
    failed: [],
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
    const result = [];

    for (const raw of found) {
      const code = pretty(raw);
      const key = code.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(code);
    }
    return result;
  }

  function visible(element) {
    if (!(element instanceof Element) || !element.isConnected) return false;
    if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function insideOwnPanel(element) {
    return !!element?.closest?.(`#${PANEL_ID}`);
  }

  function scanInput() {
    const direct = document.getElementById('scan-text-input');
    if (direct && visible(direct) && !direct.disabled && !direct.readOnly) return direct;

    return [...document.querySelectorAll('input,textarea,[role="textbox"]')].find(element => {
      if (!visible(element) || insideOwnPanel(element)) return false;
      if (element.disabled || element.readOnly || element.getAttribute('aria-disabled') === 'true') return false;
      const type = norm(element.type);
      return !type || ['text', 'search', 'tel'].includes(type) || element.tagName === 'TEXTAREA';
    }) || null;
  }

  function sourceScreen() {
    const input = scanInput();
    if (!input) return false;

    const heading = [...document.querySelectorAll('h1,h2,h3,[role="heading"]')]
      .filter(element => visible(element))
      .map(element => norm(element.textContent))
      .join(' ');

    if (heading.includes('scan source container')) return true;

    const pageText = norm(document.body?.innerText || '');
    return pageText.includes('scan source container');
  }

  function setReactValue(input, value) {
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

  function pressEnter(input) {
    const options = {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
      bubbles: true, cancelable: true, composed: true,
    };
    input.dispatchEvent(new KeyboardEvent('keydown', options));
    input.dispatchEvent(new KeyboardEvent('keypress', options));
    input.dispatchEvent(new KeyboardEvent('keyup', options));
  }

  function enableScrubber() {
    sessionStorage.setItem(SCRUBBER_KEY, '1');
    const button = document.getElementById('kadabra-toggle-singleton');
    if (button && /start scrubbing/i.test(button.textContent || '')) button.click();
  }

  function disableScrubber() {
    sessionStorage.setItem(SCRUBBER_KEY, '0');
    const button = document.getElementById('kadabra-toggle-singleton');
    if (button && /stop scrubbing/i.test(button.textContent || '')) button.click();
  }

  async function waitFor(test, timeoutMs = 12000, pollMs = 80) {
    const start = performance.now();
    while (performance.now() - start < timeoutMs) {
      if (!state.running || state.paused) return null;
      const result = test();
      if (result) return result;
      await sleep(pollMs);
    }
    return null;
  }

  async function submitContainer(code) {
    update('waiting for source screen');
    const input = await waitFor(() => sourceScreen() && scanInput(), 15000, 80);
    if (!input) return 'source screen timeout';

    try {
      input.focus();
      input.select?.();
    } catch {}

    setReactValue(input, '');
    await sleep(15);
    setReactValue(input, code);
    await sleep(25);
    pressEnter(input);
    return 'submitted';
  }

  async function waitForScrubCycle() {
    update('scrubber emptying container');

    // First wait for Sideline to leave the source scan screen.
    const opened = await waitFor(() => !sourceScreen(), 10000, 80);
    if (!opened) return 'container did not open';

    // Existing Tote Scrubber handles Change container -> Yes.
    // Queue only waits for the source scan screen to return.
    const returned = await waitFor(() => sourceScreen() && scanInput(), 15000, 80);
    return returned ? 'cleared' : 'scrubber did not return to source';
  }

  async function pump() {
    if (!state.running || state.paused || state.busy) return;

    if (state.index >= state.queue.length) {
      state.running = false;
      state.busy = false;
      disableScrubber();
      update(state.failed.length ? 'done with errors' : 'done');
      return;
    }

    state.busy = true;
    const code = state.queue[state.index];

    try {
      enableScrubber();

      const submitted = await submitContainer(code);
      if (submitted !== 'submitted') {
        state.failed.push({ code, reason: submitted });
        state.index += 1;
        update(submitted);
        return;
      }

      const result = await waitForScrubCycle();
      if (result === 'cleared') {
        state.index += 1;
        update('cleared');
      } else if (result) {
        state.failed.push({ code, reason: result });
        state.index += 1;
        update(result);
      }
    } finally {
      state.busy = false;
      if (state.running && !state.paused) setTimeout(pump, 60);
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
      border: '0', borderRadius: '7px', padding: '7px 8px',
      fontWeight: '900', fontSize: '12px', cursor: 'pointer',
      color: '#fff', background,
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
      background: '#111827', color: '#fff', border: '2px solid #22c55e',
      borderRadius: '12px', boxShadow: '0 4px 16px rgba(0,0,0,.35)',
      padding: '10px', fontFamily: 'system-ui, Segoe UI, Arial, sans-serif',
    });

    const title = document.createElement('div');
    title.textContent = `Tote Queue TEST v${VERSION}`;
    Object.assign(title.style, {
      fontWeight: '900', fontSize: '15px', marginBottom: '7px', color: '#86efac',
    });

    const note = document.createElement('div');
    note.textContent = 'Queue controls the existing Tote Scrubber.';
    Object.assign(note.style, {
      fontSize: '11px', marginBottom: '7px', color: '#fde68a',
    });

    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Paste tsX/csX list';
    textarea.value = sessionStorage.getItem(STORE_KEY) || '';
    Object.assign(textarea.style, {
      width: '100%', height: '88px', boxSizing: 'border-box', resize: 'vertical',
      borderRadius: '8px', border: '1px solid #4b5563', padding: '8px',
      fontSize: '13px', fontWeight: '700',
    });
    textarea.addEventListener('input', () => sessionStorage.setItem(STORE_KEY, textarea.value));

    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '6px', marginTop: '7px',
    });

    const start = makeButton('Start', '#16a34a');
    const pause = makeButton('Pause', '#ca8a04');
    const skip = makeButton('Skip', '#2563eb');
    const stop = makeButton('Stop', '#dc2626');
    row.append(start, pause, skip, stop);

    const status = document.createElement('div');
    Object.assign(status.style, {
      marginTop: '7px', fontSize: '12px', fontWeight: '900', lineHeight: '1.35',
    });

    const errors = document.createElement('div');
    Object.assign(errors.style, {
      marginTop: '4px', fontSize: '11px', fontWeight: '800', color: '#fecaca',
      maxHeight: '55px', overflow: 'auto',
    });

    root.append(title, note, textarea, row, status, errors);
    document.body.appendChild(root);
    Object.assign(state, { textarea, status, errors });

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
      disableScrubber();
      pause.textContent = 'Pause';
      update('stopped');
    });

    update();
  }

  const observer = new MutationObserver(() => {
    if (!document.getElementById(PANEL_ID)) mount();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.body) mount();
  else window.addEventListener('DOMContentLoaded', mount, { once: true });
})();