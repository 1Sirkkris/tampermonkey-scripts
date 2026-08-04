// ==UserScript==
// @name         v5.4.3 TEST Stow Andons Helper — Safe Trim
// @namespace    Violentmonkey Scripts
// @include      /^https?:\/\/.*fcresearch.*\//
// @include      /^https?:\/\/qifcr\.fe\.aftx\.amazonoperations\.app\//
// @grant        GM_xmlhttpRequest
// @connect      aft-fud-reports.iad.amazon.com
// @connect      aft-moveapp-nrt-nrt.nrt.proxy.amazon.com
// @connect      fcresearch-fe.aka.amazon.com
// @connect      localhost
// @version      5.4.3-test
// @description  Safe v5.3 core trim with a P1 OBIOL move button.
// @run-at       document-idle
// @require      https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/23e5c344194478e84c2bb8bfa6b5ecfed215946d/scripts/Stow_Andons_Helper.user.js
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Stow_Andons_Helper_v5.4_TEST.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Stow_Andons_Helper_v5.4_TEST.user.js
// ==/UserScript==

(function () {
  'use strict';

  // The original v5.3 code remains the source of truth for:
  // floor selection, existing destination mapping, printing,
  // hover preview, suspicious dimensions, FUD colours and search refocus.

  const MOVE_ENDPOINT = 'https://aft-moveapp-nrt-nrt.nrt.proxy.amazon.com/api/move-container';
  const OBIOL_DESTINATION = 'dz-P-OBIOL';

  const UNUSED_STORAGE_KEYS = [
    'vm_fc_drop_moves_v1',
    'vm_fc_sos_report_v1',
    'vm_fc_root_causes_v1',
    'vm_fc_tote_adj_v1'
  ];

  function getContainerId() {
    try {
      return new URL(location.href).searchParams.get('s') || null;
    } catch {
      return null;
    }
  }

  function refocusTopSearchInput(delay) {
    setTimeout(() => {
      const inputs = [...document.querySelectorAll('input[type="search"], input[type="text"], input:not([type])')];
      const input = inputs.find(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && !el.disabled;
      });
      input?.focus();
    }, delay);
  }

  function flashButton(button, message, failed = false) {
    const original = 'OBIOL';
    button.textContent = message;
    button.disabled = false;
    button.dataset.busy = 'false';
    button.style.setProperty('outline', failed ? '2px solid #dc2626' : '2px solid #16a34a', 'important');

    setTimeout(() => {
      if (!button.isConnected) return;
      button.textContent = original;
      button.style.removeProperty('outline');
    }, 1800);
  }

  function toHex(value) {
    return Array.from(new TextEncoder().encode(String(value)))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  function printObiolIfEnabled() {
    const printToggle = document.getElementById('vm-set-print');
    if (!printToggle?.checked) return Promise.resolve();

    const parsedQty = parseInt(document.getElementById('vm-set-qty')?.value || '2', 10);
    const quantity = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1;
    const hex = toHex(OBIOL_DESTINATION);
    const url = new URL('http://localhost:5965/printer');

    url.searchParams.set('action', 'print');
    url.searchParams.set('type', 'barcode');
    url.searchParams.set('data', hex);
    url.searchParams.set('text', hex);
    url.searchParams.set('quantity', String(quantity));
    url.searchParams.set('desc', '');
    url.searchParams.set('seq', String(Math.floor(Math.random() * 9e9) + 1e9));

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: url.toString(),
        timeout: 15000,
        onload: response => response.status < 300
          ? resolve()
          : reject(new Error(`HTTP ${response.status}`)),
        onerror: () => reject(new Error('Network')),
        ontimeout: () => reject(new Error('Timeout'))
      });
    });
  }

  function moveToObiol(button) {
    if (button.dataset.busy === 'true') return;

    const containerId = getContainerId();
    if (!containerId) {
      flashButton(button, 'No tote', true);
      return;
    }

    button.dataset.busy = 'true';
    button.disabled = true;
    button.textContent = 'Moving…';

    GM_xmlhttpRequest({
      method: 'POST',
      url: MOVE_ENDPOINT,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({
        sourceScannableId: null,
        destinationScannableId: OBIOL_DESTINATION,
        containerScannableId: containerId,
        confirmed: 'true'
      }),
      onload: response => {
        if (response.status < 300) {
          flashButton(button, 'Moved ✓');
          printObiolIfEnabled().catch(() => flashButton(button, 'Print failed', true));
        } else {
          flashButton(button, `Failed ${response.status}`, true);
        }
        refocusTopSearchInput(80);
        refocusTopSearchInput(400);
      },
      onerror: () => {
        flashButton(button, 'Move failed', true);
        refocusTopSearchInput(80);
        refocusTopSearchInput(400);
      },
      ontimeout: () => {
        flashButton(button, 'Timed out', true);
        refocusTopSearchInput(80);
        refocusTopSearchInput(400);
      }
    });
  }

  function ensureObiolButton() {
    const buttonWrap = document.getElementById('vm-drop-buttons-wrap');
    const p1Active = !!document.querySelector('.vm-floor-btn.active[data-floor="P1"]');
    const existing = document.getElementById('vm-p1-obiol');

    if (!buttonWrap || !p1Active) {
      existing?.remove();
      return;
    }

    if (existing) return;

    const button = document.createElement('button');
    button.id = 'vm-p1-obiol';
    button.className = 'vm-tag-btn';
    button.type = 'button';
    button.dataset.drop = 'P1-OBIOL';
    button.dataset.busy = 'false';
    button.title = OBIOL_DESTINATION;
    button.textContent = 'OBIOL';

    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      moveToObiol(button);
    });

    const primeButton = buttonWrap.querySelector('.vm-tag-btn[data-drop="Prime"]');
    buttonWrap.insertBefore(button, primeButton || null);
  }

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

    ensureObiolButton();

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
    ensureObiolButton();
    for (const key of UNUSED_STORAGE_KEYS) {
      try { localStorage.removeItem(key); } catch {}
    }
  }, 1000);
})();
