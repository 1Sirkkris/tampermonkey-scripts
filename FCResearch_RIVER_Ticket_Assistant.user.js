// ==UserScript==
// @name         FCResearch → RIVER Ticket Assistant v0.2.11
// @namespace    bwu2-ticket-assistant
// @version      0.2.11
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/FCResearch_RIVER_Ticket_Assistant.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/FCResearch_RIVER_Ticket_Assistant.js
// @description  Runs the RIVER core and launches it directly from the product-panel PanDash L0 badge.
// @match        *://qi-fcresearch-fe.corp.amazon.com/*
// @match        *://fcresearch-fe.aka.amazon.com/*
// @match        *://qi-fcresearch-jp.corp.amazon.com/*
// @match        *://qifcr.fe.aftx.amazonoperations.app/*
// @match        https://river.amazon.com/*
// @require      https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/FCResearch_RIVER_Ticket_Assistant_core_v0.2.10.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_openInTab
// @run-at       document-idle
// ==/UserScript==

(() => {
    'use strict';

    if (!/fcresearch|qifcr/i.test(location.hostname)) return;

    const launchFromL0 = event => {
        if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;

        const badge = event.target instanceof Element
            ? event.target.closest('[data-section-type="product"] .fc-hazmat.fc-river-l0')
            : null;
        if (!badge) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        const bridge = document.getElementById('bwu2-river-launch-bridge');
        if (!bridge) {
            alert('RIVER launch bridge not ready. Refresh FCResearch once and retry.');
            return;
        }

        badge.setAttribute('aria-busy', 'true');
        bridge.click();
        setTimeout(() => badge.removeAttribute('aria-busy'), 3000);
    };

    document.addEventListener('click', launchFromL0, true);
    document.addEventListener('keydown', launchFromL0, true);
})();
