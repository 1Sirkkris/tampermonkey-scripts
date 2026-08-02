// ==UserScript==
// @name         v5.4.2 TEST Stow Andons Helper — Safe Trim
// @namespace    Violentmonkey Scripts
// @include      /^https?:\/\/.*fcresearch.*\//
// @include      /^https?:\/\/qifcr\.fe\.aftx\.amazonoperations\.app\//
// @grant        GM_xmlhttpRequest
// @connect      aft-fud-reports.iad.amazon.com
// @connect      aft-moveapp-nrt-nrt.nrt.proxy.amazon.com
// @connect      fcresearch-fe.aka.amazon.com
// @connect      localhost
// @version      5.4.2-test
// @description  Safe test using the exact working v5.3 core, with unwanted tracker/report controls disabled.
// @run-at       document-idle
// @require      https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/23e5c344194478e84c2bb8bfa6b5ecfed215946d/scripts/Stow_Andons_Helper.user.js
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Stow_Andons_Helper_v5.4_TEST.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Stow_Andons_Helper_v5.4_TEST.user.js
// ==/UserScript==

(function () {
  'use strict';

  // The original v5.3 code remains the source of truth for:
  // floor selection, destination mapping, move request, printing,
  // hover preview, suspicious dimensions, FUD colours and search refocus.

  const UNUSED_STORAGE_KEYS = [
    'vm_fc_drop_moves_v1',
    'vm_fc_sos_report_v1',
    'vm_fc_root_causes_v1',
    'vm_fc_tote_adj_v1'
  ];

  function applySafeTrim() {
    // Keep the settings gear. Hide only the unwanted feature launch buttons.
    document.querySelectorAll('#vm-fab-dz, #vm-fab-sos, #vm-fab-rc').forEach(button => {
      button.style.setProperty('display', 'none', 'important');
    });

    // Leave the hidden panel DOM in place because v5.3's proven move callback
    // still updates it internally. This avoids touching the working move flow.
    document.querySelectorAll('#vm-dz-pop, #vm-sos-pop, #vm-rc-pop').forEach(panel => {
      panel.classList.add('hidden');
      panel.style.setProperty('display', 'none', 'important');
    });

    // Root-cause-only dialogs are not needed in this test.
    document.querySelectorAll('#vm-dmg-overlay, #vm-haz-overlay, #vm-gen-overlay, #vm-edit-overlay').forEach(modal => {
      modal.classList.add('hidden');
      modal.style.setProperty('display', 'none', 'important');
    });

    // Do not retain tracker/report data while this trimmed test is active.
    for (const key of UNUSED_STORAGE_KEYS) {
      try { localStorage.removeItem(key); } catch {}
    }
  }

  const style = document.createElement('style');
  style.id = 'vm-safe-trim-css';
  style.textContent = `
    #vm-fab-dz,
    #vm-fab-sos,
    #vm-fab-rc,
    #vm-dz-pop,
    #vm-sos-pop,
    #vm-rc-pop,
    #vm-dmg-overlay,
    #vm-haz-overlay,
    #vm-gen-overlay,
    #vm-edit-overlay {
      display: none !important;
    }
  `;
  document.head.appendChild(style);

  applySafeTrim();

  new MutationObserver(applySafeTrim).observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // v5.3 can write tracker values after a successful move. Clear only those
  // unused keys; all floor, print and hover settings remain untouched.
  setInterval(() => {
    for (const key of UNUSED_STORAGE_KEYS) {
      try { localStorage.removeItem(key); } catch {}
    }
  }, 1000);
})();
