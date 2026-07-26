// ==UserScript==
// @name         v4.0.12 Edit Sku/Container detector
// @namespace    Violentmonkey Scripts
// @version      4.0.12
// @description  Auto-detects EditItems Mode: Each/Sku. Mode: Each loads Pending Quick Flip; Mode: Sku loads EditItems Loop MultiFlip. FCResearch Context Bridge removed.
// @match        https://aft-qt-*.aka.*.corp.amazon.com/*
// @match        https://aft-qt-*.corp.amazon.com/*
// @match        http://aft-qt-*.aka.*.corp.amazon.com/app/edititems*
// @match        https://aft-qt-*.aka.*.corp.amazon.com/app/edititems*
// @match        http://aft-qt-*.corp.amazon.com/app/edititems*
// @match        https://aft-qt-*.corp.amazon.com/app/edititems*
// @match        http://aft-qt-jp.aka.nrt.corp.amazon.com/app/edititems*
// @match        https://aft-qt-jp.aka.nrt.corp.amazon.com/app/edititems*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Edit_Sku_Container_detector.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Edit_Sku_Container_detector.user.js
// ==/UserScript==


// v4.0.12: Auto mode detector. Mode: Each = Pending Quick Flip. Mode: Sku = EditItems Loop. FCResearch bridge removed.
function waitForEnabledButtonByTextFast(text, root = document, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const norm = s => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
    const target = norm(text);
    const find = () => {
      const btns = Array.from(root.querySelectorAll('button, input[type="button"], input[type="submit"]'));
      for (const b of btns) {
        const label = (b.tagName === "INPUT") ? (b.value || "") : (b.textContent || "");
        if (norm(label).includes(target)) {
          const disabled = b.disabled || b.getAttribute("aria-disabled") === "true";
          if (!disabled) return b;
        }
      }
      return null;
    };

    const already = find();
    if (already) return resolve(already);

    let done = false;
    const finish = (err, btn) => {
      if (done) return;
      done = true;
      try { obs.disconnect(); } catch {}
      try { clearTimeout(to); } catch {}
      if (err) reject(err); else resolve(btn);
    };

    const obs = new MutationObserver(() => {
      const b = find();
      if (b) finish(null, b);
    });

    obs.observe(root.documentElement || root, { subtree: true, childList: true, attributes: true, attributeFilter: ["disabled", "aria-disabled", "class"] });

    const to = setTimeout(() => finish(new Error("Timeout waiting for enabled button: " + text)), timeoutMs);
  });
}

async function clickEnabledButtonByTextFast(text, timeoutMs = 8000) {
  const b = await waitForEnabledButtonByTextFast(text, document, timeoutMs);
  b.scrollIntoView?.({ block: "center", inline: "center" });
  b.click();
  return true;
}
(() => {
  'use strict';

  /******************************************************************
   * STORAGE (GM_* preferred, localStorage fallback)
   ******************************************************************/
  const KEY = 'MEGA_EDITITEMS_SUITE_v402';
  function gmGet(k, d) {
    try {
      if (typeof GM_getValue === 'function') return GM_getValue(k, d);
    } catch(_) {}
    try {
      const raw = localStorage.getItem(KEY + ':' + k);
      return raw == null ? d : JSON.parse(raw);
    } catch(_) {
      return d;
    }
  }
  function gmSet(k, v) {
    try {
      if (typeof GM_setValue === 'function') return GM_setValue(k, v);
    } catch(_) {}
    try {
      localStorage.setItem(KEY + ':' + k, JSON.stringify(v));
    } catch(_) {}
  }

  const DEFAULTS = {
    autoMode: true,
  };

  function getCfg() {
    const c = gmGet('cfg', null);
    return Object.assign({}, DEFAULTS, c || {});
  }
  function setCfg(next) {
    gmSet('cfg', next);
  }

  /******************************************************************
   * UI
   ******************************************************************/
  function addStyle(css) {
    try { if (typeof GM_addStyle === 'function') return GM_addStyle(css); } catch(_) {}
    const s = document.createElement('style');
    s.textContent = css;
    document.documentElement.appendChild(s);
  }

  addStyle(`
    #megaSuiteBtn {
      position: fixed; right: 12px; bottom: 12px; z-index: 2147483647;
      background: #111; color: #fff; border-radius: 999px; padding: 8px 12px;
      font: 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      cursor: pointer; user-select: none; box-shadow: 0 6px 18px rgba(0,0,0,.35);
    }
    #megaSuitePanel {
      position: fixed; right: 12px; bottom: 52px; width: 320px; z-index: 2147483647;
      background: #fff; color: #111; border-radius: 12px; padding: 12px;
      font: 13px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      box-shadow: 0 10px 28px rgba(0,0,0,.35);
      border: 1px solid rgba(0,0,0,.12);
      display: none;
    }
    #megaSuitePanel h3 { margin: 0 0 8px; font-size: 14px; }
    #megaSuitePanel .row { display:flex; align-items:center; justify-content:space-between; padding: 6px 0; }
    #megaSuitePanel .hint { font-size: 12px; opacity: .75; margin-top: 8px; }
    #megaSuitePanel button {
      margin-top: 10px; width: 100%; border: 0; padding: 8px 10px; border-radius: 10px;
      background: #111; color:#fff; cursor:pointer;
    }
    #megaSuiteBanner {
      position: fixed; left: 12px; bottom: 12px; z-index: 2147483647;
      background: rgba(17,17,17,.95); color:#fff; padding: 8px 10px; border-radius: 10px;
      font: 12px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      display:none; max-width: 60vw;
    }
  `);

  function ensureUI() {
    if (document.getElementById('megaSuiteBtn')) return;

    const btn = document.createElement('div');
    btn.id = 'megaSuiteBtn';
    btn.textContent = '⚙ Mega';
    document.documentElement.appendChild(btn);

    const panel = document.createElement('div');
    panel.id = 'megaSuitePanel';
    panel.innerHTML = `
      <h3>Mega Suite Auto Mode</h3>
      <div class="row"><b>Detected:</b> <span id="mega_detected_mode">Detecting…</span></div>
      <div class="hint">Mode: Each → Pending Quick Flip. Mode: Sku → EditItems Loop MultiFlip.</div>
      <div class="hint">FCResearch Context Bridge removed.</div>
    `;
    document.documentElement.appendChild(panel);

    const banner = document.createElement('div');
    banner.id = 'megaSuiteBanner';
    document.documentElement.appendChild(banner);

    function showBanner(msg, ms=3500) {
      banner.textContent = msg;
      banner.style.display = 'block';
      clearTimeout(showBanner._t);
      showBanner._t = setTimeout(() => banner.style.display='none', ms);
    }

    function togglePanel() {
      panel.style.display = (panel.style.display === 'none' ? 'block' : 'none');
      if (panel.style.display === 'block') syncUI();
    }

    function syncUI() {
      const mode = detectEditItemsMode();
      const el = panel.querySelector('#mega_detected_mode');
      if (el) {
        if (mode === 'each') el.textContent = 'Mode: Each → Pending Quick Flip';
        else if (mode === 'sku') el.textContent = 'Mode: Sku → EditItems Loop MultiFlip';
        else el.textContent = 'Detecting…';
      }
    }

    btn.addEventListener('click', togglePanel, true);
    window.addEventListener('keydown', (e) => {
      if (e.altKey && e.shiftKey && (e.key === 'M' || e.key === 'm')) {
        e.preventDefault();
        togglePanel();
      }
    }, true);

    // expose for internal notices
    window.__MEGA_showBanner = showBanner;
  }

  // Keep UI light at document-start; attach once DOM exists
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureUI, { once: true });
  } else {
    ensureUI();
  }

  /******************************************************************
   * MODULE RUNNER (run only on matching pages)
   ******************************************************************/
  function isEditItems() {
    return /\/app\/edititems/i.test(location.pathname);
  }
  function detectEditItemsMode() {
    const txt = String(document.body?.innerText || document.documentElement?.innerText || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ');

    if (/\bMode\s*:\s*Each\b/i.test(txt)) return 'each';
    if (/\bMode\s*:\s*Sku\b/i.test(txt)) return 'sku';
    return null;
  }

  function updateMegaModeUI(mode) {
    const el = document.querySelector('#mega_detected_mode');
    if (!el) return;
    if (mode === 'each') el.textContent = 'Mode: Each → Pending Quick Flip';
    else if (mode === 'sku') el.textContent = 'Mode: Sku → EditItems Loop MultiFlip';
    else el.textContent = 'Detecting…';
  }

  let __megaBootedMode = '';
  let __megaModeRetryCount = 0;

  function runModules() {
    if (!isEditItems()) return;

    const mode = detectEditItemsMode();
    updateMegaModeUI(mode);

    if (!mode) {
      if (__megaModeRetryCount++ < 80) {
        setTimeout(runModules, 250);
      } else {
        try { window.__MEGA_showBanner?.('Mega Suite: could not detect Mode: Each/Sku. No module started.'); } catch(_) {}
      }
      return;
    }

    if (__megaBootedMode) return;
    __megaBootedMode = mode;

    try {
      window.__MEGA_showBanner?.(mode === 'each'
        ? 'Mega Suite: Mode Each detected — Pending Quick Flip active.'
        : 'Mega Suite: Mode Sku detected — EditItems Loop active.');
    } catch(_) {}

    // 1) Pending Quick Flip
    if (mode === 'each' && isEditItems()) {
      try {
        // If FCResearch context module includes any pending logic, disable it.
        window.__MEGA_DISABLE_CTX_PENDING = true;
        (function() {

            'use strict';

            if (window.__QF_V2914) return;
            window.__QF_V2914 = true;

            /*********************************************************************
             * ABORT / CLEAR QUEUE (instant stop + reset)
             *********************************************************************/
            const ABORT = { token: 0 };
            const bumpAbort = () => { ABORT.token += 1; };

            const STATE_KEY = "quickflip_state";
            const DISP_KEY  = "quickflip_disposition";

            const QF_ACTIVE_KEY = "qf_active";
            const QF_TOTAL_KEY  = "qf_total";
            const QF_DONE_KEY   = "qf_done";
            const QF_TOTE_KEY   = "qf_current_tote";

            const QUEUE_KEY = "flip_units_queue";
            const PHASE_KEY = "flip_units_phase";

            function clearQueueNow(reason = 'manual') {
              bumpAbort();

              // queue + phases
              localStorage.removeItem(QUEUE_KEY);
              localStorage.removeItem(PHASE_KEY);

              // multi progress
              localStorage.removeItem(QF_ACTIVE_KEY);
              localStorage.removeItem(QF_TOTAL_KEY);
              localStorage.removeItem(QF_DONE_KEY);
              localStorage.removeItem(QF_TOTE_KEY);

              // remove any UI tracker
              const t = document.getElementById("qf-persistent-tracker");
              if (t) t.remove();

              // lightweight UI feedback (works even if main UI isn't injected yet)
              const btn = document.getElementById('qf-clearqueue-float') || document.getElementById('qf-clearqueue-inmenu');
              if (btn) {
                btn.textContent = 'QUEUE CLEARED';
                btn.setAttribute('data-qf-cleared', '1');
                setTimeout(() => {
                  if (btn.getAttribute('data-qf-cleared') === '1') btn.textContent = 'CLEAR QUEUE';
                  btn.removeAttribute('data-qf-cleared');
                }, 900);
              }

              console.warn('[QuickFlip] CLEAR QUEUE:', reason);
            }

            /*********************************************************************
             * ALWAYS-ACCESSIBLE BUTTON
             * - shows immediately at document-start
             * - when the context menu UI exists, merges into it and the floating
             *   button is removed (so it feels like "part of the box").
             *********************************************************************/
            function ensureFloatingClearQueue() {
              if (document.getElementById('qf-clearqueue-float')) return;

              const b = document.createElement('button');
              b.id = 'qf-clearqueue-float';
              b.type = 'button';
              b.textContent = 'CLEAR QUEUE';
              b.title = 'Stops immediately + clears saved queue/progress (Ctrl+Alt+Q)';

              b.style.cssText = `
                position: fixed;
                right: 12px;
                bottom: 12px;
                z-index: 2147483647;
                padding: 10px 12px;
                border-radius: 12px;
                border: 2px solid #c9302c;
                background: rgba(217,83,79,0.18);
                color: #fff;
                font-weight: 900;
                letter-spacing: 0.3px;
                font: 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
                box-shadow: 0 10px 28px rgba(0,0,0,0.45);
                cursor: pointer;
                user-select: none;
                pointer-events: auto;
              `;

              b.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                clearQueueNow('floating button');
              }, true);

              (document.body || document.documentElement).appendChild(b);
            }

            function removeFloatingClearQueue() {
              const b = document.getElementById('qf-clearqueue-float');
              if (b) b.remove();
            }

            function ensureMenuClearQueue(container) {
              if (!container) return null;
              if (container.querySelector('#qf-clearqueue-inmenu')) return container.querySelector('#qf-clearqueue-inmenu');

              const b = document.createElement('button');
              b.id = 'qf-clearqueue-inmenu';
              b.type = 'button';
              b.textContent = 'CLEAR QUEUE';
              b.title = 'Stops immediately + clears saved queue/progress (Ctrl+Alt+Q)';

              // Match the existing style language (PRIMARY_COLOR area) but red for danger.
              Object.assign(b.style, {
                padding: '6px 10px',
                borderRadius: '8px',
                border: '2px solid #c9302c',
                background: '#d9534f',
                color: '#ffffff',
                cursor: 'pointer',
                fontWeight: '900',
                letterSpacing: '0.2px',
                marginLeft: 'auto'
              });
              b.onmouseover = () => { b.style.background = '#c9302c'; };
              b.onmouseout  = () => { b.style.background = '#d9534f'; };

              b.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                clearQueueNow('menu button');
              }, true);

              container.appendChild(b);
              return b;
            }

            function tryMergeClearQueueIntoMenu() {
              // "existing script based context menu" here = the #context area + our injected HUD bar, if present.
              const wrap = document.querySelector('#context')?.parentElement;
              if (!wrap) return false;

              // Preferred: merge into our Smart Auto Timer HUD row if present.
              const hud = wrap.querySelector('div[style*="Smart Auto Timer"]') // unlikely exact
                       || wrap.querySelector('div'); // fallback: find first div we inserted

              // Better targeting: the HUD we create has a distinctive background.
              const hudRow = wrap.querySelector('div[style*="background: #e9f6ff"]');

              const target = hudRow || hud;
              if (!target) return false;

              ensureMenuClearQueue(target);
              removeFloatingClearQueue();
              return true;
            }

            // Keep the clear button accessible, and merge it into menu when possible.
            let __mergeTick = 0;
            const mergeObserver = new MutationObserver(() => {
              const t = ++__mergeTick;
              requestAnimationFrame(() => {
                if (t !== __mergeTick) return;
                ensureFloatingClearQueue();
                tryMergeClearQueueIntoMenu();
              });
            });

            function startClearQueueUI() {
              ensureFloatingClearQueue();
              tryMergeClearQueueIntoMenu();
              try {
                mergeObserver.observe(document.documentElement, { childList: true, subtree: true });
              } catch {}
            }

            /*********************************************************************
             * ABORTABLE WAIT HELPERS (makes CLEAR QUEUE actually stop mid-wait)
             *********************************************************************/
            const sleep = async (ms) => {
              const tok = ABORT.token;
              const end = performance.now() + ms;
              while (performance.now() < end) {
                if (ABORT.token !== tok) return false;
                await new Promise(r => setTimeout(r, Math.min(50, end - performance.now())));
              }
              return ABORT.token === tok;
            };

            /*********** SMART / TURBO TIMING ***********/
            const DEFAULT_DELAY_SAFE = 450;
            const DEFAULT_DELAY_AGGR = 280;

            const MIN_DELAY_SAFE = 60;
            const MIN_DELAY_AGGR = 20;

            const MAX_DELAY = 1200;

            const EMA_ALPHA = 0.35;

            // 🔥 SPEED TUNES (main impact on menu nav)
            const BASE_MARGIN_MS = 55;          // was 90
            const BASE_MARGIN_MS_AGGR = 20;     // was 50
            const BLEND = 0.50;                 // was 0.35 (converges faster)
            const JITTER = 8;                   // was 10 (slightly tighter)
            const BACKOFF_MS = 120;

            // 🔥 Speculation tune
            const SPECULATE_MS = 35;            // was 70
            const FIND_POLL_MS = 28;            // was 40

            const FAST_SUCCESS_THRESHOLD = 300;
            const FAST_STREAK_TO_AUTO_AGGR = 5;

            const LS_DELAY_KEY = 'quickflip_step_delay_ms';
            const METRICS_KEY  = 'quickflip_metrics_v1';
            const MODE_KEY     = 'quickflip_aggressive_mode';
            const STREAK_KEY   = 'quickflip_fast_streak';

            const jittered = (ms) => Math.max(0, ms + (Math.random() * 2 * JITTER - JITTER));

            const isAggressive = () => localStorage.getItem(MODE_KEY) === '1';
            const setAggressive = (on) => localStorage.setItem(MODE_KEY, on ? '1' : '0');

            const getDelay = () => {
              const v = Number(localStorage.getItem(LS_DELAY_KEY));
              if (Number.isFinite(v)) return v;
              return isAggressive() ? DEFAULT_DELAY_AGGR : DEFAULT_DELAY_SAFE;
            };
            const setDelay = (ms) => {
              const min = isAggressive() ? MIN_DELAY_AGGR : MIN_DELAY_SAFE;
              const clamped = Math.max(min, Math.min(MAX_DELAY, Math.round(ms)));
              localStorage.setItem(LS_DELAY_KEY, String(clamped));
              return clamped;
            };

            const readMetrics = () => { try { return JSON.parse(localStorage.getItem(METRICS_KEY) || "{}"); } catch { return {}; } };
            const writeMetrics = (m) => localStorage.setItem(METRICS_KEY, JSON.stringify(m));

            const getStreak = () => Number(localStorage.getItem(STREAK_KEY)) || 0;
            const setStreak = (n) => localStorage.setItem(STREAK_KEY, String(Math.max(0, n)));

            function recordWait(step, ms) {
              const m = readMetrics();
              const prev = Number(m[step]);
              const ewma = Number.isFinite(prev) ? (EMA_ALPHA * ms + (1 - EMA_ALPHA) * prev) : ms;
              m[step] = Math.round(Math.max(1, ewma));
              writeMetrics(m);

              const margin = isAggressive() ? BASE_MARGIN_MS_AGGR : BASE_MARGIN_MS;
              const current = getDelay();
              const target = Math.min(MAX_DELAY, Math.max(isAggressive() ? MIN_DELAY_AGGR : MIN_DELAY_SAFE, m[step] + margin));
              const next = BLEND * target + (1 - BLEND) * current;
              setDelay(next);

              if (ms <= FAST_SUCCESS_THRESHOLD) {
                const ns = getStreak() + 1;
                setStreak(ns);
                if (ns >= FAST_STREAK_TO_AUTO_AGGR && !isAggressive()) {
                  setAggressive(true);
                  setDelay(Math.min(getDelay(), DEFAULT_DELAY_AGGR));
                  updateHudBadge?.();
                }
              } else {
                const ns = ms > 1500 ? 0 : Math.max(0, getStreak() - 1);
                setStreak(ns);
              }
            }

            function backoffDelay() {
              setStreak(0);
              setDelay(getDelay() + BACKOFF_MS);
            }

            /*********** CONSTANTS ***********/
            const PRIMARY_COLOR = '#002e36';
            const HOVER_COLOR   = '#00434f';
            const TEXT_COLOR    = '#ffffff';

            const STATE_OPTIONS = [
              {label:"Sellable",         value:"SELLABLE"},
              {label:"Unsellable",       value:"UNSELLABLE"},
              {label:"Pending Research", value:"PENDING_RESEARCH"},
            ];
            const DISP_OPTIONS = [
              {label:"Amazon Damage",      value:"AMAZON_DAMAGE"},
              {label:"Defective",          value:"DEFECTIVE"},
              {label:"Distributor Damage", value:"DISTRIBUTOR_DAMAGE"},
              {label:"Expired",            value:"EXPIRED"},
            ];

            const getDefaultState = () => localStorage.getItem(STATE_KEY) || "UNSELLABLE";
            const getDefaultDisp  = () => localStorage.getItem(DISP_KEY)  || "AMAZON_DAMAGE";

            /*********** LOOK-AHEAD SENSING ***********/
            let lastUrl = location.href;
            let spinnerVisible = false;

            const spinnerObserver = new MutationObserver(() => {
              spinnerVisible = !!document.querySelector('.a-spinner, .loadingSpinner, .busy, [aria-busy="true"]');
            });

            function startSensing() {
              spinnerObserver.observe(document.documentElement, { childList: true, subtree: true });
              setInterval(() => {
                if (location.href !== lastUrl) {
                  lastUrl = location.href;
                  setStreak(Math.floor(getStreak() / 2));
                }
              }, 200);
            }

            /*********** DOM HELPERS ***********/
            async function waitForElement(selector, timeout = 12000, step = 'wait') {
              const tok = ABORT.token;
              const t0 = performance.now();
              let el = document.querySelector(selector);
              if (el) { recordWait(step, performance.now() - t0); return el; }

              return await new Promise((resolve, reject) => {
                let done = false;

                const finish = (node) => {
                  if (done) return;
                  done = true;
                  const ms = performance.now() - t0;
                  recordWait(step, ms);
                  obs.disconnect();
                  resolve(node);
                };

                const obs = new MutationObserver(() => {
                  if (ABORT.token !== tok) { if (!done) { done = true; obs.disconnect(); reject("Aborted"); } return; }
                  el = document.querySelector(selector);
                  if (el) finish(el);
                });
                obs.observe(document.documentElement, { childList: true, subtree: true });

                const id = setTimeout(() => {
                  if (!done) { done = true; obs.disconnect(); backoffDelay(); reject("Timeout " + selector); }
                }, timeout);

                (function poll() {
                  if (done) return;
                  if (ABORT.token !== tok) { clearTimeout(id); done = true; obs.disconnect(); reject("Aborted"); return; }
                  el = document.querySelector(selector);
                  if (el) { clearTimeout(id); finish(el); return; }
                  requestAnimationFrame(poll);
                })();
              });
            }

            // 🔥 Leaner click scan: fewer nodes, less regex work per poll
            async function clickPrimaryByText(labels, timeout = 12000, step = 'click') {
              const tok = ABORT.token;
              const t0 = performance.now();
              const re = labels.map(l => new RegExp(l, 'i'));

              const findNode = () => {
                const btns = document.querySelectorAll('button, input.a-button-input[type="submit"], input[type="submit"], a.a-button-text');
                for (const n of btns) {
                  const t = (n.textContent || n.value || "").trim();
                  if (!t) continue;
                  if (/edit\s*quantity/i.test(t)) continue;
                  let ok = false;
                  for (const r of re) { if (r.test(t)) { ok = true; break; } }
                  if (!ok) continue;
                  return n;
                }

                const spans = document.querySelectorAll("span.a-button,span.a-declarative,div.a-button");
                for (const n of spans) {
                  const t = (n.textContent || "").trim();
                  if (!t) continue;
                  if (/edit\s*quantity/i.test(t)) continue;
                  let ok = false;
                  for (const r of re) { if (r.test(t)) { ok = true; break; } }
                  if (!ok) continue;
                  const i = n.querySelector?.('input.a-button-input[type="submit"]');
                  return i || n;
                }
                return null;
              };

              let n = findNode();
              if (n && !spinnerVisible && ABORT.token === tok) {
                n.click();
                recordWait(step, performance.now() - t0);
                return;
              }

              await sleep(jittered(Math.min(SPECULATE_MS, getDelay())));
              if (ABORT.token !== tok) return;
              n = findNode();
              if (n && !spinnerVisible && ABORT.token === tok) {
                n.click();
                recordWait(step, performance.now() - t0);
                return;
              }

              while (performance.now() - t0 < timeout) {
                if (ABORT.token !== tok) return;
                n = findNode();
                if (n && !spinnerVisible) {
                  await sleep(jittered(Math.min(getDelay(), 30)));
                  if (ABORT.token !== tok) return;
                  n.click();
                  recordWait(step, performance.now() - t0);
                  return;
                }
                await sleep(FIND_POLL_MS);
              }
              backoffDelay();
              throw new Error("Btn not found: " + labels);
            }

            async function waitForChangeBtn(timeout = 12000, step = 'change_btn') {
              const tok = ABORT.token;
              const t0 = performance.now();

              const findChange = () => {
                const input = document.querySelector('#a-autoid-1 input.a-button-input[type="submit"]');
                if (input) return input;
                const span = [...document.querySelectorAll("span.a-declarative,span.a-button,button,input[type=submit]")]
                  .find(s => /change\s*container/i.test((s.textContent || s.value || "")));
                return span || null;
              };

              let node = findChange();
              if (node && !spinnerVisible && ABORT.token === tok) { recordWait(step, performance.now() - t0); return node; }

              await sleep(jittered(Math.min(SPECULATE_MS, getDelay())));
              if (ABORT.token !== tok) throw new Error("Aborted");
              node = findChange();
              if (node && !spinnerVisible) { recordWait(step, performance.now() - t0); return node; }

              while (performance.now() - t0 < timeout) {
                if (ABORT.token !== tok) throw new Error("Aborted");
                node = findChange();
                if (node && !spinnerVisible) { recordWait(step, performance.now() - t0); return node; }
                await sleep(FIND_POLL_MS);
              }
              backoffDelay();
              throw new Error("Change container not found");
            }

            /*********** UI ***********/
            let updateHudBadge = null;

            function renderPersistentTracker() {
              if (document.getElementById("qf-persistent-tracker")) return;
              if (localStorage.getItem(QF_ACTIVE_KEY) !== "1") return;

              const bar = document.createElement("div");
              bar.id = "qf-persistent-tracker";
              bar.style.cssText = `
                position: fixed;
                top: 8px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 10000;
                width: fit-content;
                max-width: 80vw;
                margin: 0;
                padding: 10px 20px;
                background: #e9f6ff;
                border: 1px solid #002e36;
                border-radius: 10px;
                font-weight: 700;
                color: #002e36;
                white-space: nowrap;
              `;

              function update() {
                const total = Number(localStorage.getItem(QF_TOTAL_KEY) || 0);
                const done  = Number(localStorage.getItem(QF_DONE_KEY) || 0);
                const tote  = localStorage.getItem(QF_TOTE_KEY) || "";
                if (!total) return;
                bar.textContent = `🔄 Multi Flip Progress: ${done} / ${total}` +
                  (tote ? ` (Current tote: ${tote})` : "");
              }

              update();
              setInterval(update, 350);

              const target = document.body || document.documentElement;
              target.appendChild(bar);
            }

            async function insertUI() {
              const each = document.querySelector('#context dd.a-list-item');
              if (!each || each.textContent.trim() !== "Each") return;
              const root = document.getElementById('context');
              if (!root) return;

              const wrap = document.createElement("div");
              wrap.style.marginBottom = "1em";
              wrap.style.fontFamily = "Arial, sans-serif";

              const hud = document.createElement("div");
              hud.style.cssText = `
                margin: 6px 0 10px 0;
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 12px;
                font-size: 14px;
                font-weight: 700;
                color: ${PRIMARY_COLOR};
                background: #e9f6ff;
                border: 1px solid ${PRIMARY_COLOR};
                border-radius: 10px;
                letter-spacing: 0.2px;
                flex-wrap: wrap;
              `;
              const hudIcon = document.createElement('span'); hudIcon.textContent = '⚡';
              const hudText = document.createElement('span');
              const hudMode = document.createElement('span');
              hudMode.style.cssText = `padding:2px 6px;border-radius:6px;border:1px solid ${PRIMARY_COLOR};background:#fff;`;

              const hudBtn = document.createElement('button');
              hudBtn.textContent = 'Toggle Aggressive';
              Object.assign(hudBtn.style, { padding: '6px 10px', borderRadius: '8px', border: `1px solid ${PRIMARY_COLOR}`, background: '#fff', color: PRIMARY_COLOR, cursor: 'pointer', fontWeight: 700 });
              hudBtn.onmouseover = () => hudBtn.style.background = '#f2fbff';
              hudBtn.onmouseout  = () => hudBtn.style.background = '#fff';
              hudBtn.onclick = () => {
                setAggressive(!isAggressive());
                setDelay(isAggressive() ? Math.min(getDelay(), DEFAULT_DELAY_AGGR) : Math.max(getDelay(), DEFAULT_DELAY_SAFE));
                updateHudBadge();
              };

              updateHudBadge = () => {
                hudText.textContent = `Smart Auto Timer: ${getDelay()} ms`;
                hudMode.textContent = isAggressive() ? 'Mode: Aggressive' : 'Mode: Safe';
                hudMode.style.borderColor = isAggressive() ? '#0b6' : PRIMARY_COLOR;
                hudMode.style.background  = isAggressive() ? '#eafff4' : '#fff';
              };

              setInterval(() => { hudText.textContent = `Smart Auto Timer: ${getDelay()} ms`; }, 350);

              hud.appendChild(hudIcon);
              hud.appendChild(hudText);
              hud.appendChild(hudMode);
              hud.appendChild(hudBtn);

              // ✅ MERGED CLEAR QUEUE (right side of the existing HUD bar)
              ensureMenuClearQueue(hud);

              wrap.appendChild(hud);

              // once merged into menu, remove floating version
              removeFloatingClearQueue();

              function section(title) {
                const box = document.createElement("div");
                const head = document.createElement("div");
                const body = document.createElement("div");
                head.textContent = title + " ▾";
                Object.assign(head.style, {
                  cursor: "pointer", background: PRIMARY_COLOR, color: TEXT_COLOR,
                  padding: ".6em 1em", borderRadius: "6px 6px 0 0", fontWeight: "bold"
                });
                Object.assign(body.style, {
                  border: `1px solid ${PRIMARY_COLOR}`, borderTop: "none", padding: "1em",
                  borderRadius: "0 0 6px 6px", background: "#f9f9f9", maxWidth: "420px", display: "none"
                });
                const open = localStorage.getItem("qfopen_" + title) === "true";
                body.style.display = open ? "block" : "none";
                head.textContent = open ? title + " ▴" : title + " ▾";
                head.onclick = () => {
                  const on = body.style.display === "block";
                  body.style.display = on ? "none" : "block";
                  head.textContent = on ? title + " ▾" : title + " ▴";
                  localStorage.setItem("qfopen_" + title, String(!on));
                };
                box.appendChild(head); box.appendChild(body);
                return { box, body };
              }

              function dropdown(label, opts, val) {
                const d = document.createElement("div"); d.style.margin = "0.4em 0";
                const l = document.createElement("div"); l.textContent = label; l.style.fontWeight = "bold"; l.style.marginBottom = "0.25em";
                const s = document.createElement("select");
                Object.assign(s.style, { width: "100%", padding: "0.5em", border: `1px solid ${PRIMARY_COLOR}`, borderRadius: "4px" });
                for (const o of opts) {
                  const op = document.createElement("option");
                  op.value = o.value; op.textContent = o.label;
                  if (o.value === val) op.selected = true;
                  s.appendChild(op);
                }
                d.appendChild(l); d.appendChild(s);
                return { div: d, sel: s };
              }

              function input(ph) {
                const d = document.createElement("div"); d.style.marginBottom = "0.75em";
                const i = document.createElement("input"); i.type = "text"; i.placeholder = ph;
                Object.assign(i.style, { width: "100%", padding: "0.5em", border: `1px solid ${PRIMARY_COLOR}`, borderRadius: "4px" });
                d.appendChild(i); return { div: d, i };
              }

              const S = section("Quick Flip");
              const sState = dropdown("Inventory State", STATE_OPTIONS, getDefaultState());
              const sDisp  = dropdown("Disposition",     DISP_OPTIONS,  getDefaultDisp());
              const sTote  = input("Enter Tote");
              const sAsin  = input("Enter ASIN/FNSKU");
              const sBtn   = document.createElement("button");
              sBtn.textContent = "Flip Units";
              Object.assign(sBtn.style, { width: "100%", padding: "0.6em", background: PRIMARY_COLOR, color: TEXT_COLOR, borderRadius: "4px", border: "none", cursor: "pointer" });
              sBtn.onmouseover = () => sBtn.style.background = HOVER_COLOR;
              sBtn.onmouseout  = () => sBtn.style.background = PRIMARY_COLOR;
              S.body.appendChild(sState.div);
              S.body.appendChild(sDisp.div);
              S.body.appendChild(sTote.div);
              S.body.appendChild(sAsin.div);
              S.body.appendChild(sBtn);

              const M = section("Multi Quick Flip");
              const mState = dropdown("Inventory State", STATE_OPTIONS, getDefaultState());
              const mDisp  = dropdown("Disposition",     DISP_OPTIONS,  getDefaultDisp());
              const ta = document.createElement("textarea");
              ta.placeholder = 'Paste:\nTOTE ASIN\nor\nTOTE ASIN FNSKU';
              Object.assign(ta.style, { width: "100%", height: "140px", padding: "0.5em", fontFamily: "monospace", border: `1px solid ${PRIMARY_COLOR}`, borderRadius: "4px", marginBottom: "0.75em" });
              const mBtn = document.createElement("button");
              mBtn.textContent = "Start Multi Flip";
              Object.assign(mBtn.style, { width: "100%", padding: "0.6em", background: PRIMARY_COLOR, color: TEXT_COLOR, borderRadius: "4px", border: "none", cursor: "pointer" });
              mBtn.onmouseover = () => mBtn.style.background = HOVER_COLOR;
              mBtn.onmouseout  = () => mBtn.style.background = PRIMARY_COLOR;
              M.body.appendChild(mState.div);
              M.body.appendChild(mDisp.div);
              M.body.appendChild(ta);
              M.body.appendChild(mBtn);

              // (Existing in-section Clear Queue removed — we now have one global button in the HUD)

              wrap.appendChild(S.box);
              wrap.appendChild(M.box);
              root.parentNode.insertBefore(wrap, root);

              function toggleDisp() {
                sDisp.sel.disabled = sState.sel.value !== "UNSELLABLE";
                mDisp.sel.disabled = mState.sel.value !== "UNSELLABLE";
                sDisp.sel.style.opacity = sDisp.sel.disabled ? ".5" : "1";
                mDisp.sel.style.opacity = mDisp.sel.disabled ? ".5" : "1";
              }

              sState.sel.onchange = () => { localStorage.setItem(STATE_KEY, sState.sel.value); mState.sel.value = sState.sel.value; toggleDisp(); };
              mState.sel.onchange = () => { localStorage.setItem(STATE_KEY, mState.sel.value); sState.sel.value = mState.sel.value; toggleDisp(); };
              sDisp.sel.onchange  = () => { localStorage.setItem(DISP_KEY,  sDisp.sel.value);  mDisp.sel.value  = sDisp.sel.value;  };
              mDisp.sel.onchange  = () => { localStorage.setItem(DISP_KEY,  mDisp.sel.value);  sDisp.sel.value  = mDisp.sel.value;  };
              toggleDisp();

              sBtn.onclick = () => {
                const tote = sTote.i.value.trim(), asin = sAsin.i.value.trim();
                if (!tote || !asin) return alert("Both fields required");
                localStorage.setItem(QUEUE_KEY, JSON.stringify([{ tote, asin, state: sState.sel.value, disp: sDisp.sel.value }]));
                localStorage.setItem(PHASE_KEY, "tote");
                processQueue();
              };

              mBtn.onclick = () => {
                const lines = ta.value.trim().split("\n").map(x => x.trim()).filter(Boolean);
                const jobs = [];
                for (const ln of lines) {
                  const parts = ln.split(/[\t ]+/).filter(Boolean);
                  if (!parts.length) continue;
                  const code = parts[parts.length - 1];
                  const tote = parts.length > 1 ? parts[0] : null;
                  if (!tote || !code) continue;
                  jobs.push({ tote, asin: code, state: mState.sel.value, disp: mDisp.sel.value });
                }
                if (!jobs.length) return alert("No valid TOTE + ASIN/FNSKU rows detected.");
                localStorage.setItem(QUEUE_KEY, JSON.stringify(jobs));
                localStorage.setItem(QF_ACTIVE_KEY, "1");
                localStorage.setItem(QF_TOTAL_KEY, String(jobs.length));
                localStorage.setItem(QF_DONE_KEY, "0");
                localStorage.setItem(QF_TOTE_KEY, jobs[0].tote);
                localStorage.setItem(PHASE_KEY, "tote");
                processQueue();
              };

              updateHudBadge();
            }

            /*********** PROCESS QUEUE ***********/
            async function processQueue() {
              const tok = ABORT.token;

              const raw = localStorage.getItem(QUEUE_KEY);
              if (!raw) return;

              if (ABORT.token !== tok) return;

              const q = JSON.parse(raw);
              if (!q.length) {
                clearQueueNow('queue empty cleanup');
                return;
              }

              const job = q[0];
              const { tote, asin, state, disp } = job;
              const phase = localStorage.getItem(PHASE_KEY);
              const nextTote = q.length > 1 ? q[1].tote : null;

              try {
                if (ABORT.token !== tok) return;

                if (phase === "tote") {
                  const input = await waitForElement('div.a-input-text-wrapper input[type="text"]', 12000, 'tote_input');
                  if (ABORT.token !== tok) return;
                  input.value = tote; input.dispatchEvent(new Event('input', { bubbles: true }));
                  await sleep(jittered(Math.min(getDelay(), 28)));
                  if (ABORT.token !== tok) return;
                  await clickPrimaryByText(['Continue'], 12000, 'tote_continue');
                  localStorage.setItem(PHASE_KEY, "asin");
                  return;
                }

                if (phase === "asin") {
                  const input = await waitForElement('div.a-input-text-wrapper input[type="text"]', 12000, 'asin_input');
                  if (ABORT.token !== tok) return;
                  input.value = asin; input.dispatchEvent(new Event('input', { bubbles: true }));
                  await sleep(jittered(Math.min(getDelay(), 28)));
                  if (ABORT.token !== tok) return;
                  await clickPrimaryByText(['Continue'], 12000, 'asin_continue');
                  localStorage.setItem(PHASE_KEY, "select-item");
                  return;
                }


                if (phase === "select-item") {
                  // On some EditItems flows, after ASIN you must pick which record (disposition/state) to operate on.
                  // If we skip this, later steps will timeout waiting for SELLABLE/UNSELLABLE radios.
                  const isSelectItem = (() => {
                    const h = Array.from(document.querySelectorAll('h1,h2,h3,header,div')).find(el => {
                      const t = (el.textContent || '').trim();
                      return t && /^select item$/i.test(t);
                    });
                    return !!h || /select item/i.test(document.body?.innerText || '');
                  })();

                  // If we are NOT on select-item, just move on.
                  if (!isSelectItem) {
                    localStorage.setItem(PHASE_KEY, "select-state");
                    processQueue();
                    return;
                  }

                  const jobSig = `${tote}||${asin}`;
                  const pickedKey = `qf_picked_variants__${jobSig}`;
                  let picked = [];
                  try { picked = JSON.parse(sessionStorage.getItem(pickedKey) || '[]'); } catch {}

                  const cards = Array.from(document.querySelectorAll('input[type="radio"]'))
                    .map(r => {
                      // card container
                      const card = r.closest('div,li,section,article') || r.parentElement;
                      const txt = (card?.innerText || '').replace(/\s+/g, ' ').trim();
                      // try to extract "Disposition:" or "Inventory State:"
                      let dispNow = null;
                      let m = txt.match(/\bDisposition:\s*([A-Z_]+)/i);
                      if (m) dispNow = m[1].toUpperCase();
                      if (!dispNow) {
                        m = txt.match(/\bInventory\s*State:\s*([A-Z_]+)/i);
                        if (m) dispNow = m[1].toUpperCase();
                      }
                      // quantity
                      let qty = 0;
                      m = txt.match(/\bQuantity:\s*(\d+)/i);
                      if (m) qty = Number(m[1]) || 0;
                      return { r, card, txt, dispNow, qty };
                    })
                    // de-dupe (some pages repeat nested divs)
                    .filter((v, i, arr) => arr.findIndex(x => x.r === v.r) === i);

                  if (!cards.length) {
                    // fallback: maybe already advanced
                    localStorage.setItem(PHASE_KEY, "select-state");
                    processQueue();
                    return;
                  }

                  // Choose the best candidate:
                  // - Prefer not previously picked for this tote+asin
                  // - Prefer qty > 0
                  // - If target is SELLABLE, prefer a non-sellable record (dispNow not "SELLABLE")
                  const target = String(state || '').toUpperCase();
                  const score = (c) => {
                    let s = 0;
                    if (c.qty > 0) s += 10;
                    if (c.dispNow && !picked.includes(c.dispNow)) s += 20;
                    if (!c.dispNow && picked.length) s += 1; // unknown, still maybe ok
                    if (target === 'SELLABLE' && c.dispNow && c.dispNow !== 'SELLABLE') s += 5;
                    return s;
                  };

                  let best = cards.slice().sort((a,b) => score(b) - score(a))[0];
                  if (!best) best = cards[0];

                  try {
                    best.r.click();
                  } catch {}

                  // Record what we picked to reduce re-selecting the same one if we come back.
                  if (best.dispNow) {
                    if (!picked.includes(best.dispNow)) picked.push(best.dispNow);
                    try { sessionStorage.setItem(pickedKey, JSON.stringify(picked)); } catch {}
                  }

                  await sleep(jittered(Math.min(getDelay(), 28)));
                  if (ABORT.token !== tok) return;
                  await clickPrimaryByText(['Continue', 'Next'], 12000, 'select_item_continue');
                  localStorage.setItem(PHASE_KEY, "select-state");
                  return;
                }

                if (phase === "select-state") {
                  let radio = null;

                  if (state === "SELLABLE") {
                    radio = document.querySelector('input[name="options"][value="SELLABLE"]')
                         || document.querySelector('input[type="radio"][value="SELLABLE"]');

                    if (!radio) {
                      const labels = document.querySelectorAll('label');
                      for (const lab of labels) {
                        const txt = (lab.textContent || "").trim();
                        if (!txt) continue;
                        if (!(/sellable/i.test(txt) || /inventory/i.test(txt))) continue;
                        const r = lab.querySelector('input[type="radio"]');
                        if (r) { radio = r; break; }
                      }
                    }

                    if (!radio) {
                      radio = await waitForElement('input[name="options"][value="SELLABLE"], input[type="radio"][value="SELLABLE"]', 12000, 'radio_sellable');
                    }
                  } else if (state === "PENDING_RESEARCH") {
                    radio = await waitForElement('input[name="options"][value="PENDING_RESEARCH"]', 12000, 'radio_pending');
                  } else {
                    radio = await waitForElement('input[name="options"][value="UNSELLABLE"]', 12000, 'radio_unsellable');
                  }

                  if (ABORT.token !== tok) return;

                  radio.click();
                  await sleep(jittered(Math.min(getDelay(), 28)));
                  if (ABORT.token !== tok) return;
                  await clickPrimaryByText(['Continue', 'Next'], 12000, 'state_continue');
                  localStorage.setItem(PHASE_KEY, state === "UNSELLABLE" ? "select-disposition" : "final-continue");
                  return;
                }

                if (phase === "select-disposition") {
                  const radio = await waitForElement(`input[name="options"][value="${disp}"]`, 12000, 'radio_disp');
                  if (ABORT.token !== tok) return;
                  radio.click();
                  await sleep(jittered(Math.min(getDelay(), 28)));
                  if (ABORT.token !== tok) return;
                  await clickPrimaryByText(['Continue', 'Next'], 12000, 'disp_continue');
                  localStorage.setItem(PHASE_KEY, "confirm-unsellable");
                  return;
                }

                if (phase === "confirm-unsellable") {
                  await sleep(jittered(Math.min(getDelay(), 28)));
                  if (ABORT.token !== tok) return;
                  await clickPrimaryByText(['Change Items', 'Change Item'], 12000, 'confirm_citems');
                  localStorage.setItem(PHASE_KEY, "change-container");
                  return;
                }

                if (phase === "final-continue") {
                  await sleep(jittered(Math.min(getDelay(), 28)));
                  if (ABORT.token !== tok) return;
                  await clickPrimaryByText(['Change Items', 'Change Item'], 12000, 'final_citems');
                  localStorage.setItem(PHASE_KEY, "change-container");
                  return;
                }

                if (phase === "change-container") {
                  const same = nextTote && nextTote === tote;

                  if (same) {
                    try {
                      await sleep(jittered(getDelay() * 1.25));
                      if (ABORT.token !== tok) return;
                      const asinField = await waitForElement('div.a-input-text-wrapper input[type="text"]', 5000, 'same_tote_ready');
                      if (ABORT.token !== tok) return;

                      asinField.value = ""; asinField.focus();

                      q.shift();
                      localStorage.setItem(QF_DONE_KEY, String(Number(localStorage.getItem(QF_DONE_KEY) || 0) + 1));
                      localStorage.setItem(QF_TOTE_KEY, q[0]?.tote || "");

                      if (q.length) {
                        localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
                        localStorage.setItem(PHASE_KEY, "asin");
                        await sleep(jittered(Math.min(getDelay(), 28)));
                        if (ABORT.token !== tok) return;
                        processQueue();
                        return;
                      }
                      clearQueueNow('done');
                      return;
                    } catch (e) {
                      console.warn("Same-tote fast path fallback", e);
                      backoffDelay();
                    }
                  }

                  const btn = await waitForChangeBtn(12000, 'change_btn');
                  if (ABORT.token !== tok) return;
                  await sleep(jittered(Math.min(getDelay(), 28)));
                  if (ABORT.token !== tok) return;
                  btn.click();

                  q.shift();
                  localStorage.setItem(QF_DONE_KEY, String(Number(localStorage.getItem(QF_DONE_KEY) || 0) + 1));
                  localStorage.setItem(QF_TOTE_KEY, q[0]?.tote || "");

                  if (q.length) {
                    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
                    localStorage.setItem(PHASE_KEY, "tote");
                  } else {
                    clearQueueNow('done');
                  }
                  return;
                }

              } catch (err) {
                if (String(err).includes('Aborted')) return;
                console.error("QuickFlip Error", err);
                backoffDelay();
              }
            }

            /*********** HOTKEYS ***********/
            window.addEventListener('keydown', (e) => {
              // Toggle aggressive
              if (e.altKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
                setAggressive(!isAggressive());
                setDelay(isAggressive() ? Math.min(getDelay(), DEFAULT_DELAY_AGGR) : Math.max(getDelay(), DEFAULT_DELAY_SAFE));
                updateHudBadge?.();
                e.preventDefault();
              }

              // Clear queue (always)
              if (e.ctrlKey && e.altKey && (e.key === 'Q' || e.key === 'q')) {
                e.preventDefault();
                clearQueueNow('hotkey');
              }
            }, true);


            function __mega_boot_pendingQuickFlip(){
              // Defer UI observers until DOM is ready to avoid mutation storms during initial paint.
              const boot = () => {
                try { startClearQueueUI(); } catch(e) { console.warn('[Mega] startClearQueueUI failed', e); }
                try { renderPersistentTracker(); } catch(e) {}
                try { startSensing(); } catch(e) {}
                try { insertUI(); } catch(e) {}
                try { processQueue(); } catch(e) {}
              };
              if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0), { once: true });
              } else {
                setTimeout(boot, 0);
              }
            }
          __mega_boot_pendingQuickFlip();
        })();
      } catch (e) {
        console.error('[Mega] Pending Quick Flip failed', e);
      }
    }

    // 2) EditItems Loop MultiFlip
    if (mode === 'sku' && isEditItems()) {
      try {
        (function() {

            'use strict';

            // Prevent double-inject
            if (window.__EIL_LOOP_V114) return;
            window.__EIL_LOOP_V114 = true;

            /**********************************************************************
             * PERSISTENCE
             **********************************************************************/
            const LS_KEY = 'EIL_LOOP_V1_STATE';

            const STATE_CHOICES = [
              { label: 'Sellable', value: 'Sellable' },
              { label: 'Pending Research', value: 'Pending Research' },
              { label: 'Unsellable', value: 'Unsellable' },
            ];

            const DAMAGE_DISPOSITIONS = [
              'Amazon Damage',
              'Defective',
              'Distributor Damage',
              'Expired',
            ];

            const DEFAULTS = {
              sku: '',
              currentStateUi: 'Sellable',
              currentDisp: 'Defective',
              desiredStateUi: 'Unsellable',
              desiredDisp: 'Defective',
              sourceState: 'Inventory',
              targetState: 'Unsellable',
              startOverOnDone: true,
            };


            const RETRY = {
              baseDelayMs: 700,
              maxDelayMs: 9000,
              maxAttempts: 9999,
            };

            // Smart-wait tuning
            const WAIT = {
              minBetweenActionsMs: 450,     // never click faster than this
              afterClickMs: 650,            // tiny settle time after any click
              headingChangeTimeoutMs: 6000, // wait for next step to load
              contentStableMs: 450,         // wait for labels/radios to exist
            };

            const norm = (s) => (s || '').replace(/\u00A0/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
            const qsa = (sel, root=document) => [...(root || document).querySelectorAll(sel)];
            const qs  = (sel, root=document) => (root || document).querySelector(sel);

            const safeJsonParse = (raw) => { try { return JSON.parse(raw); } catch { return null; } };

            function loadState() {
              const raw = localStorage.getItem(LS_KEY);
              if (!raw) return null;
              const st = safeJsonParse(raw);
              return st && typeof st === 'object' ? st : null;
            }
            function saveState(st) { localStorage.setItem(LS_KEY, JSON.stringify(st)); }
            function clearState() { localStorage.removeItem(LS_KEY); }

            /**********************************************************************
             * ALWAYS-VISIBLE "CLEAR QUEUE" STRIP
             * - Must show regardless of page loading: inject at document-start and
             *   attach to documentElement first; then re-attach to body when ready.
             **********************************************************************/
            function ensureClearStrip() {
              if (document.getElementById('eil-clear-strip')) return;

              const strip = document.createElement('div');
              strip.id = 'eil-clear-strip';
              strip.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                z-index: 2147483647;
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 10px;
                border-radius: 12px;
                background: rgba(0,0,0,0.82);
                color: #fff;
                font: 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
                box-shadow: 0 6px 20px rgba(0,0,0,0.35);
                user-select: none;
                pointer-events: auto;
              `;

              const badge = document.createElement('div');
              badge.textContent = 'EIL';
              badge.style.cssText = `
                font-weight: 900;
                letter-spacing: 0.4px;
                opacity: 0.9;
                padding: 4px 8px;
                border-radius: 10px;
                background: rgba(255,255,255,0.10);
                border: 1px solid rgba(255,255,255,0.18);
              `;

              const btn = document.createElement('button');
              btn.type = 'button';
              btn.textContent = 'CLEAR QUEUE';
              btn.title = 'Stops immediately + resets state (Ctrl+Alt+Q)';
              btn.style.cssText = `
                cursor: pointer;
                padding: 6px 10px;
                border-radius: 10px;
                border: 1px solid rgba(255,255,255,0.25);
                background: rgba(255,60,60,0.18);
                color: #fff;
                font-weight: 900;
                letter-spacing: 0.2px;
              `;

              btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                clearQueueNow('manual button');
              }, true);

              strip.appendChild(badge);
              strip.appendChild(btn);

              // Attach even if body isn't ready
              (document.body || document.documentElement).appendChild(strip);
            }

            // Keep it present even if page swaps body (SPA)
            const stripMo = new MutationObserver(() => ensureClearStrip());

            function startStripObserver() {
              try {
                ensureClearStrip();
                stripMo.observe(document.documentElement, { childList: true, subtree: true });
              } catch {}
            }

            /**********************************************************************
             * MODE / PAGE HELPERS
             **********************************************************************/
            function isModeSku() {
              return norm(document.body?.innerText || '').includes('mode: sku');
            }

            function isErroredPage() {
              const body = norm(document.body?.innerText || '');
              return body.includes('the work is errored') || body.includes('service failed to process your request');
            }

            function clickStartOver() {
              const btn = qsa('a, button').find(e => norm(e.textContent).includes('start over'));
              if (btn) { btn.click(); return true; }
              return false;
            }

            function findHeadingText() {
              const candidates = qsa('h1,h2,h3,header h1,header h2,header h3')
                .map(e => (e.textContent || '').trim())
                .filter(Boolean);

              const known = [
                'input fnsku or fcsku',
                'select source inventory state',
                'select source disposition type',
                'select new inventory state',
                'select new disposition type',
                'confirm change',
              ];
              for (const k of known) {
                const hit = candidates.find(t => norm(t).includes(k));
                if (hit) return hit;
              }
              return candidates[0] || '';
            }

            function findPrimaryActionButton() {
              const buttons = qsa('button, input[type="button"], input[type="submit"]');

              const change = buttons.find(b => norm(b.textContent || b.value).includes('change items'));
              if (change) return change;

              const cont = buttons.find(b => norm(b.textContent || b.value).includes('continue'));
              if (cont) return cont;

              return buttons.sort((a,b) => (b.offsetWidth*b.offsetHeight)-(a.offsetWidth*a.offsetHeight))[0] || null;
            }

            function findTextInput() {
              return qs('input[type="text"], input:not([type]), textarea');
            }

            function optionTextFromRadio(r) {
              // EditItems uses custom radio rows; labels are not always real <label> wrappers.
              let n = r;
              for (let i = 0; i < 8 && n; i++, n = n.parentElement) {
                const txt = (n.innerText || n.textContent || '').replace(/\s+/g, ' ').trim();
                if (!txt) continue;
                const radios = n.querySelectorAll?.('input[type="radio"]')?.length || 0;
                if (radios === 1 && txt.length > 2) return txt;
              }
              return (r.closest('label, div, li')?.innerText || r.parentElement?.innerText || '').replace(/\s+/g, ' ').trim();
            }

            function optionMatchesText(optionText, wantText) {
              const want = norm(wantText);
              const raw = String(optionText || '').replace(/\s+/g, ' ').trim();
              const t = norm(raw);
              if (!want || !t) return false;

              // Important: never let "Sellable" match "Unsellable".
              const firstPart = norm(raw
                .replace(/\(quantity:\s*[0-9,]+\)/ig, '')
                .split(/owner:|description:|and disposition:|new inventorystate:|source inventory state:/i)[0]);

              if (firstPart === want) return true;
              if (firstPart.startsWith(want + ' ')) return true;
              if (t === want) return true;
              if (t.startsWith(want + ' ')) return true;
              if (t.startsWith(want + ' (quantity:')) return true;
              return false;
            }

            function clickRadio(r) {
              if (!r) return false;
              try { r.scrollIntoView?.({ block: 'center', inline: 'center' }); } catch {}
              try { r.click(); } catch {}
              try { r.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
              try { r.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
              return true;
            }

            function selectRadioByLabelContains(wantText) {
              const want = norm(wantText);

              // 1) Exact value first when the app exposes useful values.
              const valueWant = want.toUpperCase().replace(/\s+/g, '_');
              for (const r of qsa('input[type="radio"]')) {
                const v = String(r.value || '').toUpperCase();
                if (v && v === valueWant) {
                  clickRadio(r);
                  return { ok: true, text: optionTextFromRadio(r) || r.value };
                }
              }

              // 2) Real labels.
              for (const el of qsa('label')) {
                const t = el.textContent || '';
                if (optionMatchesText(t, want)) {
                  const inp = el.querySelector('input[type="radio"]') || (el.htmlFor ? document.getElementById(el.htmlFor) : null);
                  if (inp) { clickRadio(inp); return { ok: true, text: t }; }
                  el.click();
                  return { ok: true, text: t };
                }
              }

              // 3) Custom row cards around each radio.
              for (const r of qsa('input[type="radio"]')) {
                const t = optionTextFromRadio(r);
                if (optionMatchesText(t, want)) {
                  clickRadio(r);
                  return { ok: true, text: t };
                }
              }

              return { ok: false };
            }

            function getOptionTextFor(target) {
              const want = norm(target);
              for (const l of qsa('label')) {
                const t = norm(l.textContent);
                if (t.includes(want)) return l.textContent || '';
              }
              const lines = (document.body?.innerText || '').split('\n').map(s => s.trim()).filter(Boolean);
              const line = lines.find(s => norm(s).includes(want) && /quantity/i.test(s));
              return line || '';
            }

            function parseQuantity(text) {
              const m = (text || '').match(/Quantity:\s*([0-9,]+)/i);
              if (!m) return null;
              return Number(m[1].replace(/,/g, ''));
            }

            /**********************************************************************
             * ABORTABLE SLEEP / WAIT
             * (This is what makes CLEAR QUEUE "instant" even while waiting.)
             **********************************************************************/
            const ABORT = {
              token: 0,           // increments on clear/stop to cancel waits
              inFlight: false,
            };

            function bumpAbortToken() { ABORT.token += 1; }

            async function sleep(ms, tokenAtCall) {
              const token = tokenAtCall ?? ABORT.token;
              const end = Date.now() + ms;
              while (Date.now() < end) {
                if (ABORT.token !== token) return false;
                const slice = Math.min(120, end - Date.now());
                await new Promise(r => setTimeout(r, slice));
              }
              return ABORT.token === token;
            }

            async function waitFor(fn, timeoutMs, pollMs=120) {
              const token = ABORT.token;
              const t0 = Date.now();
              while (Date.now() - t0 < timeoutMs) {
                if (ABORT.token !== token) return null;
                try {
                  const v = fn();
                  if (v) return v;
                } catch {}
                const ok = await sleep(pollMs, token);
                if (!ok) return null;
              }
              return null;
            }

            async function waitForHeadingChange(prevHeadingNorm) {
              return await waitFor(() => {
                const now = norm(findHeadingText());
                return (now && now !== prevHeadingNorm) ? now : null;
              }, WAIT.headingChangeTimeoutMs);
            }

            async function waitForAnyLabelContains(text) {
              const want = norm(text);
              return await waitFor(() => qsa('label').some(l => norm(l.textContent).includes(want)), WAIT.headingChangeTimeoutMs);
            }

            /**********************************************************************
             * HUD (SKU manual + dropdowns)
             **********************************************************************/
            function escapeHtml(s) {
              return String(s).replace(/[&<>"']/g, (ch) => ({
                '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
              }[ch]));
            }

            function setSelectValue(selectEl, value) {
              const v = String(value || '').trim();
              const found = [...selectEl.options].some(o => o.value === v);
              if (found) selectEl.value = v;
            }

            function isUnsellableUi(stateUi) {
              return norm(stateUi) === 'unsellable';
            }

            function stateForUi(stateUi) {
              const s = norm(stateUi);
              if (s === 'sellable') return 'Inventory';
              if (s === 'pending research') return 'Pending Research';
              return 'Unsellable';
            }

            function uiForState(state) {
              const s = norm(state);
              if (s === 'inventory') return 'Sellable';
              if (s === 'pending research') return 'Pending Research';
              return 'Unsellable';
            }

            function syncDamageSelect(stateSel, dispSel) {
              const on = isUnsellableUi(stateSel.value);
              dispSel.disabled = !on;
              dispSel.style.opacity = on ? '1' : '0.38';
              dispSel.style.pointerEvents = on ? 'auto' : 'none';
            }

            function wireStateDamage(stateSel, dispSel) {
              const sync = () => syncDamageSelect(stateSel, dispSel);
              stateSel.addEventListener('change', sync);
              sync();
            }

            function getHud() {

              let hud = document.getElementById('eil-hud');
              if (hud) return hud;

              // If body isn't ready yet, defer creation but keep CLEAR STRIP visible
              if (!document.body) return null;

              hud = document.createElement('div');
              hud.id = 'eil-hud';
              hud.style.position = 'fixed';
              hud.style.right = '12px';
              hud.style.bottom = '12px';
              hud.style.zIndex = '2147483647';
              hud.style.background = 'rgba(0,0,0,0.80)';
              hud.style.color = '#fff';
              hud.style.padding = '12px 12px';
              hud.style.borderRadius = '12px';
              hud.style.font = '12px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
              hud.style.boxShadow = '0 6px 20px rgba(0,0,0,0.35)';
              hud.style.width = '340px';

              const stateOptionsHtml = STATE_CHOICES.map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('');
              const damageOptionsHtml = DAMAGE_DISPOSITIONS.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
              const selectStyle = 'padding:6px 8px; border-radius:10px; border:1px solid rgba(255,255,255,0.25); background:#f2f2f2; color:#111;';

              hud.innerHTML = `
                <style>
                  #eil-hud select option { background:#fff !important; color:#111 !important; }
                  #eil-hud select:disabled { filter: grayscale(1); }
                </style>
                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                  <div style="font-weight:800;">EditItems Loop</div>
                  <div class="eil-mode" style="opacity:0.85;"></div>
                </div>

                <div style="margin-top:10px; display:grid; grid-template-columns: 1fr; gap:8px;">
                  <label style="display:grid; gap:4px;">
                    <div style="opacity:0.9;">SKU / ASIN / FNSKU / FCSKU</div>
                    <input class="eil-in-sku" type="text" placeholder="type here" style="padding:6px 8px; border-radius:10px; border:1px solid rgba(255,255,255,0.25); background:rgba(255,255,255,0.06); color:#fff;">
                  </label>

                  <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                    <label style="display:grid; gap:4px;">
                      <div style="opacity:0.9;">Current state</div>
                      <select class="eil-sel-cur-state" style="${selectStyle}">${stateOptionsHtml}</select>
                    </label>
                    <label style="display:grid; gap:4px;">
                      <div style="opacity:0.9;">Current damage</div>
                      <select class="eil-sel-cur-disp" style="${selectStyle}">${damageOptionsHtml}</select>
                    </label>
                    <label style="display:grid; gap:4px;">
                      <div style="opacity:0.9;">Desired state</div>
                      <select class="eil-sel-new-state" style="${selectStyle}">${stateOptionsHtml}</select>
                    </label>
                    <label style="display:grid; gap:4px;">
                      <div style="opacity:0.9;">Desired damage</div>
                      <select class="eil-sel-new-disp" style="${selectStyle}">${damageOptionsHtml}</select>
                    </label>
                  </div>
                </div>

                <div class="eil-line"
 style="margin-top:10px;">idle</div>
                <div class="eil-small" style="opacity:0.9; margin-top:4px;"></div>
                <div class="eil-progress" style="opacity:0.95; margin-top:6px; white-space:pre-line;"></div>

                <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
                  <button class="eil-btn-run" style="cursor:pointer; padding:6px 10px; border-radius:10px; border:1px solid rgba(255,255,255,0.25); background:rgba(255,255,255,0.10); color:#fff; font-weight:700;">RUN</button>
                  <button class="eil-btn-stop" style="cursor:pointer; padding:6px 10px; border-radius:10px; border:1px solid rgba(255,255,255,0.25); background:rgba(255,255,255,0.08); color:#fff;">Stop</button>
                  <button class="eil-btn-clear" style="cursor:pointer; padding:6px 10px; border-radius:10px; border:1px solid rgba(255,255,255,0.25); background:rgba(255,255,255,0.08); color:#fff;">Clear</button>
                </div>

                <div style="margin-top:8px; opacity:0.75;">Hotkeys: Ctrl+Alt+K = Stop, Ctrl+Alt+C = Clear, Ctrl+Alt+Q = CLEAR QUEUE</div>
              `;

              document.body.appendChild(hud);

              const st = loadState();
              const cfg = st?.cfg || DEFAULTS;

              hud.querySelector('.eil-in-sku').value = cfg.sku || '';
              const curState = cfg.currentStateUi || uiForState(cfg.sourceState || DEFAULTS.sourceState);
              const newState = cfg.desiredStateUi || uiForState(cfg.targetState || DEFAULTS.targetState);
              setSelectValue(hud.querySelector('.eil-sel-cur-state'), curState || DEFAULTS.currentStateUi);
              setSelectValue(hud.querySelector('.eil-sel-cur-disp'), cfg.currentDisp || DEFAULTS.currentDisp);
              setSelectValue(hud.querySelector('.eil-sel-new-state'), newState || DEFAULTS.desiredStateUi);
              setSelectValue(hud.querySelector('.eil-sel-new-disp'), cfg.desiredDisp || DEFAULTS.desiredDisp);

              wireStateDamage(hud.querySelector('.eil-sel-cur-state'), hud.querySelector('.eil-sel-cur-disp'));
              wireStateDamage(hud.querySelector('.eil-sel-new-state'), hud.querySelector('.eil-sel-new-disp'));


              hud.querySelector('.eil-btn-run')?.addEventListener('click', () => startRunFromHud());
              hud.querySelector('.eil-btn-stop')?.addEventListener('click', () => stopRun('manual stop'));
              hud.querySelector('.eil-btn-clear')?.addEventListener('click', () => clearAll('manual clear'));

              return hud;
            }

            function hudSetMode(text)  { const h = getHud(); if (h) h.querySelector('.eil-mode').textContent = text; }
            function hudSetLine(text)  { const h = getHud(); if (h) h.querySelector('.eil-line').textContent = text; }
            function hudSetSmall(text) { const h = getHud(); if (h) h.querySelector('.eil-small').textContent = text; }
            function hudSetProgress(text) { const h = getHud(); if (h) h.querySelector('.eil-progress').textContent = text; }

            /**********************************************************************
             * RUN STATE
             **********************************************************************/
            const R = {
              running: false,
              attempts: 0,
              backoffMs: RETRY.baseDelayMs,
              loopsCompleted: 0,
              baselineQty: null,
              currentQty: null,
              lastActionAt: 0,
              lastHeadingNorm: '',
              cfg: { ...DEFAULTS },
            };

            function restoreFromStorage() {
              const st = loadState();
              if (!st) return false;
              if (st.cfg) R.cfg = { ...DEFAULTS, ...st.cfg };
              R.running = !!st.running;
              R.attempts = st.attempts ?? 0;
              R.backoffMs = st.backoffMs ?? RETRY.baseDelayMs;
              R.loopsCompleted = st.loopsCompleted ?? 0;
              R.baselineQty = (typeof st.baselineQty === 'number') ? st.baselineQty : null;
              R.currentQty = (typeof st.currentQty === 'number') ? st.currentQty : null;
              R.lastHeadingNorm = st.lastHeadingNorm || '';
              return true;
            }

            function persist() {
              saveState({
                running: R.running,
                attempts: R.attempts,
                backoffMs: R.backoffMs,
                loopsCompleted: R.loopsCompleted,
                baselineQty: R.baselineQty,
                currentQty: R.currentQty,
                lastHeadingNorm: R.lastHeadingNorm,
                cfg: R.cfg,
              });
            }

            function clearAll(why='clear') {
              bumpAbortToken();

              R.running = false;
              R.attempts = 0;
              R.backoffMs = RETRY.baseDelayMs;
              R.loopsCompleted = 0;
              R.baselineQty = null;
              R.currentQty = null;
              R.lastHeadingNorm = '';
              clearState();

              hudSetLine('cleared');
              hudSetSmall(why ? `(${why})` : '');
              hudSetProgress('');
            }

            function stopRun(why='stop') {
              bumpAbortToken();

              R.running = false;
              persist();
              hudSetLine('stopped');
              hudSetSmall(why ? `(${why})` : '');
            }

            // "Queue" for this script = current run state + pending waits/loops.
            function clearQueueNow(why='clear queue') {
              // Stop immediately + wipe persisted state so it can't auto-resume
              clearAll(why);

              // Also make it obvious in UI even if HUD isn't ready yet
              const strip = document.getElementById('eil-clear-strip');
              if (strip) {
                strip.style.transform = 'scale(1.02)';
                strip.style.boxShadow = '0 0 0 2px rgba(255,60,60,0.35), 0 6px 20px rgba(0,0,0,0.35)';
                setTimeout(() => {
                  strip.style.transform = '';
                  strip.style.boxShadow = '0 6px 20px rgba(0,0,0,0.35)';
                }, 500);
              }
            }

            function startRunFromHud() {
              const hud = getHud();
              if (!hud) return;

              const sku = (hud.querySelector('.eil-in-sku').value || '').trim();
              if (!sku) {
                hudSetLine('SKU required');
                hudSetSmall('Type SKU/ASIN/FNSKU/FCSKU then RUN');
                return;
              }

              const currentStateUi = hud.querySelector('.eil-sel-cur-state').value || DEFAULTS.currentStateUi;
              const desiredStateUi = hud.querySelector('.eil-sel-new-state').value || DEFAULTS.desiredStateUi;
              const currentDisp = isUnsellableUi(currentStateUi)
                ? (hud.querySelector('.eil-sel-cur-disp').value || DEFAULTS.currentDisp)
                : '';
              const desiredDisp = isUnsellableUi(desiredStateUi)
                ? (hud.querySelector('.eil-sel-new-disp').value || DEFAULTS.desiredDisp)
                : '';

              R.cfg = {
                ...DEFAULTS,
                sku,
                currentStateUi,
                currentDisp,
                desiredStateUi,
                desiredDisp,
                sourceState: stateForUi(currentStateUi),
                targetState: stateForUi(desiredStateUi),
              };


              bumpAbortToken(); // cancel any lingering waits from a previous run
              R.running = true;
              R.attempts = 0;
              R.backoffMs = RETRY.baseDelayMs;
              R.loopsCompleted = 0;
              R.baselineQty = null;
              R.currentQty = null;

              persist();
              hudSetLine('starting…');
              hudSetSmall(`ID: ${R.cfg.sku}`);
              tick();
            }

            async function guardedClick(btn, why) {
              if (!btn) return false;
              const token = ABORT.token;

              const now = Date.now();
              const delta = now - R.lastActionAt;
              if (delta < WAIT.minBetweenActionsMs) {
                const ok = await sleep(WAIT.minBetweenActionsMs - delta, token);
                if (!ok) return false;
              }

              // extra guard: don't re-click if we haven't left this heading yet
              const headingBefore = norm(findHeadingText());
              if (headingBefore && headingBefore === R.lastHeadingNorm) {
                const ok = await sleep(WAIT.contentStableMs, token);
                if (!ok) return false;
              }

              if (ABORT.token !== token) return false;

              R.lastActionAt = Date.now();
              hudSetLine(why);
              btn.click();

              // settle + wait for heading transition if possible
              const ok1 = await sleep(WAIT.afterClickMs, token);
              if (!ok1) return false;
              await waitForHeadingChange(headingBefore);

              return ABORT.token === token;
            }

            function updateProgress() {
              const progressKey = isUnsellableUi(R.cfg.currentStateUi) ? R.cfg.currentDisp : R.cfg.sourceState;
              const t = getOptionTextFor(progressKey);
              const qty = parseQuantity(t);

              if (typeof qty === 'number') {
                if (R.baselineQty === null) R.baselineQty = qty;
                R.currentQty = qty;
              }

              const b = R.baselineQty;
              const c = R.currentQty;
              const moved = (typeof b === 'number' && typeof c === 'number') ? (b - c) : null;

              const lines = [];
              lines.push(`SKU: ${R.cfg.sku}`);
              lines.push(`Loops: ${R.loopsCompleted} | Retries: ${R.attempts}`);
              if (typeof b === 'number') lines.push(`${progressKey}: ${c ?? '?'} / ${b} (moved ${moved ?? '?'})`);
              hudSetProgress(lines.join('\n'));

              persist();
              return qty;
            }

            async function handleErrorAndRetry() {
              const token = ABORT.token;

              R.attempts += 1;
              if (R.attempts > RETRY.maxAttempts) {
                hudSetLine('STOP: max retries reached');
                stopRun('max retries');
                return;
              }

              hudSetLine(`ERROR → retry #${R.attempts}`);
              clickStartOver();

              const ok = await sleep(R.backoffMs, token);
              if (!ok) return;

              R.backoffMs = Math.min(RETRY.maxDelayMs, Math.round(R.backoffMs * 1.25 + 120));
              hudSetSmall(`retry #${R.attempts} (delay ${R.backoffMs}ms)`);
              persist();
            }

            async function stepInput() {
              const input = await waitFor(() => findTextInput(), WAIT.headingChangeTimeoutMs);
              if (!input) return false;

              const v = (input.value || '').trim();
              if (v !== R.cfg.sku) {
                input.focus();
                input.value = R.cfg.sku;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                await sleep(120);
              }

              return guardedClick(findPrimaryActionButton(), 'Continue (input)');
            }

            async function stepSourceState() {
              await waitForAnyLabelContains(R.cfg.sourceState);
              if (!selectRadioByLabelContains(R.cfg.sourceState).ok) return false;
              return guardedClick(findPrimaryActionButton(), `Continue (source: ${R.cfg.sourceState})`);
            }

            async function stepSourceDisposition() {
              if (!isUnsellableUi(R.cfg.currentStateUi)) {
                return guardedClick(findPrimaryActionButton(), 'Continue (source has no damage)');
              }

              await waitForAnyLabelContains(R.cfg.currentDisp);
              const qty = updateProgress();
              if (qty === 0) {
                hudSetLine(`DONE: ${R.cfg.currentDisp} is 0`);
                if (R.cfg.startOverOnDone) clickStartOver();
                stopRun('done');
                return true;
              }

              if (!selectRadioByLabelContains(R.cfg.currentDisp).ok) return false;
              return guardedClick(findPrimaryActionButton(), `Continue (disp: ${R.cfg.currentDisp})`);
            }

            async function stepTargetState() {

              await waitForAnyLabelContains(R.cfg.targetState);
              if (!selectRadioByLabelContains(R.cfg.targetState).ok) return false;
              return guardedClick(findPrimaryActionButton(), `Continue (target: ${R.cfg.targetState})`);
            }

            async function stepTargetDispositionIfPresent() {
              if (!isUnsellableUi(R.cfg.desiredStateUi)) {
                return guardedClick(findPrimaryActionButton(), 'Continue (target has no damage)');
              }

              await waitForAnyLabelContains(R.cfg.desiredDisp);
              if (!selectRadioByLabelContains(R.cfg.desiredDisp).ok) return false;
              return guardedClick(findPrimaryActionButton(), `Continue (new disp: ${R.cfg.desiredDisp})`);
            }

            async function stepConfirm() {

              const clicked = await guardedClick(findPrimaryActionButton(), 'Change Items');
              if (clicked) R.loopsCompleted += 1;
              persist();
              return clicked;
            }

            async function tick() {
              if (tick._running) return;
              tick._running = true;

              while (R.running) {
                hudSetMode(isModeSku() ? 'Mode: Sku' : 'Mode: NOT Sku');

                try {
                  if (isErroredPage()) {
                    await handleErrorAndRetry();
                    await sleep(300);
                    continue;
                  }

                  if (!isModeSku()) {
                    hudSetLine('waiting for Mode: Sku…');
                    await sleep(500);
                    continue;
                  }

                  const headingNorm = norm(findHeadingText());
                  R.lastHeadingNorm = headingNorm;
                  persist();

                  const bodyNorm = norm(document.body?.innerText || '');
                  const isGenericTargetDisp = headingNorm.includes('select disposition type') && bodyNorm.includes('new inventorystate:');
                  const isGenericSourceDisp = headingNorm.includes('select disposition type') && bodyNorm.includes('source inventory state:');

                  if (headingNorm.includes('input fnsku or fcsku')) {
                    await stepInput();
                  } else if (headingNorm.includes('select source inventory state')) {
                    await stepSourceState();
                  } else if (headingNorm.includes('select source disposition type') || isGenericSourceDisp) {
                    await stepSourceDisposition();
                  } else if (headingNorm.includes('select new inventory state')) {
                    await stepTargetState();
                  } else if (headingNorm.includes('select new disposition type') || isGenericTargetDisp) {
                    await stepTargetDispositionIfPresent();
                  } else if (headingNorm.includes('confirm change')) {
                    await stepConfirm();
                  } else {
                    hudSetLine('waiting…');
                    await sleep(350);
                    continue;
                  }

                  await sleep(250);
                } catch (e) {
                  console.warn('[EditItems Loop] exception:', e);
                  hudSetLine('exception (see console)');
                  await sleep(900);
                }
              }

              tick._running = false;
            }

            /**********************************************************************
             * GLOBAL HOTKEYS (work even before HUD exists)
             **********************************************************************/
            document.addEventListener('keydown', (e) => {
              if (!e.ctrlKey || !e.altKey) return;
              const k = (e.key || '').toLowerCase();

              if (k === 'q') { e.preventDefault(); clearQueueNow('hotkey'); }
              if (k === 'k') { e.preventDefault(); stopRun('hotkey'); }
              if (k === 'c') { e.preventDefault(); clearAll('hotkey'); }
            }, true);

            /**********************************************************************
             * INIT
             **********************************************************************/
            startStripObserver();

            // Build HUD when body becomes available (without delaying the clear button)
            const hudBoot = () => {
              getHud();
              restoreFromStorage();
              hudSetMode(isModeSku() ? 'Mode: Sku' : 'Mode: NOT Sku');

              if (R.running) {
                hudSetLine('resuming…');
                hudSetSmall(`ID: ${R.cfg.sku || ''}`);
                tick();
              } else {
                hudSetLine('idle');
                hudSetSmall('Type SKU + choose dispositions, then RUN');
              }
            };

            if (document.readyState === 'loading') {
              document.addEventListener('DOMContentLoaded', hudBoot, { once: true });
            } else {
              hudBoot();
            }
        })();
      } catch (e) {
        console.error('[Mega] EditItems Loop failed', e);
      }
    }

  }

  // Defer module startup slightly to avoid competing with initial page render
  if (document.readyState === 'loading') {
    window.addEventListener('load', () => setTimeout(runModules, 0), { once: true });
  } else {
    setTimeout(runModules, 0);
  }
})();