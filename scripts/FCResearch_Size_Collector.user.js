// ==UserScript==
// @name         v1.0 FCResearch Size Collector
// @namespace    https://github.com/1Sirkkris
// @version      1.0
// @description  For krmclenn only: sends newly seen Sideline bin sizes to a local PowerShell writer.
// @author       1Sirkkris / ChatGPT
// @include      /^https?:\/\/.*fcresearch.*\//
// @include      /^https?:\/\/qifcr\.fe\.aftx\.amazonoperations\.app\//
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      127.0.0.1
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/FCResearch_Size_Collector.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/FCResearch_Size_Collector.user.js
// ==/UserScript==

(function () {
    'use strict';

    var EXPECTED_USER = 'krmclenn';
    var WRITER_URL = 'http://127.0.0.1:8765/size';
    var SENT_KEY = 'fcr_size_collector_sent_unique';
    var lastObserved = '';

    function normalizeText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function getLoggedInUser() {
        var selectors = [
            '#nav-username',
            '[data-testid="username"]',
            '[data-test-id="username"]',
            '.username',
            'header strong',
            'header b'
        ];

        for (var i = 0; i < selectors.length; i++) {
            var nodes = document.querySelectorAll(selectors[i]);
            for (var j = 0; j < nodes.length; j++) {
                var text = normalizeText(nodes[j].textContent).toLowerCase();
                if (text === EXPECTED_USER) return text;
            }
        }

        // FCResearch currently shows the username as plain text in the top-right.
        var topRightNodes = document.querySelectorAll('body *');
        for (var k = 0; k < topRightNodes.length; k++) {
            var node = topRightNodes[k];
            var rect = node.getBoundingClientRect();
            if (rect.top > 120 || rect.left < window.innerWidth * 0.7) continue;
            var candidate = normalizeText(node.textContent).toLowerCase();
            if (candidate === EXPECTED_USER) return candidate;
        }

        return '';
    }

    function isCollectableSize(value) {
        if (!value) return false;
        return !/^(?:loading|checking|container required|request failed|request timed out|open sideline|bad response|no size returned)/i.test(value);
    }

    function getCurrentSize() {
        var node = document.querySelector('.fc-size-value');
        if (!node) return '';
        var text = normalizeText(node.textContent);
        return normalizeText(text.replace(/^Size:\s*/i, ''));
    }

    function getSentSet() {
        var stored = GM_getValue(SENT_KEY, []);
        return Array.isArray(stored) ? stored : [];
    }

    function rememberSent(size) {
        var list = getSentSet();
        if (list.indexOf(size) === -1) {
            list.push(size);
            GM_setValue(SENT_KEY, list);
        }
    }

    function alreadySent(size) {
        return getSentSet().indexOf(size) !== -1;
    }

    function sendSize(size) {
        GM_xmlhttpRequest({
            method: 'POST',
            url: WRITER_URL,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({
                username: EXPECTED_USER,
                size: size,
                capturedAt: new Date().toISOString()
            }),
            timeout: 3000,
            onload: function (response) {
                if (response.status >= 200 && response.status < 300) {
                    rememberSent(size);
                }
            },
            onerror: function () {
                // Writer is not running. Leave unsent so it retries later.
            },
            ontimeout: function () {
                // Writer is not running. Leave unsent so it retries later.
            }
        });
    }

    function check() {
        if (getLoggedInUser() !== EXPECTED_USER) return;

        var size = getCurrentSize();
        if (!isCollectableSize(size) || size === lastObserved) return;

        lastObserved = size;
        if (!alreadySent(size)) sendSize(size);
    }

    setInterval(check, 1000);
    check();
})();
