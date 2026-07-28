// ==UserScript==
// @name         v1.3.7 SidelineApp Helper CLEAN TEST
// @namespace    https://github.com/1Sirkkris
// @version      1.3.7
// @description  Clean Sideline helper with remembered panel toggle states.
// @match        https://aft-poirot-website-nrt.nrt.proxy.amazon.com/*
// @require      https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/e409914de9433290527fb93197bae0e0f7edb4c4/scripts/SidelineApp_Helper_CLEAN_TEST.user.js
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SidelineApp_Helper_CLEAN_TEST.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SidelineApp_Helper_CLEAN_TEST.user.js
// @run-at       document-end
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const STORAGE_KEY = 'sidelineClean.panelStates.v1';
  const VALID_KEYS = ['queue', 'scrub', 'lazy', 'qty'];

  function readSavedStates() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return Object.fromEntries(VALID_KEYS.map(key => [key, saved[key] === true]));
    } catch {
      return Object.fromEntries(VALID_KEYS.map(key => [key, false]));
    }
  }

  function currentStates(dock) {
    return Object.fromEntries(VALID_KEYS.map(key => {
      const button = dock.querySelector(`button[data-key="${key}"]`);
      return [key, Boolean(button?.classList.contains('sh-on'))];
    }));
  }

  function saveStates(dock) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentStates(dock)));
    } catch {}
  }

  function restoreStates(dock) {
    const saved = readSavedStates();
    for (const key of VALID_KEYS) {
      const button = dock.querySelector(`button[data-key="${key}"]`);
      if (!button) continue;
      const isOn = button.classList.contains('sh-on');
      if (saved[key] !== isOn) button.click();
    }
  }

  function installPersistence() {
    const dock = document.querySelector('#sh-dock');
    if (!dock || VALID_KEYS.some(key => !dock.querySelector(`button[data-key="${key}"]`))) {
      setTimeout(installPersistence, 100);
      return;
    }
    if (dock.dataset.statePersistenceInstalled === 'true') return;
    dock.dataset.statePersistenceInstalled = 'true';

    restoreStates(dock);
    dock.addEventListener('click', event => {
      if (!event.target.closest('button[data-key]')) return;
      setTimeout(() => saveStates(dock), 0);
    });
  }

  installPersistence();
})();