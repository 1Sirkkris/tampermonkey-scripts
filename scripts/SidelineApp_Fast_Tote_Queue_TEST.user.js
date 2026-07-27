// ==UserScript==
// @name         v0.2.1 SidelineApp Tote Queue TEST
// @namespace    https://github.com/1Sirkkris
// @version      0.2.1
// @description  Thin queue wrapper around the existing working Tote Scrubber.
// @match        https://aft-poirot-website-nrt.nrt.proxy.amazon.com/*
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SidelineApp_Fast_Tote_Queue_TEST.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SidelineApp_Fast_Tote_Queue_TEST.user.js
// @run-at       document-end
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  if (window.__sidelineQueueTest_v021) return;
  window.__sidelineQueueTest_v021 = true;

  const VERSION = '0.2.1';
  const PANEL_ID = 'sideline-queue-test-v021';
  const STORE_KEY = 'sideline_queue_test_text';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = v => String(v || '').replace(/\s+/g, ' ').trim().toLowerCase();

  const S = {
    running:false, paused:false, busy:false,
    queue:[], index:0, failed:[], textarea:null, status:null, errors:null,
  };

  function parse(text) {
    const matches = String(text || '').match(/\b(?:tsX|csX)[A-Za-z0-9_-]+\b/gi) || [];
    const seen = new Set();
    return matches.map(raw => {
      const m = raw.match(/^([ct]s)x(.+)$/i);
      return m ? `${m[1].toLowerCase()}X${m[2]}` : raw;
    }).filter(code => {
      const key = code.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function visible(el) {
    if (!(el instanceof Element) || !el.isConnected || el.hidden) return false;
    const st = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return st.display !== 'none' && st.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  }

  function scanInput() {
    const direct = document.getElementById('scan-text-input');
    if (direct && visible(direct) && !direct.disabled && !direct.readOnly) return direct;

    return [...document.querySelectorAll('input,textarea,[role="textbox"]')].find(el => {
      if (!visible(el) || el.closest(`#${PANEL_ID}`) || el.disabled || el.readOnly) return false;
      const type = norm(el.type);
      return !type || ['text','search','tel'].includes(type) || el.tagName === 'TEXTAREA';
    }) || null;
  }

  function sourceScreen() {
    if (!scanInput()) return false;
    const headings = [...document.querySelectorAll('h1,h2,h3,[role="heading"]')]
      .filter(visible).map(el => norm(el.textContent)).join(' ');
    return headings.includes('scan source container') || norm(document.body?.innerText).includes('scan source container');
  }

  function setValue(input, value) {
    const proto = Object.getPrototypeOf(input);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value') ||
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') ||
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    const old = input.value;
    if (desc?.set) desc.set.call(input, String(value)); else input.value = String(value);
    input._valueTracker?.setValue?.(old);
    input.dispatchEvent(new Event('input', {bubbles:true}));
    input.dispatchEvent(new Event('change', {bubbles:true}));
  }

  function enter(input) {
    const o = {key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true,composed:true};
    input.dispatchEvent(new KeyboardEvent('keydown', o));
    input.dispatchEvent(new KeyboardEvent('keypress', o));
    input.dispatchEvent(new KeyboardEvent('keyup', o));
  }

  function ensureScrubberOn() {
    const btn = document.getElementById('kadabra-toggle-singleton');
    if (!btn) return false;
    const text = norm(btn.textContent);
    if (text.includes('start scrubbing')) btn.click();
    return true;
  }

  async function waitFor(test, timeout=15000, interval=80) {
    const start = performance.now();
    while (performance.now() - start < timeout) {
      if (!S.running || S.paused) return null;
      const value = test();
      if (value) return value;
      await sleep(interval);
    }
    return null;
  }

  async function processOne(code) {
    update('waiting for source screen');
    const input = await waitFor(() => sourceScreen() && scanInput());
    if (!input) return 'source screen timeout';

    if (!ensureScrubberOn()) return 'Tote Scrubber not found';

    try { input.focus(); input.select?.(); } catch {}
    setValue(input, '');
    await sleep(15);
    setValue(input, code);
    await sleep(25);
    enter(input);

    update('opening container');
    const opened = await waitFor(() => !sourceScreen(), 10000);
    if (!opened) return 'container did not open';

    update('scrubber emptying container');
    const returned = await waitFor(() => sourceScreen() && scanInput(), 15000);
    return returned ? 'cleared' : 'scrubber did not return';
  }

  async function pump() {
    if (!S.running || S.paused || S.busy) return;
    if (S.index >= S.queue.length) {
      S.running = false;
      update(S.failed.length ? 'done with errors' : 'done');
      return;
    }

    S.busy = true;
    const code = S.queue[S.index];
    try {
      const result = await processOne(code);
      if (result === 'cleared') {
        S.index += 1;
        update('cleared');
      } else if (result) {
        S.failed.push({code, reason:result});
        S.index += 1;
        update(result);
      }
    } finally {
      S.busy = false;
      if (S.running && !S.paused) setTimeout(pump, 60);
    }
  }

  function update(note='') {
    if (!S.status) return;
    const total = S.queue.length;
    const current = S.queue[S.index] || '—';
    const mode = S.running ? (S.paused ? 'PAUSED' : 'RUNNING') : 'STOPPED';
    S.status.textContent = `${mode} | ${Math.min(S.index,total)}/${total} | Current: ${current}${note ? ` | ${note}` : ''}`;
    S.errors.textContent = S.failed.length
      ? `Errors: ${S.failed.map(x => `${x.code} (${x.reason})`).join(', ')}`
      : 'Errors: none';
  }

  function btn(text, bg) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = text;
    Object.assign(b.style, {border:'0',borderRadius:'7px',padding:'7px 8px',fontWeight:'900',fontSize:'12px',cursor:'pointer',color:'#fff',background:bg});
    return b;
  }

  function mount() {
    if (!document.body || document.getElementById(PANEL_ID)) return;
    const root = document.createElement('div');
    root.id = PANEL_ID;
    Object.assign(root.style, {position:'fixed',right:'14px',bottom:'74px',width:'440px',maxWidth:'calc(100vw - 28px)',zIndex:'2147483647',boxSizing:'border-box',background:'#111827',color:'#fff',border:'2px solid #22c55e',borderRadius:'12px',boxShadow:'0 4px 16px rgba(0,0,0,.35)',padding:'10px',fontFamily:'system-ui, Segoe UI, Arial, sans-serif'});

    const title = document.createElement('div');
    title.textContent = `Tote Queue TEST v${VERSION}`;
    Object.assign(title.style, {fontWeight:'900',fontSize:'15px',marginBottom:'7px',color:'#86efac'});

    const note = document.createElement('div');
    note.textContent = 'Text queue → existing Tote Scrubber.';
    Object.assign(note.style, {fontSize:'11px',marginBottom:'7px',color:'#fde68a'});

    const ta = document.createElement('textarea');
    ta.placeholder = 'Paste tsX/csX list';
    ta.value = sessionStorage.getItem(STORE_KEY) || '';
    Object.assign(ta.style, {width:'100%',height:'88px',boxSizing:'border-box',resize:'vertical',borderRadius:'8px',border:'1px solid #4b5563',padding:'8px',fontSize:'13px',fontWeight:'700'});
    ta.addEventListener('input', () => sessionStorage.setItem(STORE_KEY, ta.value));

    const row = document.createElement('div');
    Object.assign(row.style, {display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'6px',marginTop:'7px'});
    const start = btn('Start','#16a34a'), pause = btn('Pause','#ca8a04'), skip = btn('Skip','#2563eb'), stop = btn('Stop','#dc2626');
    row.append(start,pause,skip,stop);

    const status = document.createElement('div');
    Object.assign(status.style, {marginTop:'7px',fontSize:'12px',fontWeight:'900',lineHeight:'1.35'});
    const errors = document.createElement('div');
    Object.assign(errors.style, {marginTop:'4px',fontSize:'11px',fontWeight:'800',color:'#fecaca',maxHeight:'55px',overflow:'auto'});

    root.append(title,note,ta,row,status,errors);
    document.body.appendChild(root);
    Object.assign(S, {textarea:ta,status,errors});

    start.addEventListener('click', () => {
      S.queue = parse(ta.value); S.index = 0; S.failed = [];
      S.running = S.queue.length > 0; S.paused = false; S.busy = false;
      pause.textContent = 'Pause';
      update(S.running ? 'starting' : 'no valid containers');
      if (S.running) setTimeout(pump,50);
    });
    pause.addEventListener('click', () => {
      S.paused = !S.paused; pause.textContent = S.paused ? 'Resume' : 'Pause'; update();
      if (!S.paused) setTimeout(pump,50);
    });
    skip.addEventListener('click', () => {
      const code = S.queue[S.index]; if (!code) return;
      S.failed.push({code,reason:'manual skip'}); S.index += 1; S.busy = false; update('manual skip'); setTimeout(pump,50);
    });
    stop.addEventListener('click', () => {
      S.running = false; S.paused = false; S.busy = false; pause.textContent = 'Pause'; update('stopped');
    });
    update();
  }

  new MutationObserver(() => { if (!document.getElementById(PANEL_ID)) mount(); })
    .observe(document.documentElement, {childList:true,subtree:true});
  if (document.body) mount(); else window.addEventListener('DOMContentLoaded', mount, {once:true});
})();