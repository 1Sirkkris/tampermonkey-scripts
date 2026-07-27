// ==UserScript==
// @name         v0.9.41 SidelineApp Helper
// @namespace    https://github.com/1Sirkkris
// @version      0.9.41
// @description  SidelineApp helper with stable Lazy/Qty/Scrubber core and faster standalone Tote Queue.
// @match        https://aft-poirot-website-nrt.nrt.proxy.amazon.com/*
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SidelineApp_Helper.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SidelineApp_Helper.user.js
// @require      https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/e2abaf4b858be3e60b677040aed4115e3a518884/scripts/SidelineApp_Helper.user.js
// @require      https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/b3316a61e35e3f101ae9d7d4ae24e1e010aed265/scripts/SidelineApp_Tote_Queue_Core_v0_9_41.js
// @run-at       document-end
// @grant        none
// ==/UserScript==

// v0.9.41
// - Keeps the proven v0.9.40 Lazy Sideline, Qty quick select and Tote Scrubber core pinned.
// - Replaces the old heavyweight Tote Queue with the tested standalone queue logic.
// - Tote Queue now performs: scan source -> Change container -> Yes -> next source.
