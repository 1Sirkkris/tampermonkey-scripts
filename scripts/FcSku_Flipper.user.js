// ==UserScript==
// @name        v1.0.23 FcSku Flipper
// @namespace   Violentmonkey Scripts
// @match       *://aft-qt-jp.aka.nrt.corp.amazon.com/app/fcskuflip*
// @match       *://aft-qt-*.aka.*.corp.amazon.com/app/fcskuflip*
// @match       *://aft-qt-*.corp.amazon.com/app/fcskuflip*
// @grant       none
// @version     1.0.23
// @run-at      document-start
// @description Batch FCSku flips: fixed old/new FCSKU + location/container queue. Robust gated steps.
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/FcSku_Flipper.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/FcSku_Flipper.user.js
// ==/UserScript==

(function () {
  'use strict';

  if (window.__FCSKU_MULTI_QUICK_FLIP_V123__) return;
  window.__FCSKU_MULTI_QUICK_FLIP_V123__ = true;

  /*********** CONSTANTS ***********/
  const SCRIPT_VERSION = 'v1.0.23';
  const PRIMARY_COLOR = '#002e36';
  const HOVER_COLOR = '#00434f';
  const TEXT_COLOR = '#ffffff';

  const OLD_KEY = 'fcskuflip_v123_old_fixed';
  const NEW_KEY = 'fcskuflip_v123_new_fixed';
  const TEXT_KEY = 'fcskuflip_v123_locations_text';
  const QUEUE_KEY = 'fcskuflip_v123_queue';
  const PHASE_KEY = 'fcskuflip_v123_phase';
  const ACTIVE_KEY = 'fcskuflip_v123_active';
  const TOTAL_KEY = 'fcskuflip_v123_total';
  const DONE_KEY = 'fcskuflip_v123_done';
  const OPEN_KEY = 'fcskuflip_v123_panel_open';

  const LS_DELAY_KEY = 'fcskuflip_v123_step_delay_ms';
  const MODE_KEY = 'fcskuflip_v123_mode';

  const MODES = {
    safe: { label: 'Safe', delay: 700 },
    normal: { label: 'Normal', delay: 500 },
    aggressive: { label: 'Aggressive', delay: 350 }
  };
  const MODE_ORDER = ['safe', 'normal', 'aggressive'];

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => String(s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const lower = s => norm(s).toLowerCase();

  let lastDomChangeAt = Date.now();
  let lastTextSig = '';
  const isBusy = () => !!document.querySelector('.a-spinner,.loadingSpinner,.busy,[aria-busy="true"]');

  function pageSig() {
    return lower(headingText() + '|' + textAll().slice(0, 900));
  }

  async function waitPageReady(timeout = 3000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const sig = pageSig();
      const stable = sig && sig === lastTextSig && (Date.now() - lastDomChangeAt) > 120;
      if (!isBusy() && stable) return true;
      lastTextSig = sig;
      await sleep(40);
    }
    return true;
  }

  let running = false;
  let booted = false;
  let driveTimer = null;
  let lastActionAt = 0;

  function getMode() {
    const m = localStorage.getItem(MODE_KEY);
    return MODES[m] ? m : 'aggressive';
  }

  function setMode(m) {
    localStorage.setItem(MODE_KEY, MODES[m] ? m : 'normal');
    localStorage.setItem(LS_DELAY_KEY, String(MODES[getMode()].delay));
    updateModeButtons?.();
    updateHud?.();
  }

  function getDelay() {
    const v = Number(localStorage.getItem(LS_DELAY_KEY));
    if (Number.isFinite(v) && v >= 250) return v;
    return MODES[getMode()].delay;
  }

  function setDelay(ms) {
    const v = Math.max(250, Math.min(1500, Math.round(ms)));
    localStorage.setItem(LS_DELAY_KEY, String(v));
    updateHud?.();
  }

  async function settle(extra = 0) {
    const base = Math.min(getDelay() + extra, 650);
    const elapsed = Date.now() - lastActionAt;
    const wait = Math.max(80, base - elapsed);
    await sleep(wait);
    await waitPageReady(2500);
  }

  function textAll() {
    return document.body ? document.body.innerText || '' : '';
  }

  function headingText() {
    const hs = Array.from(document.querySelectorAll('h1,h2,h3,[role="heading"]'));
    return norm(hs.map(h => h.textContent || '').find(Boolean) || '');
  }

  function pageKind() {
    const h = lower(headingText());
    const t = lower(textAll());

    // Success can remain visible beside the next Input Item page.
    // Detect it before old/new input checks so Start over fires immediately.
    if (t.includes('success') && t.includes('start over')) return 'successMenu';
    if (/^success$/i.test(headingText()) || (t.includes('success') && t.includes('quantity'))) return 'success';

    if (h.includes('scan container') || t.includes('scan container')) return 'container';
    if (h.includes('enter new fnsku') || h.includes('enter new fcsku') || t.includes('enter new fnsku') || t.includes('enter new fcsku')) return 'newInput';
    if (h.includes('input item') || t.includes('fnskus, fcskus, and lpns are supported')) return 'oldInput';
    if (h.includes('confirm flip') || t.includes('confirm flip')) return 'confirm';

    return 'unknown';
  }

  function hasExactSuccess() {
    const nodes = Array.from(document.querySelectorAll('h1,h2,h3,[role="heading"],div,span'));
    return nodes.some(n => /^success$/i.test(norm(n.textContent || '')));
  }

  function triggerStartOverOnce() {
    // Prefer real Start over control if visible; otherwise use the app hotkey once.
    const startNode = Array.from(document.querySelectorAll('button,a,span'))
      .find(n => /^start over/i.test(norm(n.textContent || '')) && !n.closest('#fcskuflip-multiflip-v109'));

    if (startNode) {
      const real = startNode.querySelector?.('input.a-button-input, input[type="submit"], button') || startNode;
      real.click();
      lastActionAt = Date.now();
      return true;
    }

    pressKey('r');
    return true;
  }

  async function waitForPostConfirmThenStartOver(timeout = 9000) {
    // After Confirm, app often returns to Input Item while Success card appears at right.
    // Treat that second Input Item load as the completion signal and fire Start over once.
    const start = Date.now();

    return await new Promise(resolve => {
      let done = false;

      const finish = (ok) => {
        if (done) return;
        done = true;
        try { obs.disconnect(); } catch {}
        try { clearTimeout(to); } catch {}
        resolve(ok);
      };

      const check = () => {
        const k = pageKind();
        const h = lower(headingText());
        const t = lower(textAll());

        if (hasExactSuccess() || k === 'success' || k === 'successMenu') {
          triggerStartOverOnce();
          finish(true);
          return;
        }

        if (k === 'oldInput' || h.includes('input item')) {
          // This is the post-confirm Input Item screen.
          triggerStartOverOnce();
          finish(true);
          return;
        }

        if (Date.now() - start > timeout) finish(false);
      };

      const obs = new MutationObserver(check);
      obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

      const to = setTimeout(() => finish(false), timeout);

      (async () => {
        while (!done) {
          check();
          await sleep(35);
        }
      })();
    });
  }

  async function waitForSuccessThenStartOver(timeout = 9000) {
    // Pending Quick Flip works because it waits for the actual success state,
    // then fires the next action immediately. This mirrors that pattern but with
    // MutationObserver instead of a fixed delay.
    if (hasExactSuccess()) {
      triggerStartOverOnce();
      return true;
    }

    return await new Promise(resolve => {
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        try { obs.disconnect(); } catch {}
        try { clearTimeout(to); } catch {}
        resolve(ok);
      };

      const obs = new MutationObserver(() => {
        if (hasExactSuccess()) {
          triggerStartOverOnce();
          finish(true);
        }
      });

      const to = setTimeout(() => finish(false), timeout);
      obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

      // Fast fallback poll in case text changes without child mutation.
      (async () => {
        while (!done) {
          if (hasExactSuccess()) {
            triggerStartOverOnce();
            finish(true);
            return;
          }
          await sleep(40);
        }
      })();
    });
  }

  function visibleTextInput() {
    const inputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type]), textarea'))
      .filter(el => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 20 && rect.height > 10 && style.display !== 'none' && style.visibility !== 'hidden' && !el.disabled && !el.readOnly;
      });

    // Never use our own panel fields for automation.
    return inputs.find(el => !el.closest('#fcskuflip-multiflip-v109')) || null;
  }

  function buttonsByText(...parts) {
    const wanted = parts.map(p => lower(p));
    return Array.from(document.querySelectorAll('button,input[type="button"],input[type="submit"],a,span.a-button,span.a-declarative,div.a-button'))
      .filter(el => {
        if (el.closest('#fcskuflip-multiflip-v109')) return false;
        const txt = lower(el.textContent || el.value || '');
        if (!txt) return false;
        return wanted.some(w => txt.includes(w));
      });
  }

  function clickButton(...parts) {
    const nodes = buttonsByText(...parts);
    for (const n of nodes) {
      const real = n.querySelector?.('input.a-button-input, input[type="submit"], button') || n;
      if (real.disabled || real.getAttribute('aria-disabled') === 'true') continue;
      real.scrollIntoView?.({ block: 'center', inline: 'center' });
      real.click();
      lastActionAt = Date.now();
      return true;
    }
    return false;
  }

  function pressKey(key) {
    const code = key === 'Enter' ? 'Enter' : 'Key' + key.toUpperCase();
    const ev = new KeyboardEvent('keydown', {
      key,
      code,
      keyCode: key === 'Enter' ? 13 : key.toUpperCase().charCodeAt(0),
      which: key === 'Enter' ? 13 : key.toUpperCase().charCodeAt(0),
      bubbles: true,
      cancelable: true
    });
    document.dispatchEvent(ev);
    lastActionAt = Date.now();
  }

  function setNativeValue(el, value) {
    el.focus();
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function waitFor(fn, timeout = 12000, poll = 120) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const val = fn();
      if (val) return val;
      await sleep(poll);
    }
    return null;
  }

  async function waitForKind(kind, timeout = 14000) {
    return await waitFor(() => pageKind() === kind ? true : null, timeout, 120);
  }

  async function waitForInputOn(kind, timeout = 14000) {
    return await waitFor(() => {
      const k = pageKind();
      if (kind && k !== kind) return null;
      return visibleTextInput();
    }, timeout, 150);
  }

  function readQueue() {
    try {
      const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      return Array.isArray(q) ? q : [];
    } catch {
      return [];
    }
  }

  function saveQueue(q) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
    updateHud?.();
  }

  function clearRun() {
    localStorage.removeItem(QUEUE_KEY);
    localStorage.removeItem(PHASE_KEY);
    localStorage.removeItem(ACTIVE_KEY);
    localStorage.removeItem(TOTAL_KEY);
    localStorage.removeItem(DONE_KEY);
    updateHud?.('Idle');
  }

  function stopClearQueue() {
    clearRun();
    status('Stopped / queue cleared');
  }

  function status(msg) {
    updateHud?.(msg);
  }

  function preservePanelInputs() {
    const oldInput = document.querySelector('#fcsku-old-fixed');
    const newInput = document.querySelector('#fcsku-new-fixed');
    const locArea = document.querySelector('#fcsku-locations-text');

    if (oldInput) localStorage.setItem(OLD_KEY, oldInput.value.trim());
    if (newInput) localStorage.setItem(NEW_KEY, newInput.value.trim());
    if (locArea) localStorage.setItem(TEXT_KEY, locArea.value);
  }

  /*********** UI ***********/
  let updateHud = null;
  let updateModeButtons = null;

  function insertUI() {
    if (document.getElementById('fcskuflip-multiflip-v109')) return;
    const host = document.body || document.documentElement;
    if (!host) return;

    const panel = document.createElement('div');
    panel.id = 'fcskuflip-multiflip-v109';
    panel.style.cssText = `
      position: fixed;
      top: 86px;
      left: 10px;
      z-index: 2147483647;
      font-family: Arial, sans-serif;
      width: 290px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.30);
      border-radius: 6px;
      overflow: hidden;
      background: #f9f9f9;
    `;

    const header = document.createElement('div');
    Object.assign(header.style, {
      background: PRIMARY_COLOR,
      color: TEXT_COLOR,
      padding: '7px 10px',
      fontWeight: 'bold',
      fontSize: '13px',
      cursor: 'pointer'
    });

    const body = document.createElement('div');
    body.style.cssText = `
      border: 1px solid ${PRIMARY_COLOR};
      border-top: none;
      padding: 8px 10px 10px 10px;
      font-size: 12px;
    `;

    const isOpen = localStorage.getItem(OPEN_KEY) !== 'false';
    body.style.display = isOpen ? 'block' : 'none';
    header.textContent = isOpen ? `Multi Quick Flip ${SCRIPT_VERSION} ▴` : `Multi Quick Flip ${SCRIPT_VERSION} ▾`;
    header.onclick = () => {
      const nowOpen = body.style.display === 'none';
      body.style.display = nowOpen ? 'block' : 'none';
      header.textContent = nowOpen ? `Multi Quick Flip ${SCRIPT_VERSION} ▴` : `Multi Quick Flip ${SCRIPT_VERSION} ▾`;
      localStorage.setItem(OPEN_KEY, String(nowOpen));
    };

    const hud = document.createElement('div');
    hud.style.cssText = `
      margin-bottom: 6px;
      padding: 4px 6px;
      background: #e9f6ff;
      border-radius: 4px;
      border: 1px solid ${PRIMARY_COLOR};
      display: grid;
      gap: 4px;
      font-size: 11px;
      font-weight: 600;
    `;

    const timerLine = document.createElement('div');
    timerLine.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:4px;';

    const hudText = document.createElement('span');
    const modesWrap = document.createElement('div');
    modesWrap.style.display = 'flex';
    modesWrap.style.gap = '2px';

    const modeButtons = {};
    MODE_ORDER.forEach(mode => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = MODES[mode].label;
      Object.assign(b.style, {
        borderRadius: '4px',
        border: '1px solid ' + PRIMARY_COLOR,
        padding: '2px 4px',
        cursor: 'pointer',
        fontSize: '10px',
        fontWeight: 700,
        background: '#fff',
        color: PRIMARY_COLOR
      });
      b.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setMode(mode);
      };
      modeButtons[mode] = b;
      modesWrap.appendChild(b);
    });

    timerLine.appendChild(hudText);
    timerLine.appendChild(modesWrap);

    const statusLine = document.createElement('div');
    statusLine.id = 'fcsku-status-line';
    statusLine.style.cssText = `
      padding: 3px 4px;
      border: 1px solid #9bb;
      background: #fff;
      border-radius: 3px;
      min-height: 14px;
      font-weight: 500;
      word-break: break-word;
    `;

    hud.appendChild(timerLine);
    hud.appendChild(statusLine);
    body.appendChild(hud);

    updateModeButtons = () => {
      const cur = getMode();
      MODE_ORDER.forEach(m => {
        const b = modeButtons[m];
        if (!b) return;
        b.style.background = m === cur ? '#000' : '#fff';
        b.style.color = m === cur ? '#fff' : PRIMARY_COLOR;
      });
    };

    updateHud = (msg) => {
      const delay = getDelay();
      hudText.textContent = `Smart Timer: ${delay} ms`;
      if (msg != null) {
        statusLine.textContent = msg;
      } else {
        const q = readQueue();
        const active = localStorage.getItem(ACTIVE_KEY) === '1';
        const phase = localStorage.getItem(PHASE_KEY) || 'idle';
        if (active) {
          statusLine.textContent = `Active: ${q.length} remaining | ${phase}`;
        } else {
          statusLine.textContent = `${SCRIPT_VERSION} | Idle`;
        }
      }
    };

    function label(text) {
      const l = document.createElement('div');
      l.textContent = text;
      l.style.fontWeight = 'bold';
      l.style.margin = '6px 0 2px';
      return l;
    }

    function input(id, value) {
      const i = document.createElement('input');
      i.id = id;
      i.type = 'text';
      i.value = value || '';
      i.style.cssText = `
        width: 100%;
        box-sizing: border-box;
        padding: 6px 6px;
        border-radius: 4px;
        border: 1px solid ${PRIMARY_COLOR};
        font-size: 12px;
      `;
      i.addEventListener('input', preservePanelInputs, true);
      i.addEventListener('change', preservePanelInputs, true);
      return i;
    }

    const oldInput = input('fcsku-old-fixed', localStorage.getItem(OLD_KEY) || '');
    const newInput = input('fcsku-new-fixed', localStorage.getItem(NEW_KEY) || '');

    const locArea = document.createElement('textarea');
    locArea.id = 'fcsku-locations-text';
    locArea.value = localStorage.getItem(TEXT_KEY) || '';
    locArea.style.cssText = `
      width: 100%;
      box-sizing: border-box;
      height: 120px;
      padding: 6px 6px;
      border-radius: 4px;
      border: 1px solid ${PRIMARY_COLOR};
      font-family: monospace;
      font-size: 11px;
      resize: vertical;
    `;
    locArea.addEventListener('input', preservePanelInputs, true);
    locArea.addEventListener('change', preservePanelInputs, true);

    body.appendChild(label('OLD FCSKU:'));
    body.appendChild(oldInput);
    body.appendChild(label('NEW FCSKU:'));
    body.appendChild(newInput);
    body.appendChild(label('LOCATIONS / CONTAINERS (one per line)'));
    body.appendChild(locArea);

    const startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.textContent = 'Start Multi Flip';
    startBtn.style.cssText = `
      margin-top: 8px;
      width: 100%;
      padding: 7px 0;
      border-radius: 4px;
      border: none;
      background: ${PRIMARY_COLOR};
      color: ${TEXT_COLOR};
      font-weight: bold;
      font-size: 12px;
      cursor: pointer;
    `;
    startBtn.onmouseover = () => startBtn.style.background = HOVER_COLOR;
    startBtn.onmouseout = () => startBtn.style.background = PRIMARY_COLOR;

    startBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();

      const oldCode = oldInput.value.trim();
      const newCode = newInput.value.trim();
      const lines = locArea.value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);

      if (!oldCode || !newCode) return alert('Old and New FCSKU are required.');
      if (!lines.length) return alert('Enter at least one location/container.');

      // CRITICAL: store fixed old/new only from these inputs.
      localStorage.setItem(OLD_KEY, oldCode);
      localStorage.setItem(NEW_KEY, newCode);
      localStorage.setItem(TEXT_KEY, locArea.value);

      localStorage.setItem(QUEUE_KEY, JSON.stringify(lines));
      localStorage.setItem(TOTAL_KEY, String(lines.length));
      localStorage.setItem(DONE_KEY, '0');
      localStorage.setItem(ACTIVE_KEY, '1');
      localStorage.setItem(PHASE_KEY, 'container');

      status(`Starting: ${lines.length} locations`);
      kickDrive();
    };

    const stopBtn = document.createElement('button');
    stopBtn.type = 'button';
    stopBtn.textContent = 'Stop / Clear Queue';
    stopBtn.style.cssText = `
      margin-top: 7px;
      width: 100%;
      padding: 6px 0;
      border-radius: 4px;
      border: 1px solid ${PRIMARY_COLOR};
      background: #fff;
      color: ${PRIMARY_COLOR};
      font-weight: bold;
      font-size: 12px;
      cursor: pointer;
    `;
    stopBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      stopClearQueue();
    };

    body.appendChild(startBtn);
    body.appendChild(stopBtn);

    panel.appendChild(header);
    panel.appendChild(body);
    host.appendChild(panel);

    updateModeButtons();
    updateHud();
  }

  /*********** MAIN PROCESSOR ***********/
  async function processQueue() {
    if (running) return;
    if (localStorage.getItem(ACTIVE_KEY) !== '1') {
      updateHud?.();
      return;
    }

    running = true;
    try {
      const q = readQueue();
      const oldCode = (localStorage.getItem(OLD_KEY) || '').trim();
      const newCode = (localStorage.getItem(NEW_KEY) || '').trim();

      if (!q.length) {
        clearRun();
        return;
      }
      if (!oldCode || !newCode) {
        status('Stopped: old/new missing');
        clearRun();
        return;
      }

      let phase = localStorage.getItem(PHASE_KEY) || 'container';
      const currentLoc = q[0];

      updateHud();

      if (phase === 'container') {
        status(`Active: ${q.length} remaining | container`);
        const input = await waitForInputOn('container', 16000);
        if (!input) throw new Error(`Waiting/retry: container input not ready | current=${pageKind()}`);

        setNativeValue(input, currentLoc);
        await settle(100);

        // Set next phase BEFORE click so a SPA re-render cannot rerun container into wrong field.
        localStorage.setItem(PHASE_KEY, 'old');
        if (!clickButton('continue')) {
          localStorage.setItem(PHASE_KEY, 'container');
          throw new Error('Continue button not found on container');
        }
        await settle(400);
        return;
      }

      if (phase === 'old') {
        status(`Active: ${q.length} remaining | old`);
        const input = await waitForInputOn('oldInput', 18000);
        if (!input) throw new Error(`Waiting/retry: OLD page not ready | current=${pageKind()} heading=${headingText()}`);

        setNativeValue(input, oldCode);
        await settle(100);

        localStorage.setItem(PHASE_KEY, 'new');
        if (!clickButton('continue')) {
          localStorage.setItem(PHASE_KEY, 'old');
          throw new Error('Continue button not found on old');
        }
        await settle(500);
        return;
      }

      if (phase === 'new') {
        status(`Active: ${q.length} remaining | new`);
        const input = await waitForInputOn('newInput', 18000);
        if (!input) throw new Error(`Waiting/retry: NEW page not ready | current=${pageKind()} heading=${headingText()}`);

        // Hard gate: never type NEW unless the actual page heading is Enter New FnSku.
        await waitFor(() => pageKind() === 'newInput' && visibleTextInput(), 18000, 150);

        setNativeValue(input, newCode);
        await settle(100);

        localStorage.setItem(PHASE_KEY, 'confirm');
        if (!clickButton('continue')) {
          localStorage.setItem(PHASE_KEY, 'new');
          throw new Error('Continue button not found on new');
        }
        await settle(600);
        return;
      }

      if (phase === 'confirm') {
        status(`Active: ${q.length} remaining | confirm`);
        const ok = await waitForKind('confirm', 16000);
        if (!ok) throw new Error(`Waiting/retry: confirm not ready | current=${pageKind()}`);

        await settle(200);
        // Confirm only. Do not click Edit / quantity.
        const confirmButtons = Array.from(document.querySelectorAll('button,input[type="button"],input[type="submit"],a'))
          .filter(el => !el.closest('#fcskuflip-multiflip-v109'))
          .filter(el => {
            const txt = lower(el.textContent || el.value || '');
            const clean = txt.replace(/\([^)]*\)/g, '').trim();
            return clean === 'confirm' || clean === 'confirm enter';
          });

        const confirmBtn = confirmButtons.find(el => {
          const txt = lower(el.textContent || el.value || '');
          return !txt.includes('edit') && !txt.includes('quantity');
        });

        if (confirmBtn) {
          confirmBtn.scrollIntoView?.({ block: 'center', inline: 'center' });
          confirmBtn.click();
          lastActionAt = Date.now();
        } else {
          // fallback if app binds Enter cleaner than DOM click
          pressKey('Enter');
        }

        // After Confirm, fire Start over when either Success OR the post-confirm Input Item reload appears.
        localStorage.setItem(PHASE_KEY, 'restart');
        const startedOver = await waitForPostConfirmThenStartOver(9000);
        if (!startedOver) throw new Error(`Post-confirm page not seen | current=${pageKind()}`);
        await sleep(80);
        return;
      }

      if (phase === 'restart') {
        status(`Active: ${q.length} remaining | restart`);

        const start = Date.now();
        let lastStartOverAttempt = 0;
        let ok = false;

        while (Date.now() - start < 18000) {
          if (pageKind() === 'container') {
            ok = true;
            break;
          }

          // If still sitting on Success, Start over was missed/ignored. Fire once, not spam.
          if ((pageKind() === 'success' || pageKind() === 'successMenu' || hasExactSuccess()) &&
              Date.now() - lastStartOverAttempt > 700) {
            triggerStartOverOnce();
            lastStartOverAttempt = Date.now();
          }

          await sleep(60);
        }

        if (!ok) {
          throw new Error(`Waiting/retry: scan container not back | current=${pageKind()}`);
        }

        // Only mark the container complete once Scan Container is actually back.
        q.shift();
        localStorage.setItem(DONE_KEY, String(Number(localStorage.getItem(DONE_KEY) || 0) + 1));
        saveQueue(q);

        if (!q.length) {
          clearRun();
          status('Done');
          return;
        }

        localStorage.setItem(PHASE_KEY, 'container');
        await settle(200);
        return;
      }

      localStorage.setItem(PHASE_KEY, 'container');

    } catch (err) {
      console.error('[FcSku Multi Quick Flip]', err);
      setDelay(getDelay() + 80);
      status(String(err && err.message ? err.message : err).slice(0, 160));
    } finally {
      running = false;
      scheduleDrive();
    }
  }

  function kickDrive() {
    if (driveTimer) clearTimeout(driveTimer);
    driveTimer = setTimeout(processQueue, 100);
  }

  function scheduleDrive() {
    if (driveTimer) clearTimeout(driveTimer);
    if (localStorage.getItem(ACTIVE_KEY) === '1') {
      driveTimer = setTimeout(processQueue, 500);
    }
  }

  /*********** BOOT / OBSERVERS ***********/
  function boot() {
    if (booted) return;
    booted = true;

    const tryUi = () => {
      insertUI();
      if (!document.getElementById('fcskuflip-multiflip-v109')) setTimeout(tryUi, 250);
    };
    tryUi();

    const mo = new MutationObserver(() => {
      lastDomChangeAt = Date.now();
      insertUI();
      if (localStorage.getItem(ACTIVE_KEY) === '1') kickDrive();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true });

    window.addEventListener('keydown', (e) => {
      if (e.altKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        const cur = getMode();
        const next = MODE_ORDER[(MODE_ORDER.indexOf(cur) + 1) % MODE_ORDER.length];
        setMode(next);
        e.preventDefault();
      }

      if (e.ctrlKey && e.altKey && (e.key === 'Q' || e.key === 'q')) {
        e.preventDefault();
        stopClearQueue();
      }
    }, true);

    setInterval(() => {
      insertUI();
      updateHud?.();
      if (localStorage.getItem(ACTIVE_KEY) === '1') kickDrive();
    }, 1000);

    if (localStorage.getItem(ACTIVE_KEY) === '1') kickDrive();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
    setTimeout(boot, 1500);
  } else {
    boot();
  }
})();