// ==UserScript==
// @name         v1.0.0 SidelineApp CLEAN Lazy Line Fix
// @namespace    https://github.com/1Sirkkris
// @version      1.0.0
// @description  Prevent duplicate blank lines in CLEAN TEST Lazy barcode textarea.
// @match        https://aft-poirot-website-nrt.nrt.proxy.amazon.com/*
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SidelineApp_CLEAN_Lazy_Line_Fix.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SidelineApp_CLEAN_Lazy_Line_Fix.user.js
// @run-at       document-end
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  if (window.__sidelineCleanLazyLineFix_v100) return;
  window.__sidelineCleanLazyLineFix_v100 = true;

  function getItemsBox() {
    return document.querySelector('#sh-lazy textarea[data-f="items"]');
  }

  document.addEventListener('keydown', (event) => {
    const box = getItemsBox();
    if (!box || event.target !== box || event.key !== 'Enter') return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const cleaned = String(box.value || '').replace(/[\t ]+$/gm, '').replace(/\n{2,}$/g, '\n').replace(/\n*$/, '');
    box.value = cleaned ? `${cleaned}\n` : '';
    box.dispatchEvent(new Event('input', { bubbles: true }));
  }, true);
})();
