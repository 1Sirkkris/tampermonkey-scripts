// ==UserScript==
// @name         v1.8.12 PO Cell Highlighter
// @namespace    Violentmonkey Scripts
// @description  Highlight Unfilled/Canceled cells (>0). If Order Date > 6 months, softly tint ONLY the Date column and the two columns to its left (Discount and Title). Date cell gets a stronger tint if > 7 months. No sorting.
// @include     /^https?:\/\/.*fcresearch.*\//
// @include     /^https?:\/\/qifcr\.fe\.aftx\.amazonoperations\.app\//
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/PO_Cell_Highlighter.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/PO_Cell_Highlighter.user.js
// ==/UserScript==
(() => {
  "use strict";

  /* ===== Styles ===== */
  const CSS = `
    /* >0 cell highlights (unchanged) */
    td.poch__unfilled  { background: rgba(255,193,7,.28) !important;  box-shadow: inset 0 0 0 2px rgba(255,180,0,.50); font-weight: 600; }
    td.poch__cancelled { background: rgba(220,53,69,.24) !important;  box-shadow: inset 0 0 0 2px rgba(220,53,69,.45); font-weight: 600; }

    /* soft red band applied to [Date, Discount, Title] when date > 6m */
    td.poch__band {
      background: rgba(255,0,0,.14) !important;
      box-shadow: inset 0 0 0 1px rgba(255,0,0,.22);
      color:#5a0000;
    }

    /* stronger date cell when >7m (same tone family) */
    td.poch__dateold {
      background: rgba(255,0,0,.22) !important;
      box-shadow: inset 0 0 0 1px rgba(255,0,0,.38) !important;
      font-weight: 700; color:#6a0000;
    }
  `;
  (function addCSS(){ const s=document.createElement("style"); s.textContent=CSS; document.documentElement.appendChild(s); })();

  /* ===== Helpers ===== */
  const norm = (s)=> String(s||"").normalize("NFKD").toLowerCase()
    .replace(/\(.*?\)/g,"").replace(/[\u00a0\u202f\s]+/g," ").trim();

  const intFrom = (el)=>{
    const raw = el?.querySelector?.("input,[contenteditable='true']")?.value ?? el?.textContent ?? "";
    const m = String(raw).replace(/[, ]+/g,"").match(/-?\d+/);
    return m ? parseInt(m[0],10) : 0;
  };

  const dateFromCell = (el)=>{
    const raw = (el?.textContent || "").trim();
    const m = raw.match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/);
    if (!m) return null;
    const [ , Y, M, D, h="00", mi="00", s="00" ] = m;
    return new Date(+Y,(+M)-1,+D,+h,+mi,+s);
  };

  const sixMonthsAgo   = (()=>{ const d=new Date(); d.setMonth(d.getMonth()-6); return d; })();
  const sevenMonthsAgo = (()=>{ const d=new Date(); d.setMonth(d.getMonth()-7); return d; })();

  const bodyTable = () => document.querySelector("table#table-purchase-order-item");
  const headTableFor = (body) => {
    const wrap = body?.closest("div.dataTables_scroll");
    return wrap?.querySelector(".dataTables_scrollHead thead")?.closest("table") || body;
  };

  function indexes(head) {
    const headers = [...head.querySelectorAll(":scope > thead th, :scope > thead td, :scope > tr th")]
      .map(th => norm(th.textContent));
    const idxU    = headers.findIndex(h => h.includes("unfilled"));
    const idxC    = headers.findIndex(h => h.includes("canceled") || h.includes("cancelled"));
    const idxDate = headers.findIndex(h => h.includes("order date") || h === "date");
    return { idxU, idxC, idxDate };
  }

  /* ===== Painter (no sorting; minimal work) ===== */
  function paint(body, idxU, idxC, idxDate) {
    const tb = body.tBodies[0] || body;

    for (const tr of tb.rows) {
      const tds = [...tr.cells];
      for (const td of tds) td.classList?.remove("poch__unfilled","poch__cancelled","poch__dateold","poch__band");

      const tdD = idxDate >= 0 ? tds[idxDate] : null;
      const d = tdD ? dateFromCell(tdD) : null;
      const isOld6 = !!(d && d < sixMonthsAgo);

      // apply soft band only to Date + 1-left (Discount) + 2-left (Title)
      if (isOld6) {
        for (let off = 0; off <= 2; off++) {
          const td = tds[idxDate - off];
          if (td) td.classList.add("poch__band");
        }
      }

      // stronger date cell if >7m
      if (tdD && d && d < sevenMonthsAgo) tdD.classList.add("poch__dateold");

      // >0 highlights (independent; different columns)
      const tdU = idxU >= 0 ? tds[idxU] : null;
      if (tdU && tdU.tagName === "TD" && intFrom(tdU) > 0) tdU.classList.add("poch__unfilled");

      const tdC = idxC >= 0 ? tds[idxC] : null;
      if (tdC && tdC.tagName === "TD" && intFrom(tdC) > 0) tdC.classList.add("poch__cancelled");
    }
  }

  function wire() {
    const body = bodyTable();
    if (!body) return false;
    const head = headTableFor(body);
    const { idxU, idxC, idxDate } = indexes(head);
    if (idxU < 0 && idxC < 0 && idxDate < 0) return false;

    paint(body, idxU, idxC, idxDate);

    // lightweight: only watch for row add/remove; no subtree to avoid perf hits
    const tb = body.tBodies[0] || body;
    let tmr = 0;
    const obs = new MutationObserver(() => {
      clearTimeout(tmr);
      tmr = setTimeout(() => paint(body, idxU, idxC, idxDate), 60);
    });
    obs.observe(tb, { childList:true });

    window.addEventListener("pagehide", () => obs.disconnect(), { once:true });
    return true;
  }

  let wired = false, tries = 0;
  const iv = setInterval(() => { if (wired || tries++ > 40) return clearInterval(iv); wired = wire(); }, 250);
  new MutationObserver(() => { if (!wired) wire(); })
    .observe(document.documentElement, { childList:true, subtree:true });
})();
