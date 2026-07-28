// ==UserScript==
// @name         v1.4.0 SidelineApp Helper CLEAN TEST
// @namespace    https://github.com/1Sirkkris
// @version      1.4.0
// @description  CLEAN TEST v1.3.9 with automatic expiry-date to quantity handoff for Lazy Sideline.
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
  if (window.__sidelineCleanExpiryQty_v140) return;
  window.__sidelineCleanExpiryQty_v140 = true;

  const VERSION = '1.4.0';
  const normalise = value => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

  let checkQueued = false;
  let resumeBusy = false;
  let lastResumeAt = 0;

  function stampVersion() {
    document.querySelectorAll('#sh-queue .sh-title, #sh-scrub .sh-title, #sh-qty .sh-title, #sh-lazy .sh-title')
      .forEach(title => {
        title.textContent = String(title.textContent || '').replace(/v1\.3\.6\b/g, `v${VERSION}`);
      });
  }

  function isQuantityScreen() {
    const exactHeading = [...document.querySelectorAll('h1,h2,h3,h4,label,legend,p,span,div')]
      .some(element => normalise(element.textContent) === 'enter quantity');
    if (exactHeading) return true;

    const pageText = normalise((document.body?.innerText || document.body?.textContent || '').slice(0, 8000));
    return pageText.includes('enter quantity');
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

  function runCheck() {
    checkQueued = false;
    stampVersion();

    if (resumeBusy || Date.now() - lastResumeAt < 750) return;
    const resumeButton = expiryPausedLazy();
    if (!resumeButton) return;

    resumeBusy = true;
    lastResumeAt = Date.now();

    // Core paused itself on EXPIRY. Clicking its Pause/Resume control restores
    // the existing queued item and stage; the next Lazy ticks detect QTY and
    // enter the queued quantity normally.
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

  const observer = new MutationObserver(scheduleCheck);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['hidden', 'style', 'class', 'aria-hidden', 'disabled']
  });

  setInterval(scheduleCheck, 750);
  window.addEventListener('pageshow', scheduleCheck, true);
  scheduleCheck();
})();
