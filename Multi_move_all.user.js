// ==UserScript==
// @name         v1.0.1 Multi move all
// @namespace    MONKIES
// @version      1.0.1
// @description  Auto-fills MoveItems quantity from the left-side product quantity text, then presses Continue.
// @author       MONKIES
// @match        https://aft-qt-jp.aka.nrt.corp.amazon.com/app/moveitems*
// @match        http://aft-qt-jp.aka.nrt.corp.amazon.com/app/moveitems*
// @match        https://aft-qt-*.aka.*.corp.amazon.com/app/moveitems*
// @match        http://aft-qt-*.aka.*.corp.amazon.com/app/moveitems*
// @match        https://aft-qt-*.corp.amazon.com/app/moveitems*
// @match        http://aft-qt-*.corp.amazon.com/app/moveitems*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Multi_move_all.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Multi_move_all.user.js
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '1.0.1';
  const SCRIPT_NAME = 'MoveItems Quantity Auto Enter';

  let lastRunKey = '';
  let lastRunAt = 0;

  function norm(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  }

  function getPageText() {
    return norm(document.body ? document.body.innerText : '');
  }

  function isQuantityPage() {
    return /enter quantity/i.test(getPageText());
  }

  function findQuantityValue() {
    const text = getPageText();
    const matches = [...text.matchAll(/\bQuantity:\s*(\d{1,4})\b/gi)]
      .map(m => Number(m[1]))
      .filter(n => Number.isInteger(n) && n > 0);

    return matches.length ? matches[matches.length - 1] : null;
  }

  function findQuantityInput() {
    const inputs = [...document.querySelectorAll('input')]
      .filter(isVisible)
      .filter(input => {
        const type = String(input.type || '').toLowerCase();
        return !type || ['text', 'number', 'tel', 'search'].includes(type);
      });

    const active = document.activeElement;
    if (active && inputs.includes(active)) return active;

    return inputs.find(input => {
      const hint = [
        input.getAttribute('aria-label'),
        input.getAttribute('placeholder'),
        input.name,
        input.id
      ].map(norm).join(' ');
      return /quantity|qty/i.test(hint);
    }) || inputs[0] || null;
  }

  function findContinueButton() {
    const candidates = [...document.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"], a')]
      .filter(isVisible);

    return candidates.find(el => /continue|enter/i.test(norm(el.innerText || el.value || el.getAttribute('aria-label')))) || null;
  }

  function setNativeValue(input, value) {
    const descriptor =
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value') ||
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

    if (descriptor && descriptor.set) descriptor.set.call(input, String(value));
    else input.value = String(value);

    input.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: String(value)
    }));

    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fireEnter(target) {
    const opts = {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      charCode: 13,
      bubbles: true,
      cancelable: true,
      composed: true
    };

    target.dispatchEvent(new KeyboardEvent('keydown', opts));
    target.dispatchEvent(new KeyboardEvent('keypress', opts));
    target.dispatchEvent(new KeyboardEvent('keyup', opts));
    document.dispatchEvent(new KeyboardEvent('keydown', opts));
    document.dispatchEvent(new KeyboardEvent('keyup', opts));
  }

  function clickContinueFallback() {
    const btn = findContinueButton();
    if (!btn) return false;

    btn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    btn.click();

    return true;
  }

  function submitQuantity(input) {
    input.focus();

    // Some React pages ignore synthetic Enter unless blur/change has settled.
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    input.focus();

    fireEnter(input);

    // Main fix: use the visible yellow Continue button as fallback.
    setTimeout(clickContinueFallback, 80);
    setTimeout(clickContinueFallback, 220);
    setTimeout(clickContinueFallback, 500);
  }

  function run() {
    if (!isQuantityPage()) return;

    const qty = findQuantityValue();
    const input = findQuantityInput();

    if (!qty || !input) return;

    const key = `${location.href}|${qty}|${norm(getPageText()).slice(0, 300)}`;
    const now = Date.now();

    if (key === lastRunKey && now - lastRunAt < 3000) return;

    lastRunKey = key;
    lastRunAt = now;

    input.focus();
    setNativeValue(input, qty);

    setTimeout(() => submitQuantity(input), 120);
  }

  function start() {
    run();

    const fast = setInterval(run, 150);
    setTimeout(() => clearInterval(fast), 6000);

    const observer = new MutationObserver(run);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true
    });

    window.addEventListener('hashchange', () => setTimeout(run, 100), true);
    window.addEventListener('popstate', () => setTimeout(run, 100), true);
    window.addEventListener('focus', () => setTimeout(run, 100), true);

    console.log(`${SCRIPT_NAME} v${VERSION} loaded`);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
