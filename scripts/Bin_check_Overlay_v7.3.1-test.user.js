// ==UserScript==
// @name         v7.3.1-test Bin check Overlay
// @namespace    https://gist.github.com/1Sirkkris
// @version      7.3.1-test
// @description  v7.3 test build with a compact single-line overlay control bar.
// @author       mojordaq / ChatGPT edit
// @include      /^https?:\/\/.*fcresearch.*\//
// @include      /^https?:\/\/qifcr\.fe\.aftx\.amazonoperations\.app\//
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/bin-overlay-v7-3-test/scripts/Bin_check_Overlay_v7.3.1-test.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/bin-overlay-v7-3-test/scripts/Bin_check_Overlay_v7.3.1-test.user.js
// @require      https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/bin-overlay-v7-3-test/scripts/Bin_check_Overlay_v7.3-test.user.js
// @grant        GM_xmlhttpRequest
// @connect      *
// ==/UserScript==

(() => {
  "use strict";

  const STYLE_ID = "p-level-v731-ui-style";
  const APPLIED_FLAG = "v731Applied";

  injectCompactStyles();
  tidyOverlayControls();

  const observer = new MutationObserver(tidyOverlayControls);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  function injectCompactStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #pLevelOverlayControls {
        display: flex !important;
        flex-wrap: nowrap !important;
        align-items: center !important;
        gap: 4px !important;
        white-space: nowrap !important;
        overflow-x: auto !important;
        padding-bottom: 2px !important;
        scrollbar-width: thin;
      }

      #pLevelOverlayControls button {
        flex: 0 0 auto !important;
        padding: 4px 7px !important;
      }

      #pLevelOverlayControls button.active {
        outline: none !important;
        box-shadow: inset 0 0 0 2px #111827 !important;
      }

      #pLevelOverlayControls .p-level-divider {
        width: 1px;
        height: 22px;
        margin: 0 2px;
        flex: 0 0 1px;
        background: #cbd5e1;
      }
    `;

    document.head.appendChild(style);
  }

  function tidyOverlayControls() {
    const controls = document.getElementById("pLevelOverlayControls");
    if (!controls || controls.dataset[APPLIED_FLAG] === "true") return;

    const sortLabel = Array.from(controls.children).find(element =>
      element.tagName === "SPAN" && element.textContent.trim() === "Sort:"
    );
    sortLabel?.remove();

    const defaultButton = controls.querySelector('[data-sort="DEFAULT"]');
    if (defaultButton) defaultButton.textContent = "Floor";

    addDividerAfter(controls.querySelector('[data-filter="P1"]'));
    addDividerAfter(controls.querySelector('[data-sort="QTY_ASC"]'));

    const title = document.getElementById("pLevelOverlayTitle");
    if (title) title.textContent = "P-level Overlay Sorter v7.3.1-test";

    controls.dataset[APPLIED_FLAG] = "true";
  }

  function addDividerAfter(element) {
    if (!element || element.nextElementSibling?.classList.contains("p-level-divider")) return;

    const divider = document.createElement("span");
    divider.className = "p-level-divider";
    divider.setAttribute("aria-hidden", "true");
    element.after(divider);
  }
})();
