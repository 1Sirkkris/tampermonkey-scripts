// ==UserScript==
// @name         v1.4.1 SidelineApp Helper CLEAN TEST
// @namespace    https://github.com/1Sirkkris
// @version      1.4.1
// @description  Lazy Sideline expiry-to-quantity handoff, retained expiry through Predicant recovery, and larger expiry controls.
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
  if (window.__sidelineCleanExpiryQty_v141) return;
  window.__sidelineCleanExpiryQty_v141 = true;

  const VERSION = '1.4.1';
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
  `;
  document.documentElement.appendChild(readabilityStyle);

  function stampVersion() {
    document.querySelectorAll('#sh-queue .sh-title, #sh-scrub .sh-title, #sh-qty .sh-title, #sh-lazy .sh-title')
      .forEach(title => {
        title.textContent = String(title.textContent || '')
          .replace(/v1\.3\.6\b/g, `v${VERSION}`)
          .replace(/v1\.4\.0\b/g, `v${VERSION}`);
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

  function runCheck() {
    checkQueued = false;
    stampVersion();
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
