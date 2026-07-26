// ==UserScript==
// @name         FCResearch → RIVER Ticket Assistant v0.2.13
// @namespace    bwu2-ticket-assistant
// @version      0.2.13
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/FCResearch_RIVER_Ticket_Assistant.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/FCResearch_RIVER_Ticket_Assistant.js
// @description  Runs the RIVER core, reads the newest PO/vendor directly, and launches from the PanDash L0 badge.
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

    const STORAGE_KEY = 'bwu2_ticket_assistant_payload_v3';
    const RIVER_URL = 'https://river.amazon.com/BWU2/workflows?buildingType=fc&q0=3654ec14-7232-4f65-84c3-87927cdb4d0c&q1=0dbb253e-c43a-4a8b-a316-e32b8ab9be21&id=0dbb253e-c43a-4a8b-a316-e32b8ab9be21';
    const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
    const norm = value => clean(value).toLowerCase();

    function findLabelValue(names, root = document) {
        const wanted = names.map(norm);
        for (const row of root.querySelectorAll('tr')) {
            const cells = [...row.querySelectorAll(':scope > th, :scope > td')];
            if (cells.length < 2) continue;
            if (!wanted.includes(norm(cells[0].textContent))) continue;
            const link = cells[1].querySelector('a');
            return clean(link?.textContent || cells[1].textContent);
        }
        return '';
    }

    function headerMap(table) {
        let best = [];
        let score = -1;
        for (const row of table.querySelectorAll('tr')) {
            const cells = [...row.children].filter(node => node.matches?.('th,td'));
            const names = cells.map(cell => norm(cell.textContent));
            const current = ['purchase order', 'inventory owner', 'placed', 'confirmed', 'vendor code']
                .filter(name => names.some(text => text === name || text.startsWith(`${name} `))).length;
            if (current > score) {
                score = current;
                best = cells;
            }
        }
        return best.map(cell => norm(cell.textContent));
    }

    function findIndex(headers, names) {
        const wanted = names.map(norm);
        return headers.findIndex(header => wanted.some(name => header === name || header.startsWith(`${name} `)));
    }

    function parseDate(value) {
        const text = clean(value).replace(' ', 'T');
        const parsed = Date.parse(text);
        return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
    }

    function newestPOFromMainTable() {
        const tables = [...document.querySelectorAll('table')];
        let bestTable = null;
        let bestHeaders = null;

        for (const table of tables) {
            const headers = headerMap(table);
            if (findIndex(headers, ['Purchase Order']) < 0) continue;
            if (findIndex(headers, ['Inventory Owner']) < 0) continue;
            if (findIndex(headers, ['Placed', 'Confirmed']) < 0) continue;
            bestTable = table;
            bestHeaders = headers;
            break;
        }

        if (!bestTable) return null;
        const poIndex = findIndex(bestHeaders, ['Purchase Order']);
        const ownerIndex = findIndex(bestHeaders, ['Inventory Owner']);
        const placedIndex = findIndex(bestHeaders, ['Placed']);
        const confirmedIndex = findIndex(bestHeaders, ['Confirmed']);
        const candidates = [];

        for (const row of bestTable.querySelectorAll('tbody tr, tr')) {
            const cells = [...row.children].filter(node => node.matches?.('th,td'));
            if (cells.length <= Math.max(poIndex, ownerIndex, placedIndex, confirmedIndex)) continue;
            const po = clean(cells[poIndex]?.textContent);
            if (!/^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{6,20}$/i.test(po)) continue;
            const link = cells[poIndex]?.querySelector('a');
            const placed = clean(cells[placedIndex]?.textContent);
            const confirmed = clean(cells[confirmedIndex]?.textContent);
            candidates.push({
                po,
                inventoryOwner: clean(cells[ownerIndex]?.textContent),
                orderDate: placed || confirmed,
                timestamp: Math.max(parseDate(placed), parseDate(confirmed)),
                href: link?.href || link?.getAttribute('href') || ''
            });
        }

        candidates.sort((a, b) => b.timestamp - a.timestamp);
        return candidates[0] || null;
    }

    function vendorFromCurrentPOItems(po) {
        for (const table of document.querySelectorAll('table')) {
            const headers = headerMap(table);
            const poIndex = findIndex(headers, ['Purchase Order']);
            const vendorIndex = findIndex(headers, ['Vendor Code']);
            if (poIndex < 0 || vendorIndex < 0) continue;

            for (const row of table.querySelectorAll('tbody tr, tr')) {
                const cells = [...row.children].filter(node => node.matches?.('th,td'));
                if (clean(cells[poIndex]?.textContent) !== po) continue;
                const vendor = clean(cells[vendorIndex]?.textContent);
                if (vendor && norm(vendor) !== 'vendor code') return vendor;
            }
        }
        return '';
    }

    async function vendorFromPOPage(poInfo) {
        if (!poInfo?.href) return '';
        try {
            const response = await fetch(new URL(poInfo.href, location.href), {
                credentials: 'include',
                cache: 'no-store'
            });
            if (!response.ok) return '';
            const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
            return findLabelValue(['Vendor Code'], doc);
        } catch (error) {
            console.warn('[Ticket Assistant] PO peek failed:', error);
            return '';
        }
    }

    function inventoryQuantity() {
        const table = document.querySelector('#table-inventory');
        if (!table) return 0;
        const wrapper = table.closest('.dataTables_wrapper') || table.parentElement;
        for (const heading of wrapper?.querySelectorAll('th') || []) {
            const match = clean(heading.textContent).match(/^quantity\s*\(([\d,]+)\)/i);
            if (match) return Number(match[1].replace(/,/g, '')) || 0;
        }
        return [...table.querySelectorAll('tbody tr')].reduce((total, row) => {
            const numbers = [...row.children].map(cell => Number(clean(cell.textContent).replace(/,/g, '')));
            return total + (numbers.find(Number.isFinite) || 0);
        }, 0);
    }

    function formatCost(value) {
        const text = clean(value);
        if (!text) return 'n/a';
        if (/^AUD\b/i.test(text)) return text;
        const match = text.match(/\d+(?:,\d{3})*(?:\.\d+)?/);
        return match ? `AUD ${match[0].replace(/,/g, '')}` : text;
    }

    async function captureImprovedPayload() {
        const asin = findLabelValue(['ASIN']);
        const foundFnsku = findLabelValue(['FNSku', 'FNSKU']);
        const fnsku = /^X0[A-Z0-9]+$/i.test(foundFnsku) ? foundFnsku : '';
        const title = findLabelValue(['Title']);
        const sortableText = norm(findLabelValue(['Sortable']));
        const sortable = sortableText === 'true' || sortableText === 'yes';
        const newest = newestPOFromMainTable();

        if (!asin) throw new Error('ASIN not found.');
        if (!title) throw new Error('Title not found.');

        let vendorCode = newest ? vendorFromCurrentPOItems(newest.po) : '';
        if (!vendorCode && newest) vendorCode = await vendorFromPOPage(newest);
        if (!vendorCode && newest?.inventoryOwner) {
            vendorCode = newest.inventoryOwner.replace(/_FBA$/i, '');
        }

        return {
            asin,
            fnsku,
            processingId: fnsku || asin,
            title,
            purchaseOrder: newest?.po || 'n/a - no PO available',
            vendorCode: vendorCode || 'n/a',
            inventoryCost: formatCost(findLabelValue(['List Price'])),
            physicalLocation: 'N/A',
            orderDate: newest?.orderDate || '',
            sortable,
            inventoryQuantity: inventoryQuantity(),
            shipmentsImpacted: 0,
            sourceUrl: location.href,
            capturedAt: Date.now()
        };
    }

    function installFCResearchLaunch() {
        let busy = false;
        const launchFromL0 = async event => {
            if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
            const badge = event.target instanceof Element
                ? event.target.closest('[data-section-type="product"] .fc-hazmat.fc-river-l0')
                : null;
            if (!badge || busy) return;

            event.preventDefault();
            event.stopImmediatePropagation();
            busy = true;
            badge.setAttribute('aria-busy', 'true');

            try {
                const payload = await captureImprovedPayload();
                GM_setValue(STORAGE_KEY, payload);
                GM_openInTab(RIVER_URL, { active: true, insert: true, setParent: true });
            } catch (error) {
                console.error('[Ticket Assistant] launch failed:', error);
                alert(`RIVER Ticket Assistant failed: ${error.message}`);
            } finally {
                busy = false;
                badge.removeAttribute('aria-busy');
            }
        };

        document.addEventListener('click', launchFromL0, true);
        document.addEventListener('keydown', launchFromL0, true);
    }

    function installFinalStepSafetyNet() {
        let advancing = false;
        let lastAdvanceAttempt = 0;

        const nativeSelectSetter = Object.getOwnPropertyDescriptor(
            HTMLSelectElement.prototype,
            'value'
        )?.set;

        const selectYesReliably = select => {
            const yes = [...select.options].find(option => norm(option.textContent) === 'yes');
            if (!yes) return false;

            if (nativeSelectSetter) nativeSelectSetter.call(select, yes.value);
            else select.value = yes.value;
            yes.selected = true;
            select.selectedIndex = yes.index;
            select.dispatchEvent(new Event('input', { bubbles: true }));
            select.dispatchEvent(new Event('change', { bubbles: true }));
            select.dispatchEvent(new KeyboardEvent('keyup', {
                bubbles: true,
                key: 'Enter',
                code: 'Enter'
            }));

            const selected = select.options[select.selectedIndex];
            return select.value === yes.value && norm(selected?.textContent) === 'yes';
        };

        const findNext = () => [...document.querySelectorAll(
            'button, input[type="button"], input[type="submit"], a'
        )].find(element => {
            const text = norm(element.innerText || element.value || element.textContent || element.getAttribute('aria-label'));
            return text === 'next';
        });

        const nextIsReady = next => Boolean(
            next
            && next.isConnected
            && !next.disabled
            && next.getAttribute('aria-disabled') !== 'true'
            && !next.classList.contains('disabled')
        );

        const run = async () => {
            const pageText = norm(document.body?.innerText);
            if (!pageText.includes('images instruction and check window')) return;
            if (advancing) return;

            const select = [...document.querySelectorAll('select')].find(item =>
                [...item.options].some(option => norm(option.textContent) === 'yes')
            );
            if (!select) return;

            advancing = true;
            try {
                let selected = false;
                for (let attempt = 0; attempt < 6; attempt += 1) {
                    selected = selectYesReliably(select);
                    await new Promise(resolve => setTimeout(resolve, 180 + attempt * 70));
                    const current = select.options[select.selectedIndex];
                    if (selected && norm(current?.textContent) === 'yes') break;
                }
                if (!selected) return;

                const deadline = Date.now() + 8000;
                while (Date.now() < deadline) {
                    const next = findNext();
                    if (nextIsReady(next)) {
                        lastAdvanceAttempt = Date.now();
                        next.click();
                        await new Promise(resolve => setTimeout(resolve, 500));

                        if (!norm(document.body?.innerText).includes('images instruction and check window')) {
                            return;
                        }
                    }
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            } finally {
                advancing = false;
            }
        };

        const observer = new MutationObserver(() => void run());
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['disabled', 'aria-disabled', 'class', 'value']
        });

        setInterval(() => {
            if (Date.now() - lastAdvanceAttempt > 600) void run();
        }, 400);
        void run();
    }

    if (/fcresearch|qifcr/i.test(location.hostname)) installFCResearchLaunch();
    else if (location.hostname === 'river.amazon.com') installFinalStepSafetyNet();
})();
