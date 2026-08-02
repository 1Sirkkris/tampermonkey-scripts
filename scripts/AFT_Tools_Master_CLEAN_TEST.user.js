// ==UserScript==
// @name         v0.1.0 AFT Tools Master CLEAN TEST
// @namespace    https://github.com/1Sirkkris
// @version      0.1.0
// @description  Clean AFT master: MoveItems quantity auto-enter + FcSku Multi Quick Flip. Shared core, no dead modules.
// @match        http://aft-qt-jp.aka.nrt.corp.amazon.com/app/moveitems*
// @match        https://aft-qt-jp.aka.nrt.corp.amazon.com/app/moveitems*
// @match        http://aft-qt-*.aka.*.corp.amazon.com/app/moveitems*
// @match        https://aft-qt-*.aka.*.corp.amazon.com/app/moveitems*
// @match        http://aft-qt-*.corp.amazon.com/app/moveitems*
// @match        https://aft-qt-*.corp.amazon.com/app/moveitems*
// @match        http://aft-qt-jp.aka.nrt.corp.amazon.com/app/fcskuflip*
// @match        https://aft-qt-jp.aka.nrt.corp.amazon.com/app/fcskuflip*
// @match        http://aft-qt-*.aka.*.corp.amazon.com/app/fcskuflip*
// @match        https://aft-qt-*.aka.*.corp.amazon.com/app/fcskuflip*
// @match        http://aft-qt-*.corp.amazon.com/app/fcskuflip*
// @match        https://aft-qt-*.corp.amazon.com/app/fcskuflip*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/AFT_Tools_Master_CLEAN_TEST.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/AFT_Tools_Master_CLEAN_TEST.user.js
// ==/UserScript==

(() => {
  'use strict';

  if (window.__AFT_TOOLS_MASTER_CLEAN_TEST_V010__) return;
  window.__AFT_TOOLS_MASTER_CLEAN_TEST_V010__ = true;

  const VERSION = '0.1.0';
  const MODULES = [];
  let routeTimer = 0;
  let observer = null;

  const norm = value => String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const lower = value => norm(value).toLowerCase();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function visible(element) {
    if (!element || !element.isConnected || element.disabled) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  function setNativeValue(element, value) {
    if (!element) return false;
    const proto = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    element.focus();
    if (descriptor?.set) descriptor.set.call(element, String(value));
    else element.value = String(value);
    element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: String(value)
    }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function pressKey(target, key) {
    const code = key === 'Enter' ? 'Enter' : `Key${String(key).toUpperCase()}`;
    const keyCode = key === 'Enter' ? 13 : String(key).toUpperCase().charCodeAt(0);
    for (const type of ['keydown', 'keypress', 'keyup']) {
      (target || document).dispatchEvent(new KeyboardEvent(type, {
        key, code, keyCode, which: keyCode, charCode: keyCode,
        bubbles: true, cancelable: true, composed: true
      }));
    }
  }

  function pageText() {
    return norm(document.body?.innerText || '');
  }

  function headingText() {
    const headings = [...document.querySelectorAll('h1,h2,h3,[role="heading"]')];
    return norm(headings.map(node => node.textContent).find(Boolean) || '');
  }

  function visibleTextInput(excludeSelector = '') {
    return [...document.querySelectorAll('input[type="text"],input:not([type]),textarea')]
      .filter(visible)
      .find(element => !excludeSelector || !element.closest(excludeSelector)) || null;
  }

  function findButton(parts, excludeSelector = '') {
    const wanted = parts.map(lower);
    return [...document.querySelectorAll('button,input[type="button"],input[type="submit"],a,[role="button"],span.a-button,div.a-button')]
      .filter(visible)
      .filter(element => !excludeSelector || !element.closest(excludeSelector))
      .find(element => {
        const text = lower(element.textContent || element.value || element.getAttribute('aria-label'));
        return text && wanted.some(part => text.includes(part));
      }) || null;
  }

  function clickButton(parts, excludeSelector = '') {
    const node = findButton(parts, excludeSelector);
    if (!node) return false;
    const real = node.querySelector?.('input.a-button-input,input[type="submit"],button') || node;
    if (!visible(real)) return false;
    real.scrollIntoView?.({ block: 'center', inline: 'center' });
    real.click();
    return true;
  }

  async function waitFor(check, timeout = 12000, interval = 80) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      try {
        const result = check();
        if (result) return result;
      } catch {}
      await sleep(interval);
    }
    return null;
  }

  function route() {
    clearTimeout(routeTimer);
    routeTimer = window.setTimeout(() => {
      for (const module of MODULES) {
        const matches = module.match();
        if (matches && !module.active) {
          module.active = true;
          module.start();
        } else if (!matches && module.active) {
          module.active = false;
          module.stop?.();
        } else if (matches) {
          module.refresh?.();
        }
      }
    }, 80);
  }

  function startRouter() {
    if (observer) return;
    observer = new MutationObserver(route);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
    window.addEventListener('hashchange', route, true);
    window.addEventListener('popstate', route, true);
    window.addEventListener('focus', route, true);
    route();
  }

  const MoveItems = {
    active: false,
    running: false,
    lastKey: '',
    lastAt: 0,

    match() {
      return /\/app\/moveitems/i.test(location.pathname);
    },

    start() {
      this.refresh();
    },

    stop() {
      this.running = false;
    },

    quantityPage() {
      return /enter quantity/i.test(pageText());
    },

    quantityValue() {
      const matches = [...pageText().matchAll(/\bQuantity:\s*([0-9]{1,4})\b/gi)]
        .map(match => Number(match[1]))
        .filter(value => Number.isInteger(value) && value > 0);
      return matches.at(-1) || null;
    },

    quantityInput() {
      const inputs = [...document.querySelectorAll('input')]
        .filter(visible)
        .filter(input => ['', 'text', 'number', 'tel', 'search'].includes(lower(input.type)));

      if (inputs.includes(document.activeElement)) return document.activeElement;

      return inputs.find(input => {
        const hint = [
          input.getAttribute('aria-label'),
          input.getAttribute('placeholder'),
          input.name,
          input.id
        ].map(norm).join(' ');
        return /quantity|qty/i.test(hint);
      }) || inputs[0] || null;
    },

    async refresh() {
      if (!this.active || this.running || !this.quantityPage()) return;

      const quantity = this.quantityValue();
      const input = this.quantityInput();
      if (!quantity || !input) return;

      const key = `${location.href}|${quantity}|${pageText().slice(0, 260)}`;
      const now = Date.now();
      if (key === this.lastKey && now - this.lastAt < 3000) return;

      this.lastKey = key;
      this.lastAt = now;
      this.running = true;

      try {
        setNativeValue(input, quantity);
        await sleep(100);
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        input.focus();
        pressKey(input, 'Enter');

        await sleep(100);
        clickButton(['continue', 'enter']);

        await sleep(180);
        if (this.quantityPage()) clickButton(['continue', 'enter']);
      } finally {
        this.running = false;
      }
    }
  };

  const FcSku = {
    active: false,
    running: false,
    abortToken: 0,
    panel: null,
    statusNode: null,

    keys: {
      old: 'aft_master_fcsku_old',
      next: 'aft_master_fcsku_new',
      text: 'aft_master_fcsku_locations_text',
      queue: 'aft_master_fcsku_queue',
      active: 'aft_master_fcsku_active',
      total: 'aft_master_fcsku_total',
      done: 'aft_master_fcsku_done',
      mode: 'aft_master_fcsku_mode',
      open: 'aft_master_fcsku_open'
    },

    modes: {
      safe: 700,
      normal: 500,
      aggressive: 350
    },

    match() {
      return /\/app\/fcskuflip/i.test(location.pathname);
    },

    start() {
      this.ensurePanel();
      this.refresh();
    },

    stop() {
      this.abortToken++;
      this.running = false;
      this.panel?.remove();
      this.panel = null;
    },

    getMode() {
      const value = localStorage.getItem(this.keys.mode);
      return this.modes[value] ? value : 'aggressive';
    },

    getDelay() {
      return this.modes[this.getMode()];
    },

    setMode(mode) {
      localStorage.setItem(this.keys.mode, this.modes[mode] ? mode : 'normal');
      this.updatePanel();
    },

    readQueue() {
      try {
        const value = JSON.parse(localStorage.getItem(this.keys.queue) || '[]');
        return Array.isArray(value) ? value : [];
      } catch {
        return [];
      }
    },

    saveQueue(queue) {
      localStorage.setItem(this.keys.queue, JSON.stringify(queue));
      this.updatePanel();
    },

    pageKind() {
      const heading = lower(headingText());
      const text = lower(pageText());

      if (text.includes('success') && text.includes('start over')) return 'success';
      if (/^success$/i.test(headingText())) return 'success';
      if (heading.includes('scan container') || text.includes('scan container')) return 'container';
      if (heading.includes('enter new fnsku') || heading.includes('enter new fcsku') ||
          text.includes('enter new fnsku') || text.includes('enter new fcsku')) return 'new';
      if (heading.includes('input item') || text.includes('fnskus, fcskus, and lpns are supported')) return 'old';
      if (heading.includes('confirm flip') || text.includes('confirm flip')) return 'confirm';
      return 'unknown';
    },

    currentFields() {
      if (!this.panel) return null;
      return {
        old: this.panel.querySelector('[data-aft-old]'),
        next: this.panel.querySelector('[data-aft-new]'),
        locations: this.panel.querySelector('[data-aft-locations]')
      };
    },

    saveFields() {
      const fields = this.currentFields();
      if (!fields) return;
      localStorage.setItem(this.keys.old, norm(fields.old.value));
      localStorage.setItem(this.keys.next, norm(fields.next.value));
      localStorage.setItem(this.keys.text, fields.locations.value);
    },

    buildQueue() {
      const fields = this.currentFields();
      if (!fields) return false;

      const oldCode = norm(fields.old.value);
      const newCode = norm(fields.next.value);
      const queue = fields.locations.value
        .split(/\r?\n/)
        .map(norm)
        .filter(Boolean);

      if (!oldCode || !newCode || !queue.length) {
        this.status('Need old, new and at least one container');
        return false;
      }

      this.saveFields();
      this.saveQueue(queue);
      localStorage.setItem(this.keys.total, String(queue.length));
      localStorage.setItem(this.keys.done, '0');
      localStorage.setItem(this.keys.active, '1');
      return true;
    },

    clearRun(message = 'Idle') {
      this.abortToken++;
      this.running = false;
      localStorage.removeItem(this.keys.queue);
      localStorage.removeItem(this.keys.active);
      localStorage.removeItem(this.keys.total);
      localStorage.removeItem(this.keys.done);
      this.status(message);
      this.updatePanel();
    },

    ensurePanel() {
      if (this.panel?.isConnected) return;
      if (!document.body) return;

      const panel = document.createElement('section');
      panel.id = 'aft-master-fcsku-panel';
      panel.style.cssText = `
        position:fixed; top:86px; left:10px; z-index:2147483647;
        width:290px; font:12px/1.35 Arial,sans-serif;
        border-radius:7px; overflow:hidden; background:#f9f9f9;
        box-shadow:0 2px 9px rgba(0,0,0,.30);
      `;

      panel.innerHTML = `
        <header data-aft-toggle style="background:#002e36;color:#fff;padding:8px 10px;font-weight:800;cursor:pointer">
          AFT Multi Quick Flip v${VERSION} ▴
        </header>
        <div data-aft-body style="border:1px solid #002e36;border-top:0;padding:9px">
          <label style="display:block;margin-bottom:7px">Old FNSKU/FCSKU
            <input data-aft-old type="text" style="box-sizing:border-box;width:100%;padding:6px;margin-top:3px">
          </label>
          <label style="display:block;margin-bottom:7px">New FNSKU/FCSKU
            <input data-aft-new type="text" style="box-sizing:border-box;width:100%;padding:6px;margin-top:3px">
          </label>
          <label style="display:block;margin-bottom:7px">Containers / locations
            <textarea data-aft-locations rows="7" style="box-sizing:border-box;width:100%;padding:6px;margin-top:3px;resize:vertical"></textarea>
          </label>
          <div data-aft-modes style="display:flex;gap:5px;margin-bottom:7px">
            <button type="button" data-mode="safe">Safe</button>
            <button type="button" data-mode="normal">Normal</button>
            <button type="button" data-mode="aggressive">Aggressive</button>
          </div>
          <div style="display:flex;gap:6px">
            <button type="button" data-aft-start style="flex:1;background:#002e36;color:#fff;font-weight:800">START</button>
            <button type="button" data-aft-stop>STOP</button>
            <button type="button" data-aft-clear>CLEAR</button>
          </div>
          <div data-aft-status style="margin-top:8px;min-height:16px;font-weight:700">Idle</div>
        </div>
      `;

      document.body.appendChild(panel);
      this.panel = panel;
      this.statusNode = panel.querySelector('[data-aft-status]');

      const fields = this.currentFields();
      fields.old.value = localStorage.getItem(this.keys.old) || '';
      fields.next.value = localStorage.getItem(this.keys.next) || '';
      fields.locations.value = localStorage.getItem(this.keys.text) || '';

      for (const field of Object.values(fields)) field.addEventListener('input', () => this.saveFields());

      panel.querySelector('[data-aft-toggle]').addEventListener('click', () => {
        const body = panel.querySelector('[data-aft-body]');
        const open = body.style.display !== 'none';
        body.style.display = open ? 'none' : 'block';
        panel.querySelector('[data-aft-toggle]').textContent =
          `AFT Multi Quick Flip v${VERSION} ${open ? '▾' : '▴'}`;
        localStorage.setItem(this.keys.open, open ? '0' : '1');
      });

      panel.querySelectorAll('[data-mode]').forEach(button => {
        button.addEventListener('click', () => this.setMode(button.dataset.mode));
      });

      panel.querySelector('[data-aft-start]').addEventListener('click', () => {
        if (!this.buildQueue()) return;
        this.status('Starting…');
        this.drive();
      });

      panel.querySelector('[data-aft-stop]').addEventListener('click', () => {
        this.abortToken++;
        this.running = false;
        localStorage.removeItem(this.keys.active);
        this.status('Stopped — queue kept');
      });

      panel.querySelector('[data-aft-clear]').addEventListener('click', () => this.clearRun('Queue cleared'));

      if (localStorage.getItem(this.keys.open) === '0') {
        panel.querySelector('[data-aft-body]').style.display = 'none';
        panel.querySelector('[data-aft-toggle]').textContent = `AFT Multi Quick Flip v${VERSION} ▾`;
      }

      this.updatePanel();

      if (localStorage.getItem(this.keys.active) === '1' && this.readQueue().length) {
        this.status('Resuming…');
        this.drive();
      }
    },

    updatePanel() {
      if (!this.panel) return;
      const mode = this.getMode();
      this.panel.querySelectorAll('[data-mode]').forEach(button => {
        const active = button.dataset.mode === mode;
        button.style.background = active ? '#002e36' : '#eee';
        button.style.color = active ? '#fff' : '#111';
        button.style.fontWeight = active ? '800' : '400';
      });

      const queue = this.readQueue();
      const total = Number(localStorage.getItem(this.keys.total)) || queue.length;
      const done = Number(localStorage.getItem(this.keys.done)) || 0;
      if (localStorage.getItem(this.keys.active) === '1') {
        this.status(`${done}/${total} complete • ${queue.length} remaining • ${mode}`);
      }
    },

    status(message) {
      if (this.statusNode) this.statusNode.textContent = message;
    },

    async inputAndEnter(value, expectedKind, token) {
      const input = await waitFor(() => {
        if (token !== this.abortToken) return null;
        if (expectedKind && this.pageKind() !== expectedKind) return null;
        return visibleTextInput('#aft-master-fcsku-panel');
      }, 12000, 80);

      if (!input || token !== this.abortToken) return false;
      setNativeValue(input, value);
      await sleep(70);
      pressKey(input, 'Enter');
      return true;
    },

    async waitForNextKind(previous, token, timeout = 12000) {
      return await waitFor(() => {
        if (token !== this.abortToken) return null;
        const kind = this.pageKind();
        return kind !== previous && kind !== 'unknown' ? kind : null;
      }, timeout, 80);
    },

    async startOver(token) {
      if (token !== this.abortToken) return false;

      if (clickButton(['start over'], '#aft-master-fcsku-panel')) return true;
      pressKey(document, 'r');
      return true;
    },

    async processOne(container, oldCode, newCode, token) {
      const delay = this.getDelay();

      let kind = this.pageKind();
      if (kind === 'success') {
        await this.startOver(token);
        await sleep(delay);
        kind = await waitFor(() => this.pageKind() === 'container' ? 'container' : null, 10000, 80);
      }

      if (kind !== 'container') {
        const ready = await waitFor(() => this.pageKind() === 'container' ? true : null, 12000, 80);
        if (!ready) throw new Error('Container screen not found');
      }

      this.status(`Container: ${container}`);
      if (!await this.inputAndEnter(container, 'container', token)) throw new Error('Container entry failed');
      await sleep(delay);
      if (!await this.waitForNextKind('container', token)) throw new Error('Old SKU screen not found');

      this.status(`Old: ${oldCode}`);
      if (!await this.inputAndEnter(oldCode, 'old', token)) throw new Error('Old SKU entry failed');
      await sleep(delay);
      if (!await this.waitForNextKind('old', token)) throw new Error('New SKU screen not found');

      this.status(`New: ${newCode}`);
      if (!await this.inputAndEnter(newCode, 'new', token)) throw new Error('New SKU entry failed');
      await sleep(delay);

      const confirmReady = await waitFor(() => this.pageKind() === 'confirm' ? true : null, 12000, 80);
      if (!confirmReady) throw new Error('Confirm screen not found');

      this.status('Confirming…');
      if (!clickButton(['confirm flip', 'confirm', 'continue'], '#aft-master-fcsku-panel')) {
        pressKey(document, 'Enter');
      }

      const finished = await waitFor(() => {
        if (token !== this.abortToken) return null;
        const next = this.pageKind();
        return next === 'success' || next === 'old' || next === 'container' ? next : null;
      }, 12000, 80);

      if (!finished) throw new Error('Success not detected');
      await this.startOver(token);
      await sleep(delay);
      return true;
    },

    async drive() {
      if (!this.active || this.running) return;
      const queue = this.readQueue();
      if (!queue.length || localStorage.getItem(this.keys.active) !== '1') return;

      const oldCode = norm(localStorage.getItem(this.keys.old));
      const newCode = norm(localStorage.getItem(this.keys.next));
      if (!oldCode || !newCode) {
        this.clearRun('Missing old/new SKU');
        return;
      }

      this.running = true;
      const token = ++this.abortToken;

      try {
        while (token === this.abortToken && localStorage.getItem(this.keys.active) === '1') {
          const currentQueue = this.readQueue();
          if (!currentQueue.length) {
            localStorage.removeItem(this.keys.active);
            this.status('Complete');
            this.updatePanel();
            break;
          }

          const container = currentQueue[0];
          try {
            await this.processOne(container, oldCode, newCode, token);
          } catch (error) {
            if (token !== this.abortToken) break;
            this.status(`Stopped: ${error.message || error}`);
            localStorage.removeItem(this.keys.active);
            break;
          }

          currentQueue.shift();
          this.saveQueue(currentQueue);
          const done = (Number(localStorage.getItem(this.keys.done)) || 0) + 1;
          localStorage.setItem(this.keys.done, String(done));
          this.updatePanel();
        }
      } finally {
        if (token === this.abortToken) this.running = false;
      }
    },

    refresh() {
      if (!this.active) return;
      this.ensurePanel();
      if (!this.running && localStorage.getItem(this.keys.active) === '1' && this.readQueue().length) {
        this.drive();
      }
    }
  };

  MODULES.push(MoveItems, FcSku);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startRouter, { once: true });
  } else {
    startRouter();
  }

  console.log(`AFT Tools Master CLEAN TEST v${VERSION} loaded`);
})();