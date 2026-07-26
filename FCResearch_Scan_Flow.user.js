// ==UserScript==
// @name         v0.7 FCResearch Scan Flow
// @namespace    https://gist.github.com/1Sirkkris
// @version      0.7
// @description  Scan item, then container, then immediately return to the next item.
// @author       ChatGPT
// @include      /^https?:\/\/.*fcresearch.*\//
// @include      /^https?:\/\/qifcr\.fe\.aftx\.amazonoperations\.app\//
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/FCResearch_Scan_Flow.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/FCResearch_Scan_Flow.user.js
// ==/UserScript==

(function () {
    'use strict';

    const VERSION = '0.7';
    const STATE_KEY = 'fcrScanFlowModeV1';
    const MIN_KEY = 'fcrScanFlowMinimizedV1';
    const MODE_ITEM = 'ITEM';
    const MODE_CONTAINER = 'CONTAINER';
    const WAIT_TIMEOUT_MS = 30000;

    // Only show on FCResearch results pages.
    if (!/\/results\/?$/i.test(window.location.pathname)) return;

    let mode = sessionStorage.getItem(STATE_KEY) === MODE_CONTAINER
        ? MODE_CONTAINER
        : MODE_ITEM;

    let busy = false;
    let overlay;
    let scanInput;
    let modeLabel;
    let statusLabel;
    let minimizeButton;
    let openButton;
    let statusTimer;

    injectStyles();
    buildOverlay();
    setMode(mode, false);

    if (mode === MODE_CONTAINER) {
        prepareContainerStep();
    } else {
        setStatus('Scan item', 'ready');
        focusScannerSoon();
    }

    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #fcrScanFlowOverlay {
                position: fixed;
                top: 8px;
                left: 210px;
                width: 408px;
                height: 38px;
                box-sizing: border-box;
                z-index: 1000000;
                padding: 3px;
                background: #111827;
                border: 1px solid #0f172a;
                border-radius: 8px;
                box-shadow: 0 4px 14px rgba(0,0,0,.28);
                overflow: visible;
                font-family: Arial, Helvetica, sans-serif;
                color: #111827;
            }

            #fcrScanFlowMain {
                display: flex;
                align-items: center;
                gap: 4px;
                width: 100%;
                height: 100%;
            }

            #fcrScanFlowOverlay.minimized {
                width: 62px;
                height: 34px;
                padding: 2px;
            }

            #fcrScanFlowOverlay.minimized #fcrScanFlowMain {
                display: none;
            }

            #fcrScanFlowOpen {
                display: none;
                width: 100%;
                height: 100%;
                border: 0;
                border-radius: 6px;
                font-size: 10px;
                font-weight: 900;
                cursor: pointer;
                white-space: nowrap;
            }

            #fcrScanFlowOverlay.minimized #fcrScanFlowOpen {
                display: block;
            }

            #fcrScanFlowOpen.item {
                background: #f59e0b;
                color: #111827;
            }

            #fcrScanFlowOpen.container {
                background: #16a34a;
                color: #ffffff;
            }

            #fcrScanFlowMode {
                flex: 0 0 84px;
                height: 30px;
                box-sizing: border-box;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 6px;
                padding: 0 7px;
                text-align: center;
                font-size: 12px;
                font-weight: 900;
                letter-spacing: .2px;
                cursor: pointer;
                user-select: none;
            }

            #fcrScanFlowMode.item {
                background: #f59e0b;
                color: #111827;
            }

            #fcrScanFlowMode.container {
                background: #16a34a;
                color: #ffffff;
            }

            #fcrScanFlowInput {
                flex: 1 1 auto;
                min-width: 0;
                height: 30px;
                box-sizing: border-box;
                border: 1px solid #64748b;
                border-radius: 6px;
                padding: 4px 8px;
                background: #ffffff;
                color: #111827;
                font-size: 13px;
                font-weight: 800;
                outline: none;
            }

            #fcrScanFlowInput:focus {
                border-color: #2563eb;
                box-shadow: 0 0 0 2px rgba(37,99,235,.25);
            }

            #fcrScanFlowReset,
            #fcrScanFlowMin {
                flex: 0 0 auto;
                height: 30px;
                border: 1px solid #64748b;
                border-radius: 6px;
                background: #f3f4f6;
                color: #111827;
                font-size: 10px;
                font-weight: 900;
                cursor: pointer;
                padding: 0 7px;
            }

            #fcrScanFlowMin {
                width: 28px;
                padding: 0;
                font-size: 17px;
                line-height: 1;
            }

            #fcrScanFlowReset:hover,
            #fcrScanFlowMin:hover {
                background: #e5e7eb;
            }

            #fcrScanFlowStatus {
                position: absolute;
                top: calc(100% + 5px);
                left: 0;
                max-width: 330px;
                box-sizing: border-box;
                padding: 5px 8px;
                border-radius: 6px;
                box-shadow: 0 3px 10px rgba(0,0,0,.24);
                background: #ffffff;
                font-size: 11px;
                font-weight: 800;
                white-space: nowrap;
                pointer-events: none;
            }

            #fcrScanFlowStatus.hidden { display: none; }
            #fcrScanFlowStatus.working {
                color: #92400e;
                border: 1px solid #f59e0b;
            }
            #fcrScanFlowStatus.success {
                color: #166534;
                border: 1px solid #22c55e;
            }
            #fcrScanFlowStatus.error {
                color: #991b1b;
                border: 1px solid #ef4444;
            }

            #fcrScanFlowOverlay.positive-flash {
                animation: fcrScanFlowPositivePulse 650ms ease-out;
            }

            #fcrScanFlowPageFlash {
                position: fixed;
                inset: 0;
                z-index: 999999;
                pointer-events: none;
                opacity: 0;
                background: rgba(34,197,94,.20);
                box-shadow:
                    inset 0 0 0 10px rgba(22,163,74,.92),
                    inset 0 0 70px rgba(34,197,94,.38);
            }

            #fcrScanFlowPageFlash.active {
                animation: fcrScanFlowPagePositive 1200ms linear;
            }

            #table-inventory tr.fcr-scan-flow-hit,
            #table-inventory tr.fcr-scan-flow-hit > td {
                background-color: #d1fae5 !important;
            }

            #table-inventory tr.fcr-scan-flow-hit {
                box-shadow: inset 5px 0 0 #16a34a;
            }

            @keyframes fcrScanFlowPositivePulse {
                0% {
                    border-color: #22c55e;
                    box-shadow:
                        0 0 0 4px rgba(34,197,94,.28),
                        0 4px 14px rgba(0,0,0,.28);
                }
                100% {
                    border-color: #0f172a;
                    box-shadow: 0 4px 14px rgba(0,0,0,.28);
                }
            }

            @keyframes fcrScanFlowPagePositive {
                0%   { opacity: 0; }
                7%   { opacity: 1; }
                19%  { opacity: 0; }
                34%  { opacity: 1; }
                46%  { opacity: 0; }
                61%  { opacity: 1; }
                75%  { opacity: 0; }
                100% { opacity: 0; }
            }

            @media (max-width: 1050px) {
                #fcrScanFlowOverlay:not(.minimized) {
                    width: 360px;
                }

                #fcrScanFlowMode {
                    flex-basis: 74px;
                    font-size: 11px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function buildOverlay() {
        overlay = document.createElement('div');
        overlay.id = 'fcrScanFlowOverlay';
        overlay.title = `FCResearch Scan Flow v${VERSION}`;

        overlay.innerHTML = `
            <div id="fcrScanFlowMain">
                <div id="fcrScanFlowMode" title="Click to refocus scanner"></div>
                <input
                    id="fcrScanFlowInput"
                    type="text"
                    autocomplete="off"
                    autocapitalize="off"
                    spellcheck="false"
                >
                <button type="button" id="fcrScanFlowReset" title="Reset workflow to item">Reset</button>
                <button type="button" id="fcrScanFlowMin" title="Minimize">−</button>
            </div>
            <button type="button" id="fcrScanFlowOpen" title="Open Scan Flow"></button>
            <div id="fcrScanFlowStatus" class="hidden"></div>
        `;

        document.body.appendChild(overlay);

        const pageFlash = document.createElement('div');
        pageFlash.id = 'fcrScanFlowPageFlash';
        document.body.appendChild(pageFlash);

        scanInput = document.getElementById('fcrScanFlowInput');
        modeLabel = document.getElementById('fcrScanFlowMode');
        statusLabel = document.getElementById('fcrScanFlowStatus');
        minimizeButton = document.getElementById('fcrScanFlowMin');
        openButton = document.getElementById('fcrScanFlowOpen');

        scanInput.addEventListener('keydown', function (event) {
            if (event.key !== 'Enter') return;

            event.preventDefault();
            event.stopPropagation();

            const value = cleanScan(scanInput.value);
            if (!value || busy) return;

            handleScan(value);
        }, true);

        document.getElementById('fcrScanFlowReset').addEventListener('click', function () {
            busy = false;
            scanInput.value = '';
            setMode(MODE_ITEM, true);
            setStatus('Reset to item', 'success');
            focusScannerSoon();
        });

        minimizeButton.addEventListener('click', function () {
            setMinimized(true);
        });

        openButton.addEventListener('click', function () {
            setMinimized(false);
            focusScannerSoon();
        });

        // Clicking the mode badge quickly returns scanner focus.
        modeLabel.addEventListener('click', focusScannerSoon);

        setMinimized(loadMinimizedState(), false);

        window.addEventListener('resize', positionOverlayNearSearch, true);
        window.setTimeout(positionOverlayNearSearch, 0);
        window.setTimeout(positionOverlayNearSearch, 250);
        window.setTimeout(positionOverlayNearSearch, 1000);

        const topSearch = document.querySelector('#search');
        if (topSearch && window.ResizeObserver) {
            const observer = new ResizeObserver(positionOverlayNearSearch);
            observer.observe(topSearch);
        }
    }

    function loadMinimizedState() {
        try {
            return GM_getValue(MIN_KEY, false) === true;
        } catch (_) {
            return localStorage.getItem(MIN_KEY) === '1';
        }
    }

    function saveMinimizedState(minimized) {
        try {
            GM_setValue(MIN_KEY, minimized);
        } catch (_) {
            localStorage.setItem(MIN_KEY, minimized ? '1' : '0');
        }
    }

    function setMinimized(minimized, save = true) {
        overlay.classList.toggle('minimized', minimized);

        if (save) {
            saveMinimizedState(minimized);
        }

        // A minimized helper must never keep or steal keyboard focus.
        if (minimized && overlay.contains(document.activeElement)) {
            document.activeElement.blur();
        }

        positionOverlayNearSearch();
    }

    function positionOverlayNearSearch() {
        if (!overlay) return;

        const topSearch = document.querySelector('#search');
        if (!topSearch) return;

        const rect = topSearch.getBoundingClientRect();
        const overlayWidth = overlay.classList.contains('minimized') ? 62 : overlay.offsetWidth || 408;
        const overlayHeight = overlay.offsetHeight || 38;

        let left = rect.left - overlayWidth - 8;
        let top = rect.top + Math.round((rect.height - overlayHeight) / 2);

        // Fallback when the page is too narrow to fit beside the FCResearch search.
        if (left < 8) {
            left = 8;
            top = Math.max(8, rect.bottom + 6);
        }

        overlay.style.left = `${Math.round(left)}px`;
        overlay.style.top = `${Math.max(4, Math.round(top))}px`;
    }

    function cleanScan(value) {
        return String(value || '')
            .replace(/\r?\n/g, '')
            .trim();
    }

    function handleScan(value) {
        if (mode === MODE_ITEM) {
            processItem(value);
        } else {
            processContainer(value);
        }
    }

    function processItem(item) {
        busy = true;
        scanInput.value = '';
        setStatus('Opening item inventory...', 'working');

        // Survives the results-page reload in this tab.
        sessionStorage.setItem(STATE_KEY, MODE_CONTAINER);

        const url = new URL(window.location.href);
        url.searchParams.set('s', item);

        // Keep the product panel visible after loading the next item.
        // The Inventory filter works off-screen, so no page jump is needed.
        url.hash = '';

        window.location.assign(url.toString());
    }

    async function prepareContainerStep() {
        busy = true;
        setMode(MODE_CONTAINER, false);
        setStatus('Loading Inventory...', 'working');

        const ready = await waitForInventorySearch(WAIT_TIMEOUT_MS);

        if (!ready) {
            busy = false;
            setStatus('Inventory search not found. Reset to item and retry.', 'error');
            focusScannerSoon();
            return;
        }

        busy = false;
        setStatus('Scan container', 'ready');
        focusScannerSoon();
    }

    async function processContainer(container) {
        busy = true;
        scanInput.value = '';
        setStatus('Filtering Inventory...', 'working');

        let searchBox = findInventorySearchInput();

        if (!searchBox) {
            searchBox = await waitForInventorySearch(6000);
        }

        if (!searchBox) {
            busy = false;
            setStatus('Inventory search not found. Container not applied.', 'error');
            focusScannerSoon();
            return;
        }

        applyInventoryFilter(searchBox, container);

        const matchingRows = await waitForMatchingInventoryRows(container, 1600);

        if (!matchingRows.length) {
            busy = false;
            setMode(MODE_ITEM, true);
            setStatus('No matching container. Scan next item', 'error');
            focusScannerSoon();
            return;
        }

        flashPositiveResult(matchingRows);

        busy = false;
        setMode(MODE_ITEM, true);
        setStatus('✓ Container found. Scan next item', 'success');
        focusScannerSoon();
    }

    function findMatchingInventoryRows(container) {
        const table = findInventoryTable();
        if (!table) return [];

        const wanted = cleanScan(container).toUpperCase();

        return Array.from(table.querySelectorAll('tbody tr')).filter(function (row) {
            if (!row.cells || !row.cells.length) return false;
            if (!row.getClientRects().length) return false;

            const firstCell = cleanScan(row.cells[0].textContent).toUpperCase();
            return firstCell === wanted;
        });
    }

    function waitForMatchingInventoryRows(container, timeoutMs) {
        return new Promise(function (resolve) {
            const started = Date.now();

            function check() {
                const rows = findMatchingInventoryRows(container);

                if (rows.length) {
                    resolve(rows);
                    return;
                }

                if (Date.now() - started >= timeoutMs) {
                    resolve([]);
                    return;
                }

                window.setTimeout(check, 80);
            }

            check();
        });
    }

    function flashPositiveResult(rows) {
        const pageFlash = document.getElementById('fcrScanFlowPageFlash');

        overlay.classList.remove('positive-flash');
        if (pageFlash) pageFlash.classList.remove('active');

        // Restart both animations even during rapid consecutive scans.
        void overlay.offsetWidth;
        overlay.classList.add('positive-flash');

        if (pageFlash) {
            void pageFlash.offsetWidth;
            pageFlash.classList.add('active');
        }

        rows.forEach(function (row) {
            row.classList.add('fcr-scan-flow-hit');
        });

        window.setTimeout(function () {
            overlay.classList.remove('positive-flash');
            if (pageFlash) pageFlash.classList.remove('active');

            rows.forEach(function (row) {
                row.classList.remove('fcr-scan-flow-hit');
            });
        }, 1300);
    }

    function setMode(nextMode, save) {
        mode = nextMode;

        if (save) {
            sessionStorage.setItem(STATE_KEY, mode);
        }

        modeLabel.className = '';
        openButton.className = '';

        if (mode === MODE_ITEM) {
            modeLabel.textContent = 'ITEM';
            modeLabel.classList.add('item');
            openButton.textContent = 'SF ITEM';
            openButton.classList.add('item');
            scanInput.placeholder = 'Scan ASIN / FNSKU';
        } else {
            modeLabel.textContent = 'CONTAINER';
            modeLabel.classList.add('container');
            openButton.textContent = 'SF CONT';
            openButton.classList.add('container');
            scanInput.placeholder = 'Scan container';
        }

        positionOverlayNearSearch();
    }

    function setStatus(text, type) {
        window.clearTimeout(statusTimer);

        statusLabel.textContent = text || '';
        statusLabel.className = '';

        if (!text || type === 'ready') {
            statusLabel.classList.add('hidden');
            return;
        }

        statusLabel.classList.add(type || 'working');

        if (type === 'success' || type === 'error') {
            statusTimer = window.setTimeout(function () {
                statusLabel.classList.add('hidden');
            }, type === 'error' ? 3000 : 1800);
        }
    }

    function focusScannerSoon() {
        window.setTimeout(function () {
            if (!overlay || overlay.classList.contains('minimized')) return;
            scanInput.focus();
            scanInput.select();
        }, 60);
    }

    function findInventoryTable() {
        return document.querySelector('#table-inventory') ||
               document.querySelector('[data-section-type="inventory"] table');
    }

    function findInventorySection() {
        const table = findInventoryTable();

        if (table) {
            return table.closest('[data-section-type="inventory"]') ||
                   table.closest('.a-box') ||
                   table.closest('section') ||
                   table.parentElement;
        }

        const nav = document.getElementById('inventory-nav');
        if (nav) {
            return nav.closest('[data-section-type="inventory"]') ||
                   nav.closest('.a-box') ||
                   nav.closest('section') ||
                   nav.parentElement ||
                   nav;
        }

        return null;
    }

    function findInventorySearchInput() {
        const directSelectors = [
            '#table-inventory_filter input',
            '#table-inventory_wrapper input[type="search"]',
            'input[aria-controls="table-inventory"]'
        ];

        for (const selector of directSelectors) {
            const input = document.querySelector(selector);
            if (isUsableInventoryInput(input)) return input;
        }

        const section = findInventorySection();
        if (!section) return null;

        const candidates = Array.from(section.querySelectorAll('input'));

        return candidates.find(function (input) {
            return isUsableInventoryInput(input);
        }) || null;
    }

    function isUsableInventoryInput(input) {
        if (!input || input.id === 'search' || input.disabled) return false;

        const type = String(input.type || 'text').toLowerCase();
        if (type !== 'text' && type !== 'search') return false;

        const controls = String(input.getAttribute('aria-controls') || '');
        if (controls && /table-inventory/i.test(controls)) return true;

        const section = findInventorySection();
        return !!(section && section.contains(input));
    }

    function waitForInventorySearch(timeoutMs) {
        return new Promise(function (resolve) {
            const immediate = findInventorySearchInput();
            if (immediate) {
                resolve(immediate);
                return;
            }

            const started = Date.now();

            const timer = window.setInterval(function () {
                const found = findInventorySearchInput();

                if (found) {
                    window.clearInterval(timer);
                    resolve(found);
                    return;
                }

                if (Date.now() - started >= timeoutMs) {
                    window.clearInterval(timer);
                    resolve(null);
                }
            }, 200);
        });
    }

    function scrollToInventory() {
        const target = document.getElementById('inventory-nav') ||
                       findInventorySection() ||
                       findInventoryTable();

        if (!target) return;

        try {
            target.scrollIntoView({
                behavior: 'auto',
                block: 'start'
            });

            // Keep the Inventory heading clear of FCResearch's fixed top bar.
            window.setTimeout(function () {
                window.scrollBy(0, -76);
            }, 30);
        } catch (_) {}
    }

    function setNativeInputValue(input, value) {
        const descriptor = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value'
        );

        if (descriptor && descriptor.set) {
            descriptor.set.call(input, value);
        } else {
            input.value = value;
        }
    }

    function applyInventoryFilter(searchBox, container) {
        setNativeInputValue(searchBox, container);

        searchBox.dispatchEvent(new Event('input', {
            bubbles: true
        }));

        searchBox.dispatchEvent(new Event('change', {
            bubbles: true
        }));

        searchBox.dispatchEvent(new Event('search', {
            bubbles: true
        }));

        searchBox.dispatchEvent(new KeyboardEvent('keyup', {
            bubbles: true,
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13
        }));

        // Extra reliability when the inventory table is powered by jQuery DataTables.
        try {
            const jq = window.jQuery;
            const table = findInventoryTable();

            if (
                jq &&
                table &&
                jq.fn &&
                jq.fn.dataTable &&
                jq.fn.dataTable.isDataTable(table)
            ) {
                jq(table).DataTable().search(container).draw();
            }
        } catch (error) {
            console.debug('Scan Flow DataTables fallback skipped:', error);
        }
    }
})();
