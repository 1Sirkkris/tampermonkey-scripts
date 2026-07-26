// ==UserScript==
// @name         Multi-container & Multi-ASIN EditItems Auto Expiration Date
// @author       ibnahlho
// @version      5.1
// @description  Auto EditItems Multi-container Expiration Date & Multi-ASIN & PENDING_RESEARCH
// @match        https://aft-qt-eu.aka.amazon.com/app/edititems?experience=Desktop*
// @match        https://aft-qt-na.aka.amazon.com/app/edititems?experience=Desktop*
// @include      https://aft-qt-eu.aka.amazon.com/app/edititems*
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Multi_container_Multi_ASIN_EditItems_Auto_Expiration_Date.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Multi_container_Multi_ASIN_EditItems_Auto_Expiration_Date.user.js
// @icon         https://drive-render.corp.amazon.com/view/ibnahlho@/Peccy/Peccy%20ibnahlho.png
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
╔══════════════════════════════════════════════════════╗
║                                                      ║
║         Auto EditItems Multi-container               ║
║  Expiration Date & Multi-ASIN & PENDING_RESEARCH     ║
║                    by ibnahlho                       ║
║                      v5.1                            ║
╠══════════════════════════════════════════════════════╣
║  ┌─────── HOW IT WORKS ────────────────┐            ║
║  │                                      │            ║
║  │  1. Enter container codes            │            ║
║  │     (one per line in the panel)      │            ║
║  │                                      │            ║
║  │  2. Enter ASIN(s) and expiry date    │            ║
║  │                                      │            ║
║  │  3. Press Start — the script will:   │            ║
║  │     • Auto-fill the container ID     │            ║
║  │     • Auto-fill the ASIN barcode     │            ║
║  │     • Auto-fill the expiration date  │            ║
║  │     • Save and move to next          │            ║
║  │                                      │            ║
║  │  4. Repeat for every container       │            ║
║  │     in your list automatically       │            ║
║  │                                      │            ║
║  └──────────────────────────────────────┘            ║
╠══════════════════════════════════════════════════════╣
║  ┌─────── CORE FEATURES ───────────────┐            ║
║  │                                      │            ║
║  │  📋 Container list  (one per line)   │            ║
║  │  🏷️  Single or Multi-ASIN mode       │            ║
║  │  📅 Auto-fill expiration date        │            ║
║  │  🔬 PENDING_RESEARCH mode            │            ║
║  │  ▶️  Start  •  ⏸️ Pause  •  🔄 Reset  │           ║
║  │  ⌨️  click ␣ Space to Start / Pause  │            ║
║  │  📊 Progress bar & counters          │            ║
║  │  💾 Auto-saves everything            │            ║
║  │                                      │            ║
║  └──────────────────────────────────────┘            ║
╠══════════════════════════════════════════════════════╣
║  ┌─────── MULTI-ASIN CYCLE ────────────┐            ║
║  │                                      │            ║
║  │  For each container:                 │            ║
║  │  ├── ASIN 1/n → Save → Start over    │            ║
║  │  ├── ASIN 2/n → Save → Start over    │            ║
║  │  ├── ...                             │            ║
║  │  └── ASIN n/n → Save → Start over    │            ║
║  │      ✅ Move to next container       │            ║
║  │                                      │            ║
║  └──────────────────────────────────────┘            ║
╠══════════════════════════════════════════════════════╣
║  ┌─────── PENDING_RESEARCH MODE ───────┐            ║
║  │                                      │            ║
║  │  Enable when items are in state      │            ║
║  │  PENDING_RESEARCH. For each item:    │            ║
║  │                                      │            ║
║  │  Container → ASIN → Date             │            ║
║  │    → Riassegna a SELLABLE [Y]        │            ║
║  │    → Salva data di scadenza          │            ║
║  │    → Start over → next container     │            ║
║  │                                      │            ║
║  │  ⚠️  Incompatible with Overwrite     │            ║
║  │  ✅ Works with Multi-ASIN mode       │            ║
║  │  ✅ Works with Notifications         │            ║
║  │                                      │            ║
║  │  Multi-ASIN + PENDING_RESEARCH:      │            ║
║  │  ├── ASIN 1/n → SELLABLE → Save      │            ║
║  │  ├── ASIN 2/n → SELLABLE → Save      │            ║
║  │  └── ASIN n/n → SELLABLE → Save      │            ║
║  │      ✅ Move to next container       │            ║
║  │                                      │            ║
║  └──────────────────────────────────────┘            ║
╚══════════════════════════════════════════════════════╝
*/
(function () {
    'use strict';

    const LS = {
        running:          'mcsa_running',
        sticky:           'mcsa_sticky',
        containers:       'mcsa_containers',
        cidx:             'mcsa_cidx',
        asin:             'mcsa_asin',
        y:                'mcsa_year',
        m:                'mcsa_month',
        d:                'mcsa_day',
        justSaved:        'mcsa_justSaved',
        advance:          'mcsa_advancing',
        overwrite:        'mcsa_overwrite',
        notifications:    'mcsa_notifications',
        optionsVisible:   'mcsa_options_visible',
        multiAsinMode:    'mcsa_multi_asin_mode',
        currentAsinIndex: 'mcsa_current_asin_index',
        asinList:         'mcsa_asin_list',
        pendingResearch:  'mcsa_pending_research'
    };

    const get = (k, def='') => localStorage.getItem(k) ?? def;
    const set = (k, v) => localStorage.setItem(k, v);

    const getRunning = () => get(LS.running)==='true';
    const setRunning = v => set(LS.running, v ? 'true' : 'false');

    const getSticky = () => get(LS.sticky)==='true';
    const setSticky = v => set(LS.sticky, v ? 'true' : 'false');

    const getASIN = () => (get(LS.asin)||'').trim();
    const setASIN = s => set(LS.asin, (s||'').trim());

    const getCIdx = () => parseInt(get(LS.cidx)||'0',10);
    const setCIdx = n => set(LS.cidx, String(Math.max(0,n)));

    const setYMD = (y,m,d)=>{ set(LS.y,String(y??'')); set(LS.m,String(m??'')); set(LS.d,String(d??'')); };
    const getYMD = ()=>({ y:get(LS.y), m:get(LS.m), d:get(LS.d) });

    const setJustSaved = v => set(LS.justSaved, v ? 'true':'false');
    const getJustSaved = ()=> get(LS.justSaved)==='true';

    const isAdvancing  = () => get(LS.advance) === '1';
    const setAdvancing = v  => set(LS.advance, v ? '1' : '0');

    const getOverwrite = () => get(LS.overwrite)==='true';
    const setOverwrite = v => set(LS.overwrite, v ? 'true' : 'false');

    const getNotifications = () => get(LS.notifications)==='true';
    const setNotifications = v => set(LS.notifications, v ? 'true' : 'false');

    const getOptionsVisible = () => get(LS.optionsVisible)==='true';
    const setOptionsVisible = v => set(LS.optionsVisible, v ? 'true' : 'false');

    const getMultiAsinMode = () => get(LS.multiAsinMode) === 'true';
    const setMultiAsinMode = v => set(LS.multiAsinMode, v ? 'true' : 'false');

    const getCurrentAsinIndex = () => parseInt(get(LS.currentAsinIndex) || '0', 10);
    const setCurrentAsinIndex = n => set(LS.currentAsinIndex, String(Math.max(0, n)));

    const getAsinList = () => (get(LS.asinList) || '')
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean);
    const setAsinList = arr => set(LS.asinList, Array.isArray(arr) ? arr.join('\n') : arr);

    const getPendingResearch = () => get(LS.pendingResearch) === 'true';
    const setPendingResearch = v => set(LS.pendingResearch, v ? 'true' : 'false');

    const wait = (ms)=> new Promise(r=>setTimeout(r,ms));

    const setStatus = s => {
        const el=document.getElementById('mcsa-status');
        if(el) el.textContent=s||'';
        addLogEntry(s || 'Status cleared');
    };

    const getContainersArr = () => (get(LS.containers)||'')
        .split(/\r?\n/)
        .map(s=>s.trim())
        .filter(Boolean);

    function parseDateInput() {
        const {y,m,d} = getYMD();
        const Y = parseInt(y,10), M = parseInt(m,10), D = parseInt(d,10);
        if (!isNaN(Y) && !isNaN(M) && !isNaN(D)) return {y:Y,m:M,d:D};
        return null;
    }

    // =====================================================================
    // PANEL INJECTION — Amazon Corporate Clean Design
    // =====================================================================
    function injectPanel(){
        if (document.getElementById('mcsa-panel')) return;

        const wrap = document.createElement('div');
        wrap.id = 'mcsa-panel';
        wrap.innerHTML = `
      <div id="mcsa-head">
        <button id="mcsa-tab" class="tab" title="Open/close panel">
          <span class="tab-icon">⚙️</span>
          <span class="tab-text">Auto Expiration Date Multi-container</span>
          <span id="mcsa-status-badge" class="status-badge stopped"></span>
        </button>
      </div>

      <div id="mcsa-body" style="display:none">
        <div class="panel-header">
          <div class="panel-header-left">
            <div class="panel-logo">
              <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="1" width="6" height="6" fill="#FF9900"/>
                <rect x="9" y="1" width="6" height="6" fill="#FF9900"/>
                <rect x="1" y="9" width="6" height="6" fill="#FF9900"/>
                <rect x="9" y="9" width="6" height="6" fill="#FF9900"/>
              </svg>
            </div>
            <h3>Edit Items Automation</h3>
          </div>
          <button id="mcsa-close" class="btn-close" title="Close">✕</button>
        </div>

        <div class="tabs">
          <button class="tab-btn active" data-tab="config">Configuration</button>
          <button class="tab-btn" data-tab="status">Status</button>
          <button class="tab-btn" data-tab="logs">Logs</button>
        </div>

        <div class="tab-content active" id="tab-config">

          <div class="section">
            <div class="section-label">Containers <span class="hint">(one per line)</span></div>
            <textarea id="mcsa-containers-ta" rows="5"
                      placeholder="Enter container codes...&#10;Example:&#10;tsX00000&#10;csX00000"></textarea>
            <div class="counter"><span id="mcsa-container-count">0</span> containers entered</div>
          </div>

          <div class="section" id="mcsa-asin-section">
            <div class="section-label">
              <span id="mcsa-asin-title">🏷️ Single ASIN</span>
              <span id="mcsa-asin-hint" class="hint"></span>
            </div>
            <div id="mcsa-single-asin-container">
              <div class="input-with-action">
                <input id="mcsa-asin" type="text" placeholder="B07XXXXXXXX">
                <button id="mcsa-clear-asin" class="btn-action" title="Clear">✕</button>
              </div>
            </div>
            <div id="mcsa-multi-asin-container" style="display:none">
              <textarea id="mcsa-multi-asin-ta" rows="4"
                        placeholder="Enter ASINs for this container...&#10;Example:&#10;B07XXXXXXXX&#10;B08YYYYYYYY&#10;B09ZZZZZZZZ"></textarea>
              <div class="counter"><span id="mcsa-multi-asin-count">0</span> ASINs entered</div>
            </div>
          </div>

          <div class="section">
            <div class="section-label">📅 Expiration Date</div>
            <div class="date-grid">
              <div class="date-field">
                <label for="mcsa-year">Year</label>
                <input id="mcsa-year" type="number" min="2024" max="2100" placeholder="YYYY">
              </div>
              <div class="date-field">
                <label for="mcsa-month">Month</label>
                <input id="mcsa-month" type="number" min="1" max="12" placeholder="MM">
              </div>
              <div class="date-field">
                <label for="mcsa-day">Day</label>
                <input id="mcsa-day" type="number" min="1" max="31" placeholder="DD">
              </div>
            </div>
            <div id="mcsa-date-preview" class="date-preview">Enter a complete date</div>
          </div>

          <div class="options-dropdown" id="mcsa-options-dropdown">
            <div class="dropdown-header" id="mcsa-options-toggle">
              <span class="dropdown-title">⚡ OPTIONS</span>
              <span class="dropdown-arrow">▼</span>
            </div>
            <div class="dropdown-content" id="mcsa-options-content" style="display:none">
              <div class="options-grid">
                <label class="option">
                  <input id="mcsa-overwrite" type="checkbox">
                  <span class="checkmark"></span>
                  <span class="option-text">
                    <strong>Overwrite existing dates</strong>
                    <small>Remove already present dates</small>
                  </span>
                </label>
                <label class="option">
                  <input id="mcsa-notifications" type="checkbox" checked>
                  <span class="checkmark"></span>
                  <span class="option-text">
                    <strong>Notifications</strong>
                    <small>Show completion alerts</small>
                  </span>
                </label>
                <label class="option">
                  <input id="mcsa-multi-asin" type="checkbox">
                  <span class="checkmark"></span>
                  <span class="option-text">
                    <strong>Multi-ASIN Mode</strong>
                    <small>Process multiple ASINs per container</small>
                  </span>
                </label>
                <label class="option" id="mcsa-pending-research-option">
                  <input id="mcsa-pending-research" type="checkbox">
                  <span class="checkmark"></span>
                  <span class="option-text">
                    <strong>PENDING_RESEARCH Mode</strong>
                    <small>Auto-assign SELLABLE [Y] items</small>
                  </span>
                </label>
              </div>
            </div>
          </div>

          <div class="progress-section">
            <div class="progress-header">
              <span>PROGRESS</span>
              <span id="mcsa-progress-text">0/0</span>
            </div>
            <div class="progress-bar-wrap">
              <div id="mcsa-progress-fill" class="progress-fill" style="width:0%"></div>
            </div>
          </div>

          <div class="action-buttons">
            <button id="mcsa-start" class="btn-amz-primary btn-start">
              <span class="btn-icon">▶</span>
              <span class="btn-text">Start</span>
            </button>
            <button id="mcsa-pause" class="btn-amz-navy btn-pause">
              <span class="btn-icon">⏸</span>
              <span class="btn-text">Pause</span>
            </button>
            <button id="mcsa-reset" class="btn-amz-secondary btn-reset">
              <span class="btn-icon">↺</span>
              <span class="btn-text">Reset</span>
            </button>
          </div>

          <div class="spacebar-hint">
            <span class="kbd-label">Press</span>
            <kbd class="kbd-space">␣ Space</kbd>
            <span class="kbd-label">to Start / Pause</span>
          </div>

        </div><!-- /tab-config -->

        <div class="tab-content" id="tab-status">
          <div class="status-card">
            <div class="status-item">
              <span class="status-label">Status</span>
              <span id="mcsa-status" class="status-value idle">Waiting</span>
            </div>
            <div class="status-item">
              <span class="status-label">Current container</span>
              <span id="mcsa-current-container" class="status-value mono">-</span>
            </div>
            <div class="status-item">
              <span class="status-label">Current ASIN</span>
              <span id="mcsa-current-asin" class="status-value mono">-</span>
            </div>
            <div class="status-item">
              <span class="status-label">Progress</span>
              <span id="mcsa-progress-detail" class="status-value">0/0 (0%)</span>
            </div>
            <div class="status-item no-border">
              <span class="status-label">Last action</span>
              <span id="mcsa-last-action" class="status-value">-</span>
            </div>
          </div>
          <div class="quick-actions">
            <button id="mcsa-skip" class="btn-amz-secondary">⏭ Skip container</button>
            <button id="mcsa-retry" class="btn-amz-secondary">↺ Retry current</button>
          </div>
        </div><!-- /tab-status -->

        <div class="tab-content" id="tab-logs">
          <div class="logs-header">
            <span class="section-label" style="margin:0;border:none;padding:0;">📝 ACTIVITY LOG</span>
            <button id="mcsa-clear-logs" class="btn-amz-secondary btn-sm">Clear</button>
          </div>
          <div id="mcsa-logs" class="logs-container"></div>
        </div><!-- /tab-logs -->

      </div><!-- /mcsa-body -->
    `;
        document.body.appendChild(wrap);

        // =====================================================================
        // CSS — Amazon Corporate Clean
        // #232F3E navy | #FF9900 orange | #FFFFFF white | #F3F4F6 bg | #111827 text
        // =====================================================================
        const css = document.createElement('style');
        css.textContent = `
      /* ── RESET ── */
      #mcsa-panel * { box-sizing: border-box; }

      /* ── VARIABLES ── */
      #mcsa-panel {
        --navy:        #232F3E;
        --navy-light:  #37475A;
        --navy-dark:   #131A22;
        --orange:      #FF9900;
        --orange-hover:#E88900;
        --white:       #FFFFFF;
        --bg:          #F3F4F6;
        --text:        #111827;
        --text-muted:  #6B7280;
        --text-light:  #9CA3AF;
        --border:      #D1D5DB;
        --border-light:#E5E7EB;
        --green:       #067D62;
        --red:         #CC0C39;
        --blue:        #146EB4;
        --radius:      3px;
        font-family: 'Amazon Ember', 'Helvetica Neue', Arial, sans-serif;
        font-size: 13px;
        color: var(--text);
      }

      /* ── FLOATING TAB TRIGGER ── */
      #mcsa-head {
        position: fixed;
        top: 72px;
        right: 18px;
        z-index: 1000000;
      }

      #mcsa-tab {
        background: var(--navy);
        color: #ffffff;
        border: none;
        border-bottom: 2px solid var(--orange);
        cursor: pointer;
        padding: 9px 14px;
        border-radius: var(--radius);
        font: 600 12px/1 'Amazon Ember', 'Helvetica Neue', Arial, sans-serif;
        letter-spacing: 0.04em;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        display: flex;
        align-items: center;
        gap: 8px;
        transition: background 0.15s, box-shadow 0.15s;
      }
      #mcsa-tab:hover { background: var(--navy-light); box-shadow: 0 3px 12px rgba(0,0,0,0.25); }

      .tab-icon { font-size: 14px; }
      .tab-text { font-weight: 600; font-size: 12px; color: #fff; letter-spacing: 0.05em; }

      .status-badge {
        width: 8px; height: 8px;
        border-radius: 50%;
        margin-left: 2px;
        flex-shrink: 0;
      }
      .status-badge.running { background: #FF9900; box-shadow: 0 0 0 2px rgba(255,153,0,0.3); }
      .status-badge.paused  { background: #d69e2e; }
      .status-badge.stopped { background: #CC0C39; }

      /* ── MAIN PANEL BODY ── */
      #mcsa-body {
        background: var(--white);
        border: 1px solid #C6C9CE;
        border-top: 3px solid var(--orange);
        border-radius: var(--radius);
        width: 380px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        position: fixed;
        top: 115px;
        right: 18px;
        z-index: 999999;
        max-height: 82vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      /* ── PANEL HEADER ── */
      .panel-header {
        background: var(--navy);
        padding: 10px 14px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-shrink: 0;
      }
      .panel-header-left { display: flex; align-items: center; gap: 8px; }
      .panel-logo {
        width: 22px; height: 22px;
        background: var(--orange);
        border-radius: 2px;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
      }
      .panel-logo svg { width: 13px; height: 13px; }
      .panel-header h3 {
        margin: 0;
        font-size: 11px;
        font-weight: 700;
        color: #fff;
        letter-spacing: 0.09em;
        text-transform: uppercase;
      }
      .btn-close {
        background: transparent;
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 2px;
        font-size: 12px;
        color: #B8C4CC;
        cursor: pointer;
        width: 22px; height: 22px;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.15s, color 0.15s, border-color 0.15s;
        padding: 0;
      }
      .btn-close:hover { background: var(--red); color: #fff; border-color: var(--red); }

      /* ── TABS ── */
      .tabs {
        display: flex;
        background: var(--bg);
        border-bottom: 1px solid var(--border);
        flex-shrink: 0;
      }
      .tab-btn {
        flex: 1;
        padding: 9px 6px;
        border: none;
        background: none;
        cursor: pointer;
        font: 600 11px/1 'Amazon Ember', 'Helvetica Neue', Arial, sans-serif;
        color: var(--text-muted);
        letter-spacing: 0.05em;
        text-transform: uppercase;
        border-bottom: 2px solid transparent;
        transition: color 0.15s, border-color 0.15s, background 0.15s;
        font-family: inherit;
      }
      .tab-btn.active {
        color: var(--navy);
        border-bottom-color: var(--orange);
        background: var(--white);
        font-weight: 700;
      }
      .tab-btn:hover:not(.active) { color: var(--navy); background: var(--border-light); }

      /* ── TAB CONTENT ── */
      .tab-content {
        padding: 14px;
        overflow-y: auto;
        flex: 1;
        display: none;
        background: var(--white);
      }
      .tab-content.active { display: block; }

      /* ── SECTION LABEL ── */
      .section { margin-bottom: 14px; }
      .section-label {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--navy);
        margin-bottom: 6px;
        padding-bottom: 4px;
        border-bottom: 1px solid var(--border-light);
        display: flex;
        align-items: center;
        gap: 5px;
      }
      .hint { font-size: 10px; font-weight: 400; color: var(--text-light); text-transform: none; letter-spacing: 0; font-style: italic; }

      /* ── INPUTS & TEXTAREAS ── */
      #mcsa-panel textarea,
      #mcsa-panel input[type="text"],
      #mcsa-panel input[type="number"] {
        width: 100%;
        padding: 7px 9px;
        border: 1px solid #ADB1B8;
        border-top-color: #888C94;
        border-radius: var(--radius);
        font-size: 12px;
        font-family: inherit;
        color: var(--text);
        background: var(--white);
        transition: border-color 0.15s, box-shadow 0.15s;
        box-sizing: border-box;
        outline: none;
      }
      #mcsa-panel textarea:focus,
      #mcsa-panel input:focus {
        border-color: var(--orange);
        box-shadow: 0 0 0 3px rgba(255,153,0,0.2);
      }
      #mcsa-panel textarea {
        resize: vertical;
        font-family: 'Consolas', 'SF Mono', monospace;
        font-size: 11px;
        line-height: 1.6;
        color: var(--navy);
      }
      #mcsa-panel input::placeholder,
      #mcsa-panel textarea::placeholder { color: var(--text-light); }

      .counter { font-size: 11px; color: var(--orange); font-weight: 600; text-align: right; margin-top: 4px; }

      .input-with-action { display: flex; gap: 6px; }
      .input-with-action input { flex: 1; }

      .btn-action {
        background: var(--bg);
        border: 1px solid #ADB1B8;
        border-top-color: #888C94;
        border-radius: var(--radius);
        padding: 0 10px;
        cursor: pointer;
        color: var(--text-muted);
        font-size: 11px;
        transition: background 0.15s, color 0.15s, border-color 0.15s;
        font-family: inherit;
      }
      .btn-action:hover { background: #fff0f0; color: var(--red); border-color: #e8a0a0; }

      /* ── DATE GRID ── */
      .date-grid {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 8px;
        margin-bottom: 8px;
      }
      .date-field label {
        display: block;
        font-size: 9px;
        color: var(--text-muted);
        margin-bottom: 3px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .date-preview {
        text-align: center;
        padding: 7px 10px;
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        font-size: 12px;
        color: var(--navy);
        font-weight: 600;
        letter-spacing: 0.05em;
        font-family: 'Consolas', 'SF Mono', monospace;
      }

      /* ── OPTIONS DROPDOWN ── */
      .options-dropdown {
        margin: 12px 0;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        overflow: hidden;
        background: var(--bg);
      }
      .dropdown-header {
        padding: 9px 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: pointer;
        user-select: none;
        transition: background 0.15s;
        background: var(--bg);
        border-bottom: 1px solid transparent;
      }
      .dropdown-header:hover { background: var(--border-light); }
      .dropdown-header.active { border-bottom-color: var(--border); }
      .dropdown-title {
        font-size: 10px;
        font-weight: 700;
        color: var(--navy);
        text-transform: uppercase;
        letter-spacing: 0.1em;
      }
      .dropdown-arrow { font-size: 10px; color: var(--text-muted); transition: transform 0.2s ease; }

      .dropdown-content {
        padding: 0 12px;
        max-height: 0;
        overflow: hidden;
        transition: all 0.2s ease;
        background: var(--white);
      }
      .dropdown-content.show {
        padding: 12px;
        max-height: 500px;
        border-top: 1px solid var(--border-light);
      }

      .options-grid { display: flex; flex-direction: column; gap: 6px; }
      .option {
        display: flex;
        align-items: flex-start;
        gap: 9px;
        cursor: pointer;
        padding: 7px 8px;
        border-radius: var(--radius);
        transition: background 0.15s;
      }
      .option:hover { background: var(--bg); }
      .option input { margin-top: 2px; accent-color: var(--orange); cursor: pointer; }
      .option-text { flex: 1; }
      .option-text strong {
        display: block;
        font-size: 12px;
        font-weight: 600;
        color: var(--text);
        margin-bottom: 1px;
      }
      .option-text small { display: block; font-size: 10px; color: var(--text-muted); }

      /* PENDING_RESEARCH option — special highlight when checked */
      #mcsa-pending-research-option { border: 1px solid transparent; border-radius: var(--radius); transition: border-color 0.2s, background 0.2s; }
      #mcsa-pending-research-option.active { border-color: var(--orange); background: rgba(255,153,0,0.07); }
      #mcsa-pending-research-option.active .option-text strong { color: var(--orange); }
      /* Overwrite disabled when PENDING_RESEARCH is active */
      .option.disabled { opacity: 0.4; pointer-events: none; }

      /* ── PROGRESS ── */
      .progress-section {
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 10px 12px;
        margin: 12px 0;
      }
      .progress-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 7px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--text-muted);
      }
      .progress-header span:last-child { color: var(--orange); font-weight: 700; }
      .progress-bar-wrap {
        height: 8px;
        background: var(--border);
        border-radius: 2px;
        overflow: hidden;
        border: 1px solid var(--border);
      }
      .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, var(--orange) 0%, #FFB84D 100%);
        border-radius: 2px;
        transition: width 0.3s ease;
        position: relative;
      }
      .progress-fill::after {
        content: '';
        position: absolute; right: 0; top: 0; bottom: 0;
        width: 3px;
        background: rgba(255,255,255,0.45);
      }

      /* ── ACTION BUTTONS ── */
      .action-buttons {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 6px;
        margin-top: 12px;
      }

      /* Amazon-style primary — orange gradient */
      .btn-amz-primary {
        background: linear-gradient(180deg, #FFB84D 0%, #FF9900 60%, #E88900 100%);
        border: 1px solid #A66300;
        color: var(--navy-dark);
        border-radius: var(--radius);
        cursor: pointer;
        font: 700 12px/1 'Amazon Ember', 'Helvetica Neue', Arial, sans-serif;
        padding: 8px 10px;
        display: flex; align-items: center; justify-content: center; gap: 5px;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.4);
        transition: background 0.15s, box-shadow 0.15s;
        letter-spacing: 0.02em;
      }
      .btn-amz-primary:hover {
        background: linear-gradient(180deg, #FFC368 0%, #FFB04D 60%, #FF9900 100%);
        box-shadow: 0 2px 6px rgba(255,153,0,0.35), inset 0 1px 0 rgba(255,255,255,0.4);
      }
      .btn-amz-primary.running {
        background: linear-gradient(180deg, #E57373 0%, #CC0C39 100%);
        border-color: #7B0020;
        color: #fff;
        box-shadow: none;
      }
      .btn-amz-primary.running:hover {
        background: linear-gradient(180deg, #EF5350 0%, #B71C1C 100%);
      }

      /* Amazon-style navy secondary */
      .btn-amz-navy {
        background: linear-gradient(180deg, var(--navy-light) 0%, var(--navy) 100%);
        border: 1px solid var(--navy-dark);
        color: #fff;
        border-radius: var(--radius);
        cursor: pointer;
        font: 700 12px/1 'Amazon Ember', 'Helvetica Neue', Arial, sans-serif;
        padding: 8px 10px;
        display: flex; align-items: center; justify-content: center; gap: 5px;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.1);
        transition: background 0.15s;
        letter-spacing: 0.02em;
      }
      .btn-amz-navy:hover {
        background: linear-gradient(180deg, #455869 0%, #2B3E4F 100%);
      }

      /* Tertiary grey */
      .btn-amz-secondary {
        background: linear-gradient(180deg, #F7F8FA 0%, #E8EAED 100%);
        border: 1px solid #ADB1B8;
        color: var(--text);
        border-radius: var(--radius);
        cursor: pointer;
        font: 600 12px/1 'Amazon Ember', 'Helvetica Neue', Arial, sans-serif;
        padding: 8px 10px;
        display: flex; align-items: center; justify-content: center; gap: 5px;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.9);
        transition: background 0.15s, border-color 0.15s;
        letter-spacing: 0.02em;
        font-family: inherit;
      }
      .btn-amz-secondary:hover { background: linear-gradient(180deg, #fff 0%, #F0F2F4 100%); border-color: var(--navy-light); }

      .btn-sm { padding: 5px 10px !important; font-size: 11px !important; }

      .btn-icon { font-size: 11px; }
      .btn-text { }

      /* ── SPACEBAR HINT ── */
      .spacebar-hint {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        margin-top: 10px;
      }
      .kbd-space {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--bg);
        border: 1px solid var(--border);
        border-bottom: 2px solid var(--navy);
        border-radius: var(--radius);
        padding: 3px 10px;
        font-size: 11px;
        font-family: 'Consolas', 'SF Mono', monospace;
        color: var(--navy);
        font-weight: 700;
        letter-spacing: 0.3px;
        box-shadow: 0 1px 2px rgba(0,0,0,0.06);
      }
      .kbd-label { font-size: 10px; color: var(--text-muted); }

      /* ── STATUS TAB ── */
      .status-card {
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 12px;
        margin-bottom: 12px;
      }
      .status-item {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 8px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--border-light);
      }
      .status-item.no-border { margin-bottom: 0; border-bottom: none; padding-bottom: 0; }
      .status-label { font-size: 11px; color: var(--text-muted); font-weight: 500; }
      .status-value { font-size: 12px; font-weight: 600; color: var(--navy); text-align: right; max-width: 60%; word-break: break-all; }
      .status-value.mono { font-family: 'Consolas', 'SF Mono', monospace; }
      .status-value.idle    { color: var(--text-muted); }
      .status-value.running { color: var(--orange); }
      .status-value.paused  { color: #d69e2e; }
      .status-value.error   { color: var(--red); }

      .quick-actions { display: flex; gap: 6px; }
      .quick-actions .btn-amz-secondary { flex: 1; font-size: 11px; }

      /* ── LOGS TAB ── */
      .logs-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
      }
      .logs-container {
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 8px 10px;
        max-height: 320px;
        overflow-y: auto;
        font-family: 'Consolas', 'SF Mono', monospace;
        font-size: 11px;
        line-height: 1.6;
      }
      .log-entry { padding: 3px 0; border-bottom: 1px solid var(--border-light); }
      .log-entry:last-child { border-bottom: none; }
      .log-time { color: var(--text-light); margin-right: 6px; font-size: 10px; }
      .log-message { color: var(--text); }
      .log-success .log-message { color: var(--green); }
      .log-error   .log-message { color: var(--red); }
      .log-warning .log-message { color: #d69e2e; }
      .log-info    .log-message { color: var(--blue); }
    `;
        document.head.appendChild(css);

        // =====================================================================
        // JS LOGIC — UI Initialization
        // =====================================================================
        const body = wrap.querySelector('#mcsa-body');
        const tabBtns = wrap.querySelectorAll('.tab-btn');
        const tabContents = wrap.querySelectorAll('.tab-content');

        // Tab management
        tabBtns.forEach(btn => {
            btn.onclick = () => {
                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
            };
        });

        // Panel open/close
        document.getElementById('mcsa-tab').onclick = () => {
            body.style.display = (body.style.display === 'none' || !body.style.display) ? 'flex' : 'none';
            updateStatusBadge();
        };
        document.getElementById('mcsa-close').onclick = () => { body.style.display = 'none'; };

        // Load saved values
        document.getElementById('mcsa-containers-ta').value = get(LS.containers) || '';
        document.getElementById('mcsa-asin').value = getASIN();
        const { y, m, d } = getYMD();
        document.getElementById('mcsa-year').value  = y || '';
        document.getElementById('mcsa-month').value = m || '';
        document.getElementById('mcsa-day').value   = d || '';
        document.getElementById('mcsa-overwrite').checked     = getOverwrite();
        document.getElementById('mcsa-notifications').checked = getNotifications();

        // PENDING_RESEARCH
        const pendingResearchCheck  = document.getElementById('mcsa-pending-research');
        const pendingResearchOption = document.getElementById('mcsa-pending-research-option');
        const overwriteLabel        = document.getElementById('mcsa-overwrite').closest('label');

        pendingResearchCheck.checked = getPendingResearch();

        function updatePendingResearchUI() {
            const isActive = pendingResearchCheck.checked;
            if (isActive) {
                pendingResearchOption.classList.add('active');
                // Overwrite is incompatible — disable and uncheck it
                overwriteLabel.classList.add('disabled');
                document.getElementById('mcsa-overwrite').checked = false;
                setOverwrite(false);
            } else {
                pendingResearchOption.classList.remove('active');
                overwriteLabel.classList.remove('disabled');
            }
        }
        updatePendingResearchUI();

        pendingResearchCheck.addEventListener('change', e => {
            setPendingResearch(e.target.checked);
            updatePendingResearchUI();
        });

        // Multi-ASIN
        const multiAsinCheck      = document.getElementById('mcsa-multi-asin');
        const singleAsinContainer = document.getElementById('mcsa-single-asin-container');
        const multiAsinContainer  = document.getElementById('mcsa-multi-asin-container');
        const asinTitle           = document.getElementById('mcsa-asin-title');
        const asinHint            = document.getElementById('mcsa-asin-hint');
        const multiAsinTa         = document.getElementById('mcsa-multi-asin-ta');

        multiAsinCheck.checked = getMultiAsinMode();
        multiAsinTa.value = getAsinList().join('\n');

        function updateAsinUIMode() {
            const isMulti = multiAsinCheck.checked;
            if (isMulti) {
                asinTitle.innerHTML = '📋 Multi-ASIN List';
                asinHint.textContent = '(one per line)';
                singleAsinContainer.style.display = 'none';
                multiAsinContainer.style.display = 'block';
            } else {
                asinTitle.innerHTML = '🏷️ Single ASIN';
                asinHint.textContent = '';
                singleAsinContainer.style.display = 'block';
                multiAsinContainer.style.display = 'none';
            }
        }
        updateAsinUIMode();

        multiAsinCheck.addEventListener('change', e => {
            setMultiAsinMode(e.target.checked);
            updateAsinUIMode();
            if (e.target.checked) updateMultiAsinCount();
        });
        multiAsinTa.addEventListener('input', e => {
            setAsinList(e.target.value);
            updateMultiAsinCount();
        });

        // Container input
        document.getElementById('mcsa-containers-ta').addEventListener('input', e => {
            set(LS.containers, e.target.value || '');
            updateContainerCount();
            updateProgress();
        });

        // Single ASIN
        document.getElementById('mcsa-asin').addEventListener('input', e => setASIN(e.target.value));
        document.getElementById('mcsa-clear-asin').onclick = () => {
            document.getElementById('mcsa-asin').value = '';
            setASIN('');
        };

        // Date inputs
        ['year', 'month', 'day'].forEach(field => {
            document.getElementById(`mcsa-${field}`).addEventListener('input', updateDatePreview);
        });

        // Options
        document.getElementById('mcsa-overwrite').addEventListener('change', e => setOverwrite(e.target.checked));
        document.getElementById('mcsa-notifications').addEventListener('change', e => setNotifications(e.target.checked));

        // Options dropdown
        const optionsToggle  = document.getElementById('mcsa-options-toggle');
        const optionsContent = document.getElementById('mcsa-options-content');
        const optionsArrow   = optionsToggle.querySelector('.dropdown-arrow');

        const isVisible_ = getOptionsVisible();
        if (isVisible_) {
            optionsToggle.classList.add('active');
            optionsContent.style.display = 'block';
            optionsContent.classList.add('show');
            optionsArrow.textContent = '▲';
        }

        optionsToggle.onclick = () => {
            const isOpen = optionsToggle.classList.contains('active');
            if (isOpen) {
                optionsToggle.classList.remove('active');
                optionsContent.style.display = 'none';
                optionsContent.classList.remove('show');
                optionsArrow.textContent = '▼';
                setOptionsVisible(false);
            } else {
                optionsToggle.classList.add('active');
                optionsContent.style.display = 'block';
                setTimeout(() => optionsContent.classList.add('show'), 10);
                optionsArrow.textContent = '▲';
                setOptionsVisible(true);
            }
        };

        // ── Helper UI functions ──
        function updateContainerCount() {
            const count = getContainersArr().length;
            document.getElementById('mcsa-container-count').textContent = count;
        }

        function updateMultiAsinCount() {
            const count = getAsinList().length;
            document.getElementById('mcsa-multi-asin-count').textContent = count;
        }

        function updateDatePreview() {
            const y = document.getElementById('mcsa-year').value;
            const m = document.getElementById('mcsa-month').value;
            const d = document.getElementById('mcsa-day').value;
            const preview = document.getElementById('mcsa-date-preview');
            if (y && m && d) {
                preview.textContent = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
                setYMD(y, m, d);
            } else {
                preview.textContent = 'Enter a complete date';
            }
        }

        function updateProgress() {
            const containers = getContainersArr();
            const current = getCIdx();
            const total = containers.length;

            // Current ASIN display
            const currentAsinSpan = document.getElementById('mcsa-current-asin');
            if (currentAsinSpan) {
                if (getMultiAsinMode()) {
                    const asinList = getAsinList();
                    const asinIdx  = getCurrentAsinIndex();
                    if (asinList.length > 0 && asinIdx < asinList.length) {
                        currentAsinSpan.textContent = `${asinList[asinIdx]} (${asinIdx+1}/${asinList.length})`;
                    } else {
                        currentAsinSpan.textContent = '-';
                    }
                } else {
                    currentAsinSpan.textContent = getASIN() || '-';
                }
            }

            if (total === 0) {
                document.getElementById('mcsa-progress-fill').style.width = '0%';
                document.getElementById('mcsa-progress-text').textContent = '0/0';
                if (document.getElementById('mcsa-progress-detail'))
                    document.getElementById('mcsa-progress-detail').textContent = '0/0 (0%)';
                return;
            }

            let percent, progressText;
            if (getMultiAsinMode() && getAsinList().length > 0) {
                const asinList   = getAsinList();
                const asinIdx    = getCurrentAsinIndex();
                const totalSteps = total * asinList.length;
                const currentStep = (current * asinList.length) + asinIdx;
                percent = Math.min(100, Math.round((currentStep / totalSteps) * 100));
                progressText = `Container ${current+1}/${total} — ASIN ${asinIdx+1}/${asinList.length}`;
            } else {
                percent = Math.min(100, Math.round((current / total) * 100));
                progressText = `${current}/${total}`;
            }

            document.getElementById('mcsa-progress-fill').style.width = `${percent}%`;
            document.getElementById('mcsa-progress-text').textContent = `${progressText} (${percent}%)`;
            if (document.getElementById('mcsa-progress-detail'))
                document.getElementById('mcsa-progress-detail').textContent = `${progressText} (${percent}%)`;

            if (document.getElementById('mcsa-current-container'))
                document.getElementById('mcsa-current-container').textContent = containers[current] || '-';
        }

        function updateStatusBadge() {
            const badge = document.getElementById('mcsa-status-badge');
            if (!badge) return;
            badge.className = 'status-badge ';
            const startBtn = document.getElementById('mcsa-start');
            if (getRunning()) {
                badge.classList.add('running');
                if (startBtn) { startBtn.classList.add('running'); startBtn.querySelector('.btn-text').textContent = 'Running'; }
            } else if (getSticky()) {
                badge.classList.add('paused');
                if (startBtn) { startBtn.classList.remove('running'); startBtn.querySelector('.btn-text').textContent = 'Resume'; }
            } else {
                badge.classList.add('stopped');
                if (startBtn) { startBtn.classList.remove('running'); startBtn.querySelector('.btn-text').textContent = 'Start'; }
            }
        }

        // ── Action functions ──
        function doPause(){
            setRunning(false);
            setSticky(false);
            setAdvancing(false);
            setStatus('Paused');
            updateStatusBadge();
        }

        function doReset(){
            setRunning(false);
            setSticky(false);
            set(LS.containers,'');
            setCIdx(0);
            setASIN('');
            setAsinList([]);
            setMultiAsinMode(false);
            setCurrentAsinIndex(0);
            setYMD('','','');
            set(LS.justSaved,'false');
            set(LS.advance,'0');
            setOverwrite(false);
            setNotifications(true);
            setOptionsVisible(false);
            setPendingResearch(false);

            document.getElementById('mcsa-containers-ta').value = '';
            document.getElementById('mcsa-asin').value = '';
            document.getElementById('mcsa-multi-asin').checked = false;
            document.getElementById('mcsa-multi-asin-ta').value = '';
            document.getElementById('mcsa-year').value = '';
            document.getElementById('mcsa-month').value = '';
            document.getElementById('mcsa-day').value = '';
            document.getElementById('mcsa-overwrite').checked = false;
            document.getElementById('mcsa-notifications').checked = true;
            document.getElementById('mcsa-pending-research').checked = false;
            updatePendingResearchUI();

            updateAsinUIMode();
            updateContainerCount();
            updateMultiAsinCount();
            updateDatePreview();
            updateProgress();
            setStatus('Complete reset');
            addLogEntry('Complete reset performed', 'info');
            updateStatusBadge();
        }

        function doStart(){
            const arr = getContainersArr();
            if (arr.length === 0) return setStatus('Enter at least one container (one per line)');
            if (getMultiAsinMode()) {
                if (getAsinList().length === 0) return setStatus('Enter at least one ASIN in the multi-ASIN list');
            } else {
                if (!getASIN()) return setStatus('Enter ASIN');
            }
            if (!parseDateInput()) return setStatus('Enter date (Year/Month/Day)');

            let idx = getCIdx();
            if (isNaN(idx) || idx < 0 || idx >= arr.length) { idx = 0; setCIdx(0); }
            setCurrentAsinIndex(0);
            setRunning(true);
            setSticky(true);
            setJustSaved(false);
            setAdvancing(false);
            updateProgress();
            updateStatusBadge();
            setStatus(`Started (resuming from ${idx+1}/${arr.length})`);
            addLogEntry(`Automation started with ${arr.length} containers`, 'success');
            debouncedAct();
        }

        // Button connections
        document.getElementById('mcsa-start').onclick  = doStart;
        document.getElementById('mcsa-pause').onclick  = doPause;
        document.getElementById('mcsa-reset').onclick  = doReset;

        document.getElementById('mcsa-skip').onclick = async () => {
            await goToNextContainer('manually skipped');
            addLogEntry('Container manually skipped', 'warning');
        };
        document.getElementById('mcsa-retry').onclick = () => {
            setStatus('Retrying current container...');
            addLogEntry('Retrying current container', 'info');
            debouncedAct();
        };
        document.getElementById('mcsa-clear-logs').onclick = () => {
            const logsContainer = document.getElementById('mcsa-logs');
            if (logsContainer) logsContainer.innerHTML = '';
            addLogEntry('Logs cleared', 'info');
        };

        // Spacebar toggle
        document.addEventListener('keydown', e => {
            if (e.code !== 'Space') return;
            const tag = (document.activeElement || {}).tagName || '';
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
            e.preventDefault();
            if (getRunning()) {
                doPause();
                addLogEntry('⏸ Paused via Spacebar', 'warning');
            } else {
                doStart();
                addLogEntry('▶ Started via Spacebar', 'success');
            }
        });

        // Initialize UI
        updateContainerCount();
        updateMultiAsinCount();
        updateDatePreview();
        updateProgress();
        updateStatusBadge();

        // Periodic refresh
        setInterval(updateProgress, 1000);
        setInterval(updateStatusBadge, 500);

        addLogEntry('Script loaded — Amazon Corporate Clean v5.1', 'success');
    }

    // =====================================================================
    // LOG FUNCTION (must be defined before injectPanel)
    // =====================================================================
    function addLogEntry(message, type = 'info') {
        const logsContainer = document.getElementById('mcsa-logs');
        if (!logsContainer) return;
        const time = new Date().toLocaleTimeString();
        const entry = document.createElement('div');
        entry.className = `log-entry log-${type}`;
        entry.innerHTML = `<span class="log-time">${time}</span><span class="log-message">${message}</span>`;
        logsContainer.prepend(entry);
        const entries = logsContainer.querySelectorAll('.log-entry');
        if (entries.length > 50) entries[entries.length - 1].remove();
        const lastAction = document.getElementById('mcsa-last-action');
        if (lastAction) lastAction.textContent = message;
    }

    // =====================================================================
    // ORIGINAL SCRIPT FUNCTIONS (automation logic — unchanged)
    // =====================================================================
    function updateCounters(){
        const total = getContainersArr().length;
        const idx = Math.min(getCIdx(), Math.max(0, total-1));
        const cEl = document.getElementById('mcsa-cnt');
        const tEl = document.getElementById('mcsa-total');
        if (cEl) cEl.textContent = total ? String(idx+1) : '0';
        if (tEl) tEl.textContent = String(total);
    }

    function isVisible(el){
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return !!(el.offsetParent !== null && r.width && r.height);
    }

    function findButtonByText(txts){
        const tokens = String(txts).toLowerCase().split('|').map(s=>s.trim()).filter(Boolean);
        const nodes = [
            ...document.querySelectorAll('button, input[type=button], input[type=submit], .a-button, .a-button .a-button-text')
        ];
        return nodes.find(el => {
            const t = (el.textContent || el.value || '').trim().toLowerCase();
            return isVisible(el) && tokens.some(tok => t.includes(tok));
        }) || null;
    }

    function clickContinue(fromEl){
        const hotkey = document.querySelector('input.a-button-input[data-aft-tool-hotkey="return"]');
        if (hotkey && isVisible(hotkey)) { hotkey.click(); return; }
        const form = fromEl ? fromEl.closest('form') : document.querySelector('form');
        if (form){
            const submit = form.querySelector('input[type=submit], button[type=submit], input.a-button-input');
            if (submit && isVisible(submit)) { submit.click(); return; }
        }
        const cont = findButtonByText('continue|continua|immetti|continua [immetti]');
        if (cont) cont.click();
    }

    const LABELS = {
        BARCODE:          /(item\s*barcode|codice a barre dell.?articolo)/i,
        CONTAINER_STRICT: /^(container|contenitore)\s*:?$/i,
        CONTAINER_ANY:    /(container|contenitore)/i,
    };

    const pageHasContainerId = () =>
        Array.from(document.querySelectorAll('dt.a-list-item, dt'))
            .some(dt => /(ContainerId|ID contenitore)/i.test(dt.textContent||''));

    function findContainerInput(){
        const labs = Array.from(document.querySelectorAll('label, label.a-form-label'));
        let lab = labs.find(l => LABELS.CONTAINER_STRICT.test((l.textContent || '').trim()));
        if (!lab) lab = labs.find(l => LABELS.CONTAINER_ANY.test((l.textContent || '').trim()));
        if (!lab) return null;
        const forId = lab.getAttribute('for');
        if (forId){
            const byId = document.getElementById(forId);
            if (byId && byId.tagName === 'INPUT' && byId.type === 'text') return byId;
        }
        const wrapper =
            lab.closest('.a-input-text-wrapper') ||
            lab.parentElement?.querySelector('.a-input-text-wrapper') ||
            lab.closest('div, fieldset, form');
        if (wrapper){
            const inp = wrapper.querySelector('input[type="text"]');
            if (inp) return inp;
        }
        return document.querySelector(
            'input[type="text"][id*="container" i], ' +
            'input[type="text"][name*="container" i], ' +
            'input[type="text"][placeholder*="container" i]'
        );
    }

    function isScanContainerPage() {
        const hasContainerLabel = Array
            .from(document.querySelectorAll('label, label.a-form-label'))
            .some(l => LABELS.CONTAINER_STRICT.test((l.textContent || '').trim()));
        const hasBarcodeLabel = Array
            .from(document.querySelectorAll('label, label.a-form-label'))
            .some(l => LABELS.BARCODE.test((l.textContent || '').trim()));
        return hasContainerLabel && !hasBarcodeLabel && !pageHasContainerId();
    }

    function findBarcodeInput(){
        const lab = Array.from(document.querySelectorAll('label, label.a-form-label'))
            .find(l => LABELS.BARCODE.test((l.textContent||'').trim()));
        if (lab){
            const form = lab.closest('form') || document;
            const inp = form.querySelector('input[type="text"]');
            if (inp) return inp;
        }
        return document.querySelector('form .a-input-text-wrapper input[type="text"]') ||
            Array.from(document.querySelectorAll('input[type="text"]')).find(i => i.offsetParent!==null) || null;
    }

    const isEnterExpirationPage      = () => !!(document.getElementById('year-input') && document.getElementById('month-input') && document.getElementById('day-input'));
    const isConfirmNewExpirationPage = () => !!findButtonByText('Save expiration date|Save expiry date|Salva data di scadenza');
    const isStartOverPage            = () => !!findButtonByText('Start over|Start again|Ricomincia|Inizia di nuovo');
    const isRemovalConfirmPage       = () => !!findButtonByText('Remove expiration date|Remove expiry date|Rimuovi data di scadenza');

    function isNotInContainerAlertVisible() {
        return Array.from(document.querySelectorAll('.a-alert-content, .a-box-inner'))
            .some(el => /(is not in the container|non è nel container)/i.test(el.textContent||''));
    }

    async function waitForReadyInputById(id, timeout=8000){
        const start = Date.now();
        while (Date.now()-start < timeout){
            const el = document.getElementById(id);
            if (el && el.offsetParent!==null && !el.disabled && !el.readOnly) return el;
            await wait(100);
        }
        return null;
    }

    function setValueOnce(el, val){
        if (!el) return;
        if (String(el.value||'')===String(val)) return;
        const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
        if (desc?.set) desc.set.call(el, String(val)); else el.value = String(val);
        el.dispatchEvent(new Event('input',{bubbles:true}));
        el.dispatchEvent(new Event('change',{bubbles:true}));
    }

    // goToNextContainer — Multi-ASIN cycle logic
    async function goToNextContainer(reason='') {
        if (isAdvancing()) return false;

        if (getMultiAsinMode()) {
            const asinList = getAsinList();
            const currentAsinIdx = getCurrentAsinIndex();

            if (currentAsinIdx + 1 < asinList.length) {
                setCurrentAsinIndex(currentAsinIdx + 1);
                setStatus(`Moving to next ASIN (${currentAsinIdx+2}/${asinList.length}) for same container`);
                addLogEntry(`Proceeding to next ASIN for current container`, 'info');
                const startOverBtn = findButtonByText('start over|start again|ricomincia|inizia di nuovo');
                if (startOverBtn) {
                    startOverBtn.click();
                    setStatus('Restarting for next ASIN...');
                }
                return true;
            }
        }

        setAdvancing(true);
        const newIdx = getCIdx() + 1;
        setCIdx(newIdx);
        setCurrentAsinIndex(0);

        const progressEl = document.getElementById('mcsa-progress-fill');
        if (progressEl) {
            const total = getContainersArr().length;
            if (total > 0) progressEl.style.width = `${Math.min(100, Math.round((newIdx/total)*100))}%`;
        }

        setStatus(`Moving to container ${newIdx+1}${reason ? ' — '+reason : ''}`);
        addLogEntry(`Container changed: ${newIdx+1} ${reason ? '('+reason+')' : ''}`, 'info');

        const btn = findButtonByText('change container|cambia container');
        if (btn) btn.click();
        return true;
    }

    async function handleEnterExpirationDate(){
        if (!isEnterExpirationPage()) return false;
        const yi = await waitForReadyInputById('year-input');
        const mi = await waitForReadyInputById('month-input');
        const di = await waitForReadyInputById('day-input');
        if (!yi || !mi || !di) return false;
        if (yi.value && mi.value && di.value) return false;
        const dt = parseDateInput(); if (!dt) return false;
        setValueOnce(yi, dt.y);
        setValueOnce(mi, dt.m);
        setValueOnce(di, dt.d);
        const btn = document.querySelector('input.a-button-input[data-aft-tool-hotkey="return"]');
        if (btn) btn.click(); else clickContinue(di);
        setStatus(`Date set: ${dt.y}-${dt.m}-${dt.d}`);
        addLogEntry(`Expiration date set: ${dt.y}-${dt.m}-${dt.d}`, 'success');
        return true;
    }

    // Detects "Seleziona uno stato dell'inventario" page with PENDING_RESEARCH text
    const isPendingResearchPage = () => {
        const bodyText = (document.body?.textContent || '').toLowerCase();
        return bodyText.includes('pending_research') &&
               !!findButtonByText('Riassegna a SELLABLE|Reassign to SELLABLE|SELLABLE [Y]');
    };

    async function handlePendingResearchSellable(){
        if (!getPendingResearch()) return false;
        if (!isPendingResearchPage()) return false;
        const sellableBtn = findButtonByText('Riassegna a SELLABLE|Reassign to SELLABLE|SELLABLE [Y]');
        if (sellableBtn) {
            sellableBtn.click();
            setStatus('Assigning SELLABLE [Y]...');
            addLogEntry('PENDING_RESEARCH → clicking Riassegna a SELLABLE [Y]', 'info');
            return true;
        }
        return false;
    }

    async function handleConfirmNewExpiration(){
        const saveBtn = findButtonByText('Save expiration date|Save expiry date|Salva data di scadenza');
        if (saveBtn) {
            saveBtn.click();
            setJustSaved(true);
            setStatus('Saving expiration...');
            addLogEntry('Saving expiration date in progress...', 'info');
            return true;
        }
        return false;
    }

    async function handleStartOverPage(){
        if (!isStartOverPage()) return false;
        const startOverBtn = findButtonByText('start over|start again|ricomincia|inizia di nuovo');
        if (startOverBtn) {
            startOverBtn.click();
            setStatus('Start over...');
            addLogEntry('Start over page', 'info');
            return true;
        }
        return false;
    }

    async function handleRemovalConfirm(){
        if (!isRemovalConfirmPage()) return false;
        if (getOverwrite()){
            const rm = findButtonByText('Remove expiration date|Remove expiry date|Rimuovi data di scadenza');
            if (rm) {
                rm.click();
                setStatus('Removing existing date...');
                addLogEntry('Removing existing expiration date', 'warning');
                return true;
            }
            const so = findButtonByText('start over|start again|ricomincia|inizia di nuovo');
            if (so) { so.click(); setStatus('Start over after removal...'); return true; }
            return false;
        } else {
            await goToNextContainer('skip remove');
            return true;
        }
    }

    async function act(){
        try {
            if (getSticky() && !getRunning()) setRunning(true);
            if (!getRunning()) return;

            const containers = getContainersArr();
            if (containers.length === 0){
                setStatus('Empty container list');
                setRunning(false);
                setSticky(false);
                return;
            }

            let idx = getCIdx();
            if (idx >= containers.length){
                setStatus('Completed: all containers');
                addLogEntry('All containers completed!', 'success');
                setRunning(false);
                setSticky(false);
                return;
            }
            const desiredContainer = containers[idx];

            if (await handleRemovalConfirm())           return;
            if (await handleEnterExpirationDate())      return;
            if (await handlePendingResearchSellable())  return;
            if (await handleConfirmNewExpiration())     return;
            if (await handleStartOverPage())            return;
            if (getJustSaved()) {
                setJustSaved(false);
                await goToNextContainer('after saving');
                return;
            }

            if (!pageHasContainerId()) {
                if (isScanContainerPage()) {
                    const ci = findContainerInput();
                    if (ci) {
                        if (ci.value !== desiredContainer) {
                            ci.focus();
                            setValueOnce(ci, desiredContainer);
                            await wait(80);
                            setAdvancing(false);
                            clickContinue(ci);
                            setStatus(`Container set: ${desiredContainer}`);
                            addLogEntry(`Container set: ${desiredContainer}`, 'info');
                        } else {
                            setAdvancing(false);
                            clickContinue(ci);
                        }
                    } else {
                        setStatus('"Container" field not found...');
                    }
                    return;
                }
            }

            const barcode = findBarcodeInput();
            if (!barcode){
                setStatus('Waiting for "Item barcode" field...');
                return;
            }
            if (isNotInContainerAlertVisible()) {
                await goToNextContainer('ASIN not in container');
                return;
            }

            if ((barcode.value||'').trim() === '') {
                barcode.focus();
                let currentAsin;
                if (getMultiAsinMode()) {
                    const asinList = getAsinList();
                    const asinIdx  = getCurrentAsinIndex();
                    currentAsin    = asinList[asinIdx] || getASIN();
                    const asinProgress = `ASIN ${asinIdx+1}/${asinList.length}`;
                    setStatus(`Container ${idx+1}/${containers.length} — ${asinProgress}: ${currentAsin}`);
                    addLogEntry(`Inserting ${asinProgress} (${currentAsin}) for container ${desiredContainer}`, 'info');
                } else {
                    currentAsin = getASIN();
                    setStatus(`Container ${idx+1}/${containers.length} — ASIN: ${currentAsin}`);
                    addLogEntry(`ASIN ${currentAsin} for container ${desiredContainer}`, 'info');
                }
                setValueOnce(barcode, currentAsin);
                await wait(50);
                clickContinue(barcode);
            }
        } catch (error) {
            console.error('Error in act():', error);
            setStatus('Error: ' + error.message);
            addLogEntry('ERROR: ' + error.message, 'error');
            setRunning(false);
        }
    }

    let t = null;
    function debouncedAct(){
        if (t) clearTimeout(t);
        t = setTimeout(async () => {
            try {
                if (getSticky() && !getRunning()) setRunning(true);
                if (getRunning()) await act();
            } catch(err) {
                console.error('Error in debouncedAct:', err);
                addLogEntry('ERROR debouncedAct: ' + err.message, 'error');
            }
        }, 220);
    }

    function startObserver(){
        new MutationObserver(() => { debouncedAct(); }).observe(document, {childList:true, subtree:true});
    }

    // =====================================================================
    // INITIALIZATION
    // =====================================================================
    injectPanel();
    startObserver();
    if (getSticky()) setRunning(true);
    setTimeout(debouncedAct, 300);
    addLogEntry('Script initialized — Amazon Corporate Clean v5.1', 'info');
})();