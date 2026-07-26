// ==UserScript==
// @name         v2.4 Highlighter + Madcat
// @version      2.4
// @author       mojordaq
// @author       jachyd
// @author       ChatGPT
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @require      https://drive-render.corp.amazon.com/view/jachyd@/TamperMonkey/fcrp/jquery.js
// @include     /^https?:\/\/.*fcresearch.*\//
// @include     /^https?:\/\/qifcr\.fe\.aftx\.amazonoperations\.app\//
// @grant        GM_xmlhttpRequest
// @connect      *
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Highlighter_Madcat.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Highlighter_Madcat.user.js
// ==/UserScript==

var $ = window.jQuery;
var POD_REGEX = /P\-\d\-(?:[A-Z]\d{3}){2}/g;
var MAX_BIN_CHECKS = 5;

function waitForKeyElements(selector, callback, stopAfterFound, iframeSelector) {
    var targetNodes, btargetsFound;

    if (typeof iframeSelector == 'undefined')
        targetNodes = $(selector);
    else
        targetNodes = $(iframeSelector).contents().find(selector);

    if (targetNodes && targetNodes.length > 0) {
        btargetsFound = true;
        targetNodes.each(function () {
            var jThis = $(this);
            if (!jThis.data('alreadyFound')) {
                var cancelFound = callback(jThis);
                if (!cancelFound) {
                    jThis.data('alreadyFound', true);
                }
            }
        });
    } else {
        btargetsFound = false;
    }

    var controlObj = waitForKeyElements.controlObj || {};
    var controlKey = selector.replace(/[^\w]/g, '_');
    var timeControl = controlObj[controlKey];

    if (btargetsFound && stopAfterFound && timeControl) {
        clearInterval(timeControl);
        delete controlObj[controlKey];
    } else if (!timeControl) {
        timeControl = setInterval(function () {
            waitForKeyElements(selector, callback, stopAfterFound, iframeSelector);
        }, 400);
        controlObj[controlKey] = timeControl;
    }

    waitForKeyElements.controlObj = controlObj;
}

(function addStyles() {
    var css = `
        .fc-madcat-badge {
            display: inline-block;
            margin-left: 8px;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 800;
            line-height: 1.4;
            color: #000;
            vertical-align: middle;
            user-select: none;
        }
        .fc-madcat-yes { background: #ffff00; }
        .fc-madcat-no { background: #ff0000; }
        .fc-madcat-loading { background: #d9d9d9; }
        .fc-madcat-hit {
            background-color: #ffcc00 !important;
            color: #000 !important;
            font-weight: 700 !important;
        }
        .fc-bin-btn {
            display: inline-block;
            margin-left: 6px;
            padding: 2px 8px;
            border-radius: 12px;
            border: 1px solid #6b7280;
            background: #e5e7eb;
            color: #111827;
            font-size: 12px;
            font-weight: 700;
            line-height: 1.4;
            cursor: pointer;
            user-select: none;
        }
        .fc-bin-btn:hover { background: #d1d5db; }
        .fc-bin-btn:disabled {
            cursor: wait;
            opacity: 0.8;
        }
    `;
    var s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
})();

function normalizeText(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
}

function getProductTable() {
    return document.querySelector('[data-section-type="product"] table') ||
           document.querySelector('div [data-section-type="product"] .a-keyvalue');
}

function getProductRows() {
    var table = getProductTable();
    if (!table) return [];
    return Array.from(table.querySelectorAll('tr'));
}

function findRowByHeader(labelRegex) {
    var rows = getProductRows();
    for (var i = 0; i < rows.length; i++) {
        var th = rows[i].querySelector('th');
        if (!th) continue;
        var txt = normalizeText(th.textContent || th.innerText || '');
        if (labelRegex.test(txt)) return rows[i];
    }
    return null;
}

function ensureBadgeCell() {
    var asinRow = findRowByHeader(/^ASIN$/i) || findRowByHeader(/^ISBN$/i);
    if (!asinRow) return null;
    return asinRow.querySelector('td') || asinRow.lastElementChild || null;
}

function ensureMadcatBadge() {
    var cell = ensureBadgeCell();
    if (!cell) return null;

    var badge = cell.querySelector('.fc-madcat-badge');
    if (!badge) {
        badge = document.createElement('span');
        badge.className = 'fc-madcat-badge fc-madcat-loading';
        badge.textContent = 'Madcat: Loading...';
        cell.appendChild(badge);
    }
    return badge;
}

function ensureBinButton() {
    var cell = ensureBadgeCell();
    if (!cell) return null;

    var btn = cell.querySelector('.fc-bin-btn');
    if (!btn) {
        btn = document.createElement('button');
        btn.className = 'fc-bin-btn';
        btn.type = 'button';
        btn.textContent = 'Check Bin';
        btn.title = 'Check up to 5 current inventory containers for Bin type';
        btn.addEventListener('click', manualBinCheck);
        cell.appendChild(btn);
    }
    return btn;
}

function setMadcatBadge(found) {
    var badge = ensureMadcatBadge();
    if (!badge) return;

    var existingBin = '';
    var txt = normalizeText(badge.textContent || '');
    var idx = txt.indexOf('| Bin:');
    if (idx !== -1) {
        existingBin = ' ' + txt.slice(idx);
    }

    badge.classList.remove('fc-madcat-yes', 'fc-madcat-no', 'fc-madcat-loading');
    if (found) {
        badge.classList.add('fc-madcat-yes');
        badge.textContent = 'Madcat: Yes' + existingBin;
    } else {
        badge.classList.add('fc-madcat-no');
        badge.textContent = 'Madcat: No' + existingBin;
    }
}

function setBinText(binText) {
    var badge = ensureMadcatBadge();
    if (!badge) return;

    var txt = normalizeText(badge.textContent || '');
    var base = txt.replace(/\s+\|\s+Bin:.*$/i, '');
    badge.textContent = base + ' | Bin: ' + binText;
}

function findInventoryHistoryContainer() {
    var selectors = [
        '[data-section-type="inventory-history"]',
        '[data-test-id*="inventory-history"]',
        '[id*="inventory-history"]',
        '.a-box',
        'section',
        'table'
    ];

    for (var s = 0; s < selectors.length; s++) {
        var nodes = document.querySelectorAll(selectors[s]);
        for (var i = 0; i < nodes.length; i++) {
            var txt = normalizeText(nodes[i].textContent || nodes[i].innerText || '');
            if (/inventory history/i.test(txt)) return nodes[i];
        }
    }

    var headings = document.querySelectorAll('h1,h2,h3,h4,h5,h6,span,div');
    for (var j = 0; j < headings.length; j++) {
        var ht = normalizeText(headings[j].textContent || headings[j].innerText || '');
        if (/^inventory history$/i.test(ht) || /inventory history/i.test(ht)) {
            return headings[j].closest('[data-section-type]') ||
                   headings[j].closest('.a-box') ||
                   headings[j].closest('section') ||
                   headings[j].parentElement ||
                   null;
        }
    }

    return null;
}

function applyMadcatFromContainer(container) {
    if (!container) return false;

    var fullText = normalizeText(container.textContent || container.innerText || '');
    var found = /madcat/i.test(fullText);
    setMadcatBadge(found);

    if (found) {
        $(container).find('tr').each(function () {
            var rowText = normalizeText(this.textContent || this.innerText || '');
            if (/madcat/i.test(rowText)) {
                this.classList.add('fc-madcat-hit');
            }
        });
    }

    return true;
}

function updateMadcatState() {
    ensureMadcatBadge();
    ensureBinButton();
    var container = findInventoryHistoryContainer();
    if (!container) return false;
    return applyMadcatFromContainer(container);
}

function scheduleMadcatChecks() {
    var delays = [0, 500, 1200, 2500, 5000, 8000];
    delays.forEach(function (delay) {
        setTimeout(function () {
            try { updateMadcatState(); } catch (e) { console.error('madcat check failed', e); }
        }, delay);
    });
}

function findCurrentInventoryTable() {
    var ids = [
        '#table-inventory',
        '[id="table-inventory"]',
        '[data-section-type="inventory"] table'
    ];
    for (var i = 0; i < ids.length; i++) {
        var t = document.querySelector(ids[i]);
        if (t) return t;
    }

    var tables = document.querySelectorAll('table');
    for (var j = 0; j < tables.length; j++) {
        var text = normalizeText(tables[j].textContent || tables[j].innerText || '');
        if (/container/i.test(text) && /quantity/i.test(text) && /fnsku|asin|fcsku/i.test(text)) {
            return tables[j];
        }
    }
    return null;
}

function extractInventoryPods() {
    var table = findCurrentInventoryTable();
    if (!table) return [];

    var text = normalizeText(table.textContent || table.innerText || '');
    var matches = text.match(POD_REGEX) || [];
    var seen = Object.create(null);
    var pods = [];

    for (var i = 0; i < matches.length; i++) {
        var pod = matches[i];
        if (!seen[pod]) {
            seen[pod] = true;
            pods.push(pod);
        }
        if (pods.length >= MAX_BIN_CHECKS) break;
    }

    return pods;
}

function hierarchyUrlForPod(pod) {
    return window.location.href.replace(/\?.*$/g, '/container-hierarchy?s=' + encodeURIComponent(pod));
}

function parseBinTypeFromHtml(html) {
    var tmp = document.createElement('span');
    tmp.innerHTML = html;

    var rows = tmp.querySelectorAll('tr');
    for (var i = 0; i < rows.length; i++) {
        var cells = rows[i].querySelectorAll('th,td');
        if (cells.length < 2) continue;

        var label = normalizeText(cells[0].textContent || cells[0].innerText || '');
        var value = normalizeText(cells[1].textContent || cells[1].innerText || '');
        if (!value) continue;

        if (/^bin type$/i.test(label)) {
            return value;
        }
    }

    var fallback = tmp.querySelector('div.a-span6:nth-child(1) > table:nth-child(1) > tbody:nth-child(1) > tr:nth-child(2) > td:nth-child(2)');
    return normalizeText(fallback ? (fallback.textContent || fallback.innerText || '') : '');
}

function sortBinTypes(types) {
    return types.slice().sort(function (a, b) {
        var ma = String(a).match(/^(\d+)/);
        var mb = String(b).match(/^(\d+)/);
        var na = ma ? parseInt(ma[1], 10) : Number.MAX_SAFE_INTEGER;
        var nb = mb ? parseInt(mb[1], 10) : Number.MAX_SAFE_INTEGER;

        if (na !== nb) return na - nb;
        return String(a).localeCompare(String(b));
    });
}

function summarizeBinTypes(types) {
    if (!types.length) return 'None found';

    var sorted = sortBinTypes(types);
    if (sorted.length === 1) return sorted[0];

    var suffixCounts = Object.create(null);
    for (var i = 0; i < sorted.length; i++) {
        var suffix = sorted[i].replace(/^\d+\-?/, '');
        suffixCounts[suffix] = (suffixCounts[suffix] || 0) + 1;
    }

    var bestSuffix = '';
    var bestCount = 0;
    for (var key in suffixCounts) {
        if (suffixCounts[key] > bestCount) {
            bestCount = suffixCounts[key];
            bestSuffix = key;
        }
    }

    var nums = [];
    var allShareSuffix = true;

    for (var j = 0; j < sorted.length; j++) {
        var m = sorted[j].match(/^(\d+)\-(.+)$/);
        if (!m || m[2] !== bestSuffix) {
            allShareSuffix = false;
            break;
        }
        nums.push(m[1]);
    }

    if (allShareSuffix && nums.length === sorted.length) {
        return 'Mixed (' + nums.join('/') + '-' + bestSuffix + ')';
    }

    return 'Mixed (' + sorted.join(' / ') + ')';
}

function fetchBinTypeForPod(pod) {
    return new Promise(function (resolve) {
        GM_xmlhttpRequest({
            url: hierarchyUrlForPod(pod),
            method: 'GET',
            onload: function (r) {
                try {
                    resolve(parseBinTypeFromHtml(r.responseText || ''));
                } catch (e) {
                    console.error('bin type parse failed', pod, e);
                    resolve('');
                }
            },
            onerror: function (e) {
                console.error('bin type fetch failed', pod, e);
                resolve('');
            }
        });
    });
}

var binCheckBusy = false;

function manualBinCheck() {
    if (binCheckBusy) return;

    var btn = ensureBinButton();
    var pods = extractInventoryPods();

    if (!pods.length) {
        setBinText('No P-bin inventory found');
        return;
    }

    binCheckBusy = true;
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Checking...';
    }
    setBinText('Checking...');

    Promise.all(pods.map(fetchBinTypeForPod)).then(function (values) {
        var seen = Object.create(null);
        var types = [];

        for (var i = 0; i < values.length; i++) {
            var val = normalizeText(values[i]);
            if (!val || seen[val]) continue;
            seen[val] = true;
            types.push(val);
        }

        setBinText(summarizeBinTypes(types));
    }).catch(function (e) {
        console.error('manual bin check failed', e);
        setBinText('Check failed');
    }).finally(function () {
        binCheckBusy = false;
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Check Bin';
        }
    });
}



// ---------- CLEAN COPY FOR PRODUCT PANEL ----------
// Fix: only clean what the user actually selected.
// - selecting only the ASIN/FNSku value copies only the value, not the row label
// - selecting the full row copies Label SPACE+TAB Value so Slack shows a visible space
// - injected script visuals are stripped
// - original FCResearch hyperlinks are preserved in HTML clipboard when possible
function fcEscapeHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function fcCleanCodeForLabel(label, raw) {
    var txt = normalizeText(raw || '');

    if (/^(asin|isbn)$/i.test(label)) {
        var asin = txt.match(/\b[A-Z0-9]{10}\b/i);
        return asin ? asin[0].toUpperCase() : txt;
    }

    if (/fnsku|fcsku/i.test(label)) {
        var sku = txt.match(/\b(?:X0|ZZ)[A-Z0-9]{8}\b/i);
        return sku ? sku[0].toUpperCase() : txt;
    }

    return txt;
}

function fcGetCleanProductValue(row, label) {
    var td = row ? (row.querySelector('td') || row.lastElementChild) : null;
    if (!td) return { text: '', href: '' };

    var a = td.querySelector('a');
    var anchorText = normalizeText(a ? (a.textContent || a.innerText || '') : '');
    var allText = normalizeText(td.textContent || td.innerText || '');
    var href = a ? (a.href || a.getAttribute('href') || '') : '';

    // Prefer real FCResearch anchor text. Badges/buttons are appended after it.
    var raw = anchorText || allText;
    var clean = fcCleanCodeForLabel(label, raw);

    if (!clean && allText) clean = fcCleanCodeForLabel(label, allText);
    return { text: clean, href: href };
}

function fcSelectionTouchesProductPanel(sel, table) {
    if (!sel || !table || sel.rangeCount === 0) return false;
    for (var i = 0; i < sel.rangeCount; i++) {
        var r = sel.getRangeAt(i);
        if (r.intersectsNode && r.intersectsNode(table)) return true;
        var node = r.commonAncestorContainer;
        if (node && node.nodeType === Node.TEXT_NODE) node = node.parentElement;
        if (node && table.contains(node)) return true;
    }
    return false;
}

function fcNodeTouchedBySelection(sel, node) {
    if (!sel || !node || sel.rangeCount === 0) return false;
    for (var i = 0; i < sel.rangeCount; i++) {
        var r = sel.getRangeAt(i);
        try {
            if (r.intersectsNode && r.intersectsNode(node)) return true;
        } catch (e) {}
    }
    return false;
}

function fcRowSelectionParts(sel, row) {
    var th = row ? row.querySelector('th') : null;
    var td = row ? (row.querySelector('td') || row.lastElementChild) : null;
    return {
        label: !!fcNodeTouchedBySelection(sel, th),
        value: !!fcNodeTouchedBySelection(sel, td)
    };
}

function fcHtmlValue(valueObj) {
    var text = fcEscapeHtml(valueObj.text || '');
    var href = valueObj.href || '';
    if (!href) return text;
    return '<a href="' + fcEscapeHtml(href) + '">' + text + '</a>';
}


function fcFindSelectedAnchor(sel, wantedText) {
    if (!sel || sel.rangeCount === 0) return null;
    var want = normalizeText(wantedText || '').toUpperCase();
    var links = Array.from((getProductTable() || document).querySelectorAll('a'));

    for (var i = 0; i < links.length; i++) {
        var a = links[i];
        var at = normalizeText(a.textContent || a.innerText || '').toUpperCase();
        if (want && at !== want) continue;
        if (fcNodeTouchedBySelection(sel, a)) return a;
    }

    return null;
}

function fcDirectCodeFromDirtySelection(rawText) {
    var raw = String(rawText || '').replace(/\u00A0/g, ' ');
    var t = normalizeText(raw);
    if (!t) return '';

    // If the visible row label is part of the selection, do not treat it as value-only.
    // That case is handled by the row rebuild below.
    if (/^(ASIN|ISBN|FNSku|FcSku|Title)\b/i.test(t)) return '';

    // Value-only selections polluted by injected badges/buttons, e.g.
    // B0H55H1KYCMadcat: No
    // B0H55H1KYCL1 ✅ Pandash
    // X001CZUOFDCheck Bin
    var m = t.match(/^([A-Z0-9]{10}|(?:X0|ZZ)[A-Z0-9]{8})(?=\s*(?:Madcat:|Pandash|Check Bin|L\d+|✅|🚫|☑|✔|✘|❌))/i);
    return m ? m[1].toUpperCase() : '';
}

function fcCleanProductPanelCopy(ev) {
    var sel = window.getSelection ? window.getSelection() : null;
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

    var table = getProductTable();
    if (!fcSelectionTouchesProductPanel(sel, table)) return;

    // IMPORTANT v2.3:
    // Literal text highlight must stay literal.
    // Do NOT rebuild clipboard just because the selected text contains row labels like Title/ASIN/FNSku.
    // Only intercept when the selection contains injected script visuals that would pollute the copy.
    var rawSelectedText = String(sel.toString() || '');
    var normSelectedText = normalizeText(rawSelectedText);
    var hasInjectedVisualText = /(madcat:|pandash|check bin|\bL\d+\b|✅|🚫)/i.test(normSelectedText);

    if (!hasInjectedVisualText) {
        return;
    }

    // v2.4: if user selected only the ASIN/FNSku value but the drag accidentally
    // crossed injected badge text, copy ONLY the real code and keep the link.
    var directCode = fcDirectCodeFromDirtySelection(rawSelectedText);
    if (directCode) {
        var directAnchor = fcFindSelectedAnchor(sel, directCode);
        var directValue = { text: directCode, href: directAnchor ? (directAnchor.href || directAnchor.getAttribute('href') || '') : '' };
        ev.preventDefault();
        ev.stopPropagation();
        ev.clipboardData.setData('text/plain', directValue.text);
        ev.clipboardData.setData('text/html', fcHtmlValue(directValue));
        return;
    }

    var rows = getProductRows();
    var out = [];

    rows.forEach(function (row) {
        var th = row.querySelector('th');
        if (!th) return;

        var label = normalizeText(th.textContent || th.innerText || '');
        if (!label) return;

        // Only override rows we know how to clean. Everything else copies normally.
        if (!/^(ASIN|ISBN|FNSku|FcSku|Title)$/i.test(label)) return;

        var parts = fcRowSelectionParts(sel, row);
        if (!parts.label && !parts.value) return;

        var value = fcGetCleanProductValue(row, label);

        // If user only highlighted the code/link cell, copy ONLY the code/link.
        // If user highlighted label + value, copy Label SPACE+TAB Value so Slack does not crush it together.
        if (parts.value && !parts.label) {
            out.push({ mode: 'value', label: label, value: value });
        } else if (parts.label && parts.value) {
            out.push({ mode: 'row', label: label, value: value });
        } else if (parts.label && !parts.value) {
            out.push({ mode: 'label', label: label, value: { text: label, href: '' } });
        }
    });

    if (!out.length) return;

    var onlyValues = out.every(function (r) { return r.mode === 'value'; });
    var onlyLabels = out.every(function (r) { return r.mode === 'label'; });

    var text;
    var html;

    if (onlyValues) {
        text = out.map(function (r) { return r.value.text; }).join('\n');
        html = out.map(function (r) { return fcHtmlValue(r.value); }).join('<br>');
    } else if (onlyLabels) {
        text = out.map(function (r) { return r.label; }).join('\n');
        html = out.map(function (r) { return fcEscapeHtml(r.label); }).join('<br>');
    } else {
        text = out.map(function (r) {
            if (r.mode === 'row') return r.label + ' \t' + r.value.text;
            if (r.mode === 'value') return r.value.text;
            return r.label;
        }).join('\n');

        html = '<table><tbody>' + out.map(function (r) {
            if (r.mode === 'row') {
                return '<tr><td>' + fcEscapeHtml(r.label) + '&nbsp;</td><td>' + fcHtmlValue(r.value) + '</td></tr>';
            }
            if (r.mode === 'value') {
                return '<tr><td>' + fcHtmlValue(r.value) + '</td></tr>';
            }
            return '<tr><td>' + fcEscapeHtml(r.label) + '</td></tr>';
        }).join('') + '</tbody></table>';
    }

    ev.preventDefault();
    ev.stopPropagation();
    ev.clipboardData.setData('text/plain', text);
    ev.clipboardData.setData('text/html', html);
}

document.addEventListener('copy', fcCleanProductPanelCopy, true);


$(document).ready(function () {
    waitForKeyElements('div [data-section-type="product"] .a-keyvalue', function () {
        ['Sortable', 'Very High Value', 'Conveyable', 'Master Case'].forEach(function (e) {
            var a = $('.a-keyvalue th:contains("' + e + '")');
            a.css({ 'background-color': '#3f5973', 'color': 'white' })
                .parent()
                .css('background-color', (a.parent().find('td').text() == 'false') ? '#a73225' : '#359933');
        });

        ensureMadcatBadge();
        ensureBinButton();
        scheduleMadcatChecks();
    });

    waitForKeyElements('table', function () {
        ensureBinButton();
        scheduleMadcatChecks();
    });

    window.addEventListener('hashchange', scheduleMadcatChecks, true);
    window.addEventListener('popstate', scheduleMadcatChecks, true);

    scheduleMadcatChecks();
});
// ==/UserScript==
