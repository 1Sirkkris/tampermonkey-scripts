// ==UserScript==
// @name         v2.8 Highlighter + Madcat + Size
// @version      2.8
// @author       mojordaq
// @author       jachyd
// @author       ChatGPT
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @require      https://drive-render.corp.amazon.com/view/jachyd@/TamperMonkey/fcrp/jquery.js
// @require      https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/f3b903d41ff31c0bd8eab5a16dba2b81c4fc8095/scripts/Highlighter_Madcat.user.js
// @include      /^https?:\/\/.*fcresearch.*\//
// @include      /^https?:\/\/qifcr\.fe\.aftx\.amazonoperations\.app\//
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      *
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Highlighter_Madcat_v2.8.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Highlighter_Madcat_v2.8.user.js
// ==/UserScript==

(function () {
    'use strict';
    var SHIFT_START_HOUR = 7;
    function getCurrentShiftStart() {
        var now = new Date();
        var start = new Date(now);
        start.setHours(SHIFT_START_HOUR, 0, 0, 0);
        if (now < start) start.setDate(start.getDate() - 1);
        return start.getTime();
    }
    function setMissingContainerPulse(enabled) {
        var badge = document.querySelector('.fc-size-badge');
        if (badge) badge.classList.toggle('fc-size-needs-container', !!enabled);
    }
    var style = document.createElement('style');
    style.textContent = `
        @keyframes fc-size-container-pulse {
            0%, 100% { background: #dbeafe; color: #1e3a5f; box-shadow: 0 0 0 0 rgba(59,130,246,0); }
            50% { background: #fecaca; color: #7f1d1d; box-shadow: 0 0 0 3px rgba(239,68,68,0.12); }
        }
        .fc-size-badge.fc-size-needs-container { animation: fc-size-container-pulse 2.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
            .fc-size-badge.fc-size-needs-container { animation: none; background: #fecaca; color: #7f1d1d; }
        }
    `;
    document.head.appendChild(style);
    getSavedSidelineContainer = function () {
        var value = normalizeText(GM_getValue(SIDELINE_CONTAINER_KEY, ''));
        var savedAt = Number(GM_getValue(SIDELINE_CONTAINER_TIME_KEY, 0));
        var valid = isValidSidelineContainer(value) && savedAt >= getCurrentShiftStart();
        if (!valid) {
            clearSavedSidelineContainer();
            setMissingContainerPulse(true);
            return '';
        }
        setMissingContainerPulse(false);
        return value;
    };
    askSidelineContainer = function (current) {
        var entered = prompt('Enter valid Sideline source container (csX / tsX).\nSaved until the next 7:00 AM shift start.', current || '');
        if (entered === null) return '';
        var value = normalizeText(entered);
        if (!isValidSidelineContainer(value)) {
            alert('Invalid container. Must begin with csX or tsX.');
            setMissingContainerPulse(true);
            return '';
        }
        GM_setValue(SIDELINE_CONTAINER_KEY, value);
        GM_setValue(SIDELINE_CONTAINER_TIME_KEY, Date.now());
        setMissingContainerPulse(false);
        return value;
    };
    var originalSetBinText = setBinText;
    setBinText = function (binText, isError) {
        originalSetBinText(binText, isError);
        setMissingContainerPulse(!getSavedSidelineContainer());
    };
    var originalEnsureSizeBadge = ensureSizeBadge;
    ensureSizeBadge = function () {
        var badge = originalEnsureSizeBadge();
        setMissingContainerPulse(!getSavedSidelineContainer());
        return badge;
    };
    setInterval(function () { getSavedSidelineContainer(); }, 60000);
})();
