// ==UserScript==
// @name         v1.4.3 SidelineApp Helper CLEAN TEST
// @namespace    https://github.com/1Sirkkris
// @version      1.4.3
// @description  Scan source or destination again to start Lazy Sideline; simplified state display and safer Clear Source placement.
// @match        https://aft-poirot-website-nrt.nrt.proxy.amazon.com/*
// @require      https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/e409914de9433290527fb93197bae0e0f7edb4c4/scripts/SidelineApp_Helper_CLEAN_TEST.user.js
// @require      https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/51643623e3e66a7c7c2a00e6e245a5dc47debbab/scripts/SidelineApp_Helper_CLEAN_TEST.user.js
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SidelineApp_Helper_CLEAN_TEST.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SidelineApp_Helper_CLEAN_TEST.user.js
// @run-at       document-end
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  if (window.__sidelineCleanExpiryQty_v143) return;
  window.__sidelineCleanExpiryQty_v143 = true;

  const VERSION = '1.4.3';
  const normalise = value => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

  let checkQueued = false;
  let resumeBusy = false;
  let lastResumeAt = 0;
  let replayBusy = false;
  let wasExpiryScreen = false;

  const rememberedExpiry = {
    itemKey: '',
    month: '',
    day: '',
    year: '',
    armed: false,
    leftScreen: false
  };

  const readabilityStyle = document.createElement('style');
  readabilityStyle.textContent = `
    #sh-og-expiry .og-panel{padding:9px!important}
    #sh-og-expiry .og-head{font-size:13px!important;margin-bottom:8px!important}
    #sh-og-expiry button{height:35px!important;font-size:13px!important;font-weight:850!important}
    #sh-og-expiry .og-footer button{height:48px!important;font-size:15px!important}
    #sh-lazy .sh-clear-source-option{
      display:flex!important;
      align-items:center;
      justify-content:flex-end;
      gap:7px;
      width:max-content;
      margin:12px 0 0 auto!important;
      padding:7px 10px;
      border:1px solid #fed7aa;
      border-radius:4px;
      background:#fff7ed;
      color:#9a3412;
      font-weight:750;
      cursor:pointer;
      user-select:none;
    }
    #sh-lazy .sh-clear-source-option input{margin:0;cursor:pointer}
  `;
  document.documentElement.appendChild(readabilityStyle);

  function stampVersion() {
    document.querySelectorAll('#sh-queue .sh-title, #sh-scrub .sh-title, #sh-qty .sh-title, #sh-lazy .sh-title')
      .forEach(title => {
        title.textContent = String(title.textContent || '')
          .replace(/v1\.3\.6\b/g, `v${VERSION}`)
          .replace(/v1\.4\.0\b/g, `v${VERSION}`)
          .replace(/v1\.4\.1\b/g, `v${VERSION}`)
          .replace(/v1\.4\.2\b/g, `v${VERSION}`);
      });
  }

  function visible(element) {
    if (!(element instanceof Element) || !element.isConnected || element.hidden) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }

  function pageContains(text) {
    return normalise((document.body?.innerText || document.body?.textContent || '').slice(0, 9000)).includes(text);
  }

  function isQuantityScreen() {
    const exactHeading = [...document.querySelectorAll('h1,h2,h3,h4,label,legend,p,span,div')]
      .some(element => visible(element) && normalise(element.textContent) === 'enter quantity');
    return exactHeading || pageContains('enter quantity');
  }

  function isExpiryScreen() {
    const exactHeading = [...document.querySelectorAll('h1,h2,h3,h4,label,legend,p,span,div')]
      .some(element => {
        if (!visible(element)) return false;
        const text = normalise(element.textContent);
        return text === 'enter expiry date displayed on item' || text === 'enter expiration date displayed on item';
      });
    return exactHeading || pageContains('enter expiry date displayed on item') || pageContains('enter expiration date displayed on item');
  }

  function expiryInputs() {
    const inputs = [...document.querySelectorAll('input,textarea')].filter(element =>
      visible(element) && !element.closest('#sh-dock,#sh-queue,#sh-scrub,#sh-qty,#sh-lazy,#sh-og-expiry')
    );
    const hint = regex => inputs.find(element => regex.test(normalise(
      `${element.name || ''} ${element.id || ''} ${element.placeholder || ''} ${element.getAttribute('aria-label') || ''}`
    )));
    const month = hint(/\b(mm|month)\b/);
    const day = hint(/\b(dd|day)\b/);
    const year = hint(/\b(yyyy|year)\b/);
    return month && day && year ? { month, day, year } : null;
  }

  function setInput(input, value) {
    if (!input) return false;
    const prototype = Object.getPrototypeOf(input);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
      || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
      || Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    const previous = input.value;
    if (descriptor?.set) descriptor.set.call(input, String(value));
    else input.value = String(value);
    input._valueTracker?.setValue?.(previous);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function fireEnter(input) {
    for (const type of ['keydown', 'keypress', 'keyup']) {
      input?.dispatchEvent(new KeyboardEvent(type, {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
        bubbles: true, cancelable: true, composed: true
      }));
    }
  }

  function confirmExpiry(input) {
    const direct = document.querySelector('#confirm-button');
    const button = direct && visible(direct) && !direct.disabled
      ? direct
      : [...document.querySelectorAll('button,[role="button"],input[type="submit"]')]
          .find(element => visible(element) && !element.disabled && /^(confirm|continue|submit|enter)\b/i.test(
            normalise(element.innerText || element.textContent || element.value || '')
          ));
    if (button) button.click();
    else fireEnter(input);
  }

  function currentLazyItemKey() {
    const panel = document.querySelector('#sh-lazy');
    if (!panel) return '';

    const current = panel.querySelector('.sh-item.current');
    if (current) {
      const cleaned = String(current.textContent || '').replace(/^[^A-Za-z0-9]+/, '').trim();
      const match = cleaned.match(/^([A-Za-z0-9_-]{6,})/);
      if (match) return match[1].toUpperCase();
    }

    const status = String(panel.querySelector('.sh-status')?.textContent || '');
    const parts = status.split('|').map(part => part.trim());
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      const match = parts[index].match(/^([A-Za-z0-9_-]{6,})(?:\s*[x×]\s*\d+)?$/i);
      if (match) return match[1].toUpperCase();
    }
    return '';
  }

  function lazyIsIdle() {
    const status = normalise(document.querySelector('#sh-lazy .sh-status')?.textContent);
    return !status || status.startsWith('idle') || status.startsWith('stopped');
  }

  function clearRememberedExpiry() {
    Object.assign(rememberedExpiry, {
      itemKey: '', month: '', day: '', year: '', armed: false, leftScreen: false
    });
  }

  function rememberExpiry(month, day, year) {
    const itemKey = currentLazyItemKey();
    if (!itemKey || !month || !year) return;
    Object.assign(rememberedExpiry, {
      itemKey,
      month: String(month).padStart(2, '0'),
      day: day ? String(day).padStart(2, '0') : '',
      year: String(year),
      armed: true,
      leftScreen: false
    });
    wasExpiryScreen = true;
  }

  function rememberFromNativeInputs() {
    const inputs = expiryInputs();
    if (!inputs) return;
    rememberExpiry(inputs.month.value, inputs.day.value, inputs.year.value);
  }

  function rememberPaoDate() {
    const date = new Date();
    date.setDate(date.getDate() + 900);
    rememberExpiry(date.getMonth() + 1, date.getDate(), date.getFullYear());
  }

  async function replayRememberedExpiry() {
    if (replayBusy || !rememberedExpiry.armed || !rememberedExpiry.leftScreen) return;
    if (currentLazyItemKey() !== rememberedExpiry.itemKey || !isExpiryScreen()) return;

    const inputs = expiryInputs();
    if (!inputs) return;

    replayBusy = true;
    rememberedExpiry.leftScreen = false;

    try {
      inputs.month.focus();
      inputs.month.select?.();
      setInput(inputs.month, rememberedExpiry.month);
      await new Promise(resolve => setTimeout(resolve, 35));

      inputs.day.focus();
      inputs.day.select?.();
      setInput(inputs.day, rememberedExpiry.day);
      await new Promise(resolve => setTimeout(resolve, 35));

      inputs.year.focus();
      inputs.year.select?.();
      setInput(inputs.year, rememberedExpiry.year);
      await new Promise(resolve => setTimeout(resolve, 70));

      confirmExpiry(inputs.year);
    } finally {
      setTimeout(() => {
        replayBusy = false;
        scheduleCheck();
      }, 350);
    }
  }

  function expiryPausedLazy() {
    const panel = document.querySelector('#sh-lazy');
    if (!panel || !isQuantityScreen()) return null;

    const status = normalise(panel.querySelector('.sh-status')?.textContent);
    const error = normalise(panel.querySelector('.sh-error')?.textContent);

    if (!status.startsWith('paused')) return null;
    if (!error.includes('expiry screen detected')) return null;

    const resumeButton = panel.querySelector('button[data-a="pause"]');
    return resumeButton && !resumeButton.disabled ? resumeButton : null;
  }

  function maintainExpiryMemory() {
    const expiryNow = isExpiryScreen();
    const itemKey = currentLazyItemKey();

    if (lazyIsIdle()) {
      if (rememberedExpiry.armed) clearRememberedExpiry();
    } else if (rememberedExpiry.armed && itemKey && itemKey !== rememberedExpiry.itemKey) {
      clearRememberedExpiry();
    }

    if (rememberedExpiry.armed && !expiryNow && wasExpiryScreen) {
      rememberedExpiry.leftScreen = true;
    }

    wasExpiryScreen = expiryNow;

    if (expiryNow && rememberedExpiry.armed && rememberedExpiry.leftScreen) {
      replayRememberedExpiry();
    }
  }

  function moveClearSourceControl() {
    const panel = document.querySelector('#sh-lazy');
    const checkbox = panel?.querySelector('input[data-f="clear"]');
    const label = checkbox?.closest('label');
    if (!panel || !label) return;

    label.classList.add('sh-clear-source-option');
    label.removeAttribute('style');
    label.title = 'Optional: empty the source container only after all items finish.';

    const progress = panel.querySelector('.sh-progress');
    if (progress && label.previousElementSibling !== progress) {
      progress.insertAdjacentElement('afterend', label);
    }
  }

  function simplifyLazyStatus() {
    const status = document.querySelector('#sh-lazy .sh-status');
    if (!status) return;

    const raw = normalise(status.textContent);
    let simple = '';
    if (!raw || raw.startsWith('idle') || raw.startsWith('stopped')) simple = 'IDLE';
    else if (raw.startsWith('paused') || raw.startsWith('predicant')) simple = 'PAUSED';
    else if (raw.startsWith('running') || raw.startsWith('recovering')) simple = 'ACTIVE';

    if (simple && status.textContent !== simple) status.textContent = simple;
  }

  function currentScannedLine(textarea) {
    const value = String(textarea.value || '');
    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? start;
    const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const nextBreak = value.indexOf('\n', end);
    const lineEnd = nextBreak === -1 ? value.length : nextBreak;
    return {
      value,
      lineStart,
      lineEnd,
      code: value.slice(lineStart, lineEnd).trim()
    };
  }

  function removeScannedLine(textarea, scan) {
    let before = scan.value.slice(0, scan.lineStart);
    let after = scan.value.slice(scan.lineEnd);

    if (before.endsWith('\n') && after.startsWith('\n')) after = after.slice(1);
    const nextValue = `${before}${after}`;
    setInput(textarea, nextValue);
    textarea.focus();
    textarea.setSelectionRange?.(nextValue.length, nextValue.length);
  }

  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.repeat) return;

    const textarea = event.target.closest?.('#sh-lazy textarea[data-f="items"]');
    if (!textarea) return;

    const panel = textarea.closest('#sh-lazy');
    const status = panel?.querySelector('.sh-status');
    if (!panel || !normalise(status?.textContent).startsWith('idle')) return;

    const source = String(panel.querySelector('input[data-f="src"]')?.value || '').trim();
    const destination = String(panel.querySelector('input[data-f="dest"]')?.value || '').trim();
    const validContainer = value => /^(?:cs|ts)x[0-9a-z_-]+$/i.test(value);
    if (!validContainer(source) || !validContainer(destination)) return;

    const scan = currentScannedLine(textarea);
    const code = normalise(scan.code);
    if (code !== normalise(source) && code !== normalise(destination)) return;

    const remainingText = `${scan.value.slice(0, scan.lineStart)}${scan.value.slice(scan.lineEnd)}`;
    const hasItems = remainingText.split(/\r?\n/).some(line => line.trim());
    if (!hasItems) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    removeScannedLine(textarea, scan);

    const startButton = panel.querySelector('button[data-a="start"]');
    if (startButton && !startButton.disabled) setTimeout(() => startButton.click(), 20);
  }, true);

  function runCheck() {
    checkQueued = false;
    stampVersion();
    moveClearSourceControl();
    simplifyLazyStatus();
    maintainExpiryMemory();

    if (resumeBusy || Date.now() - lastResumeAt < 750) return;
    const resumeButton = expiryPausedLazy();
    if (!resumeButton) return;

    resumeBusy = true;
    lastResumeAt = Date.now();
    resumeButton.click();

    setTimeout(() => {
      resumeBusy = false;
      scheduleCheck();
    }, 500);
  }

  function scheduleCheck() {
    if (checkQueued) return;
    checkQueued = true;
    requestAnimationFrame(runCheck);
  }

  document.addEventListener('click', event => {
    if (!isExpiryScreen()) return;
    const target = event.target.closest?.('#confirm-button,button,[role="button"],input[type="submit"]');
    if (!target || target.closest('#sh-og-expiry')) return;
    const label = normalise(target.innerText || target.textContent || target.value || '');
    if (/^(confirm|continue|submit|enter)\b/.test(label)) rememberFromNativeInputs();
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key === 'Enter' && isExpiryScreen() && event.target.closest?.('input,textarea')) {
      rememberFromNativeInputs();
    }
  }, true);

  document.addEventListener('click', event => {
    const button = event.target.closest?.('#sh-og-expiry button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    if (action === 'pao') {
      rememberPaoDate();
      return;
    }

    if (action === 'year') setTimeout(rememberFromNativeInputs, 0);
  }, false);

  const observer = new MutationObserver(scheduleCheck);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['hidden', 'style', 'class', 'aria-hidden', 'disabled']
  });

  setInterval(scheduleCheck, 500);
  window.addEventListener('pageshow', scheduleCheck, true);
  scheduleCheck();
})();
