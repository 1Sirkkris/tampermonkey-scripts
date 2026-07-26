// ==UserScript==
// @name         v1.2 Auto-Collapse TT
// @namespace    tampermonkey.net/
// @version      1.2
// @match        t.corp.amazon.com/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Auto_Collapse_TT.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Auto_Collapse_TT.user.js
// ==/UserScript==

(function() {
    'use strict';

    const sectionsToCollapse = ['Ticket synopsis', 'Announcements'];
    const collapsed = new Set();

    function collapseSections() {
        const buttons = document.querySelectorAll('[class*="expand-button"][aria-expanded="true"]');
        buttons.forEach(btn => {
            const text = btn.textContent.trim();
            for (const section of sectionsToCollapse) {
                if (text.includes(section) && !collapsed.has(section)) {
                    btn.click();
                    collapsed.add(section);
                    break;
                }
            }
        });
    }

    function allCollapsed() {
        return sectionsToCollapse.every(s => collapsed.has(s));
    }

    setTimeout(collapseSections, 1500);
    setTimeout(collapseSections, 3000);
    setTimeout(collapseSections, 5000);

    let debounceTimer;
    const observer = new MutationObserver(() => {
        if (allCollapsed()) {
            observer.disconnect();
            return;
        }
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(collapseSections, 300);
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => observer.disconnect(), 15000);
})();