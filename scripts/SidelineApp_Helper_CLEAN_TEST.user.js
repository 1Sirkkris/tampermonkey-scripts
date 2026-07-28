// ==UserScript==
// @name         v1.3.9 SidelineApp Helper CLEAN TEST
// @namespace    https://github.com/1Sirkkris
// @version      1.3.9
// @description  Clean Sideline helper with remembered toggles and OG-style expiry picker.
// @match        https://aft-poirot-website-nrt.nrt.proxy.amazon.com/*
// @require      https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/e409914de9433290527fb93197bae0e0f7edb4c4/scripts/SidelineApp_Helper_CLEAN_TEST.user.js
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SidelineApp_Helper_CLEAN_TEST.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SidelineApp_Helper_CLEAN_TEST.user.js
// @run-at       document-end
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  if (window.__sidelineCleanAddon_v139) return;
  window.__sidelineCleanAddon_v139 = true;

  const STORAGE_KEY = 'sidelineClean.panelStates.v1';
  const VALID_KEYS = ['queue', 'scrub', 'lazy', 'qty'];
  const MONTHS = [
    ['JAN',1],['FEB',2],['MAR',3],['APR',4],
    ['MAY',5],['JUN',6],['JUL',7],['AUG',8],
    ['SEP',9],['OCT',10],['NOV',11],['DEC',12]
  ];

  const picker = { root:null, month:null, day:null, year:null, inputs:null, busy:false };
  let persistenceInstalled = false;
  let refreshQueued = false;
  let positionQueued = false;

  const style = document.createElement('style');
  style.textContent = `
    .sh-exp-controls,#sh-expiry-pao-wrap{display:none!important}
    #sh-og-expiry{position:fixed;inset:0;z-index:2147483644;pointer-events:none;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
    #sh-og-expiry .og-back{position:fixed;background:rgba(31,41,55,.76);border:7px solid #4b5563;border-radius:14px;box-shadow:0 12px 30px rgba(0,0,0,.38);pointer-events:none}
    #sh-og-expiry .og-panel{position:fixed;box-sizing:border-box;background:#fff;border:2px solid #f97316;border-radius:11px;padding:8px;pointer-events:auto}
    #sh-og-expiry .og-head{display:flex;align-items:center;justify-content:space-between;margin:0 0 7px;font-size:12px;font-weight:900;color:#9a3412}
    #sh-og-expiry .og-head strong{color:#111827}
    #sh-og-expiry .og-grid{display:grid;gap:5px}
    #sh-og-expiry .og-month{grid-template-columns:repeat(4,minmax(0,1fr))}
    #sh-og-expiry .og-day{grid-template-columns:repeat(7,minmax(0,1fr))}
    #sh-og-expiry .og-year{grid-template-columns:repeat(4,minmax(0,1fr))}
    #sh-og-expiry button{min-width:0;height:31px;border:1px solid #c7d2fe;border-radius:7px;background:#f5f7ff;color:#1e3a8a;font-size:11px;font-weight:800;cursor:pointer}
    #sh-og-expiry button:hover:not(:disabled){background:#e0e7ff}
    #sh-og-expiry button.selected{background:#2563eb;color:#fff;border-color:#1d4ed8}
    #sh-og-expiry button:disabled{opacity:.35;cursor:not-allowed}
    #sh-og-expiry .og-footer{position:fixed;pointer-events:auto}
    #sh-og-expiry .og-footer button{width:100%;height:43px;background:#7c3aed;color:#fff;border-color:#6d28d9;font-size:13px}
  `;
  document.documentElement.appendChild(style);

  function visible(el) {
    if (!(el instanceof Element) || !el.isConnected || el.hidden) return false;
    const computed = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return computed.display !== 'none' && computed.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }

  const normalise = value => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

  function readSavedStates() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return Object.fromEntries(VALID_KEYS.map(key => [key, saved[key] === true]));
    } catch {
      return Object.fromEntries(VALID_KEYS.map(key => [key, false]));
    }
  }

  function saveStates(dock) {
    try {
      const states = Object.fromEntries(VALID_KEYS.map(key => {
        const button = dock.querySelector(`button[data-key="${key}"]`);
        return [key, Boolean(button?.classList.contains('sh-on'))];
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
    } catch {}
  }

  function installPersistence() {
    if (persistenceInstalled) return true;
    const dock = document.querySelector('#sh-dock');
    if (!dock || VALID_KEYS.some(key => !dock.querySelector(`button[data-key="${key}"]`))) return false;

    persistenceInstalled = true;
    const saved = readSavedStates();
    for (const key of VALID_KEYS) {
      const button = dock.querySelector(`button[data-key="${key}"]`);
      if (button && saved[key] !== button.classList.contains('sh-on')) button.click();
    }

    dock.addEventListener('click', event => {
      if (!event.target.closest('button[data-key]')) return;
      queueMicrotask(() => saveStates(dock));
    });
    return true;
  }

  function expiryInputs() {
    const inputs = [...document.querySelectorAll('input,textarea')].filter(el =>
      visible(el) && !el.closest('#sh-dock,#sh-queue,#sh-scrub,#sh-qty,#sh-lazy,#sh-og-expiry')
    );
    const hint = re => inputs.find(el => re.test(normalise(`${el.name||''} ${el.id||''} ${el.placeholder||''} ${el.getAttribute('aria-label')||''}`)));
    const month = hint(/\b(mm|month)\b/);
    const day = hint(/\b(dd|day)\b/);
    const year = hint(/\b(yyyy|year)\b/);
    return month && day && year ? { month, day, year } : null;
  }

  function isExpiryScreen() {
    const exact = [...document.querySelectorAll('h1,h2,h3,h4,label,legend,p,span,div')]
      .find(el => visible(el) && /^(enter expiry date displayed on item|enter expiration date displayed on item)$/i.test(normalise(el.textContent)));
    return Boolean(exact);
  }

  function setInput(input, value) {
    const proto = Object.getPrototypeOf(input);
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    const previous = input.value;
    if (descriptor?.set) descriptor.set.call(input, String(value)); else input.value = String(value);
    input._valueTracker?.setValue?.(previous);
    input.dispatchEvent(new Event('input', { bubbles:true }));
    input.dispatchEvent(new Event('change', { bubbles:true }));
  }

  function confirmExpiry(input) {
    const button = document.querySelector('#confirm-button') || [...document.querySelectorAll('button')].find(el => visible(el) && /confirm/i.test(el.textContent || ''));
    if (button && !button.disabled) button.click();
    else for (const type of ['keydown','keypress','keyup']) input.dispatchEvent(new KeyboardEvent(type, { key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true, cancelable:true }));
  }

  function paoDate() {
    const date = new Date();
    date.setDate(date.getDate() + 900);
    return {
      month:date.getMonth()+1,
      day:date.getDate(),
      year:date.getFullYear(),
      label:`${String(date.getMonth()+1).padStart(2,'0')}/${String(date.getDate()).padStart(2,'0')}/${date.getFullYear()}`
    };
  }

  function maxDay(month) {
    if (month === 2) return 29;
    return [4,6,9,11].includes(month) ? 30 : 31;
  }

  function validFuture(month, day, year) {
    const chosen = new Date(year, month-1, day); chosen.setHours(0,0,0,0);
    const today = new Date(); today.setHours(0,0,0,0);
    return chosen >= today;
  }

  function removePicker() {
    picker.root?.remove();
    Object.assign(picker, { root:null, inputs:null, month:null, day:null, year:null, busy:false });
  }

  function makePanel(name, strong, cls, buttons) {
    const panel = document.createElement('section');
    panel.className = 'og-panel';
    panel.dataset.panel = name;
    panel.innerHTML = `<div class="og-head"><span>${name.toUpperCase()}</span><strong>${strong || '—'}</strong></div><div class="og-grid ${cls}">${buttons}</div>`;
    return panel;
  }

  function renderPicker() {
    if (!picker.root || !picker.inputs) return;
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length:16 }, (_,i) => currentYear+i);
    const monthName = MONTHS.find(([,value]) => value === picker.month)?.[0] || '—';
    const days = Array.from({ length:31 }, (_,i) => i+1);

    const monthButtons = MONTHS.map(([label,value]) => `<button data-action="month" data-value="${value}" class="${picker.month===value?'selected':''}">${label}</button>`).join('');
    const dayButtons = days.map(value => `<button data-action="day" data-value="${value}" class="${picker.day===value?'selected':''}" ${!picker.month||value>maxDay(picker.month)?'disabled':''}>${value}</button>`).join('');
    const yearButtons = years.map(value => `<button data-action="year" data-value="${value}" class="${picker.year===value?'selected':''}" ${!picker.month||!picker.day||!validFuture(picker.month,picker.day,value)?'disabled':''}>${value}</button>`).join('');

    picker.root.querySelectorAll('.og-panel,.og-footer').forEach(el => el.remove());
    picker.root.append(
      makePanel('month', monthName, 'og-month', monthButtons),
      makePanel('day', picker.day ? String(picker.day).padStart(2,'0') : '—', 'og-day', dayButtons),
      makePanel('year', picker.year || '—', 'og-year', yearButtons)
    );
    const footer = document.createElement('div');
    footer.className = 'og-footer';
    footer.innerHTML = `<button data-action="pao">PAO +900 DAYS &nbsp; ${paoDate().label}</button>`;
    picker.root.appendChild(footer);
    schedulePosition();
  }

  function positionPicker() {
    positionQueued = false;
    if (!picker.root || !picker.inputs || !isExpiryScreen()) return;
    const entries = [['month',picker.inputs.month],['day',picker.inputs.day],['year',picker.inputs.year]];
    for (const [name,input] of entries) {
      const rect = input.getBoundingClientRect();
      const panel = picker.root.querySelector(`[data-panel="${name}"]`);
      if (!panel) continue;
      Object.assign(panel.style, {
        left:`${Math.round(rect.left)}px`,
        top:`${Math.round(rect.bottom+7)}px`,
        width:`${Math.round(Math.max(250,rect.width))}px`
      });
    }
    const panels = [...picker.root.querySelectorAll('.og-panel')].map(el => el.getBoundingClientRect());
    if (!panels.length) return;
    const left = Math.min(...panels.map(r=>r.left));
    const right = Math.max(...panels.map(r=>r.right));
    const top = Math.min(...panels.map(r=>r.top));
    const bottom = Math.max(...panels.map(r=>r.bottom));
    const footer = picker.root.querySelector('.og-footer');
    Object.assign(footer.style, { left:`${Math.round(left)}px`, top:`${Math.round(bottom+8)}px`, width:`${Math.round(right-left)}px` });
    const footerRect = footer.getBoundingClientRect();
    Object.assign(picker.root.querySelector('.og-back').style, {
      left:`${Math.round(left-9)}px`, top:`${Math.round(top-9)}px`,
      width:`${Math.round(right-left+18)}px`, height:`${Math.round(footerRect.bottom-top+18)}px`
    });
  }

  function schedulePosition() {
    if (positionQueued) return;
    positionQueued = true;
    requestAnimationFrame(positionPicker);
  }

  function mountPicker() {
    if (!isExpiryScreen()) { if (picker.root) removePicker(); return; }
    const inputs = expiryInputs();
    if (!inputs) return;
    if (picker.root?.isConnected) { picker.inputs = inputs; schedulePosition(); return; }

    picker.inputs = inputs;
    const root = document.createElement('div');
    root.id = 'sh-og-expiry';
    root.innerHTML = '<div class="og-back"></div>';
    document.body.appendChild(root);
    picker.root = root;

    root.addEventListener('click', event => {
      const button = event.target.closest('button[data-action]');
      if (!button || button.disabled || picker.busy) return;
      const action = button.dataset.action;
      const value = Number(button.dataset.value);

      if (action === 'month') {
        picker.month=value; picker.day=null; picker.year=null;
        setInput(inputs.month,String(value).padStart(2,'0')); setInput(inputs.day,''); setInput(inputs.year,''); renderPicker(); return;
      }
      if (action === 'day') {
        picker.day=value; picker.year=null;
        setInput(inputs.day,String(value).padStart(2,'0')); setInput(inputs.year,''); renderPicker(); return;
      }
      if (action === 'year') {
        picker.year=value; setInput(inputs.year,String(value)); picker.busy=true;
        setTimeout(() => { confirmExpiry(inputs.year); picker.busy=false; }, 50); renderPicker(); return;
      }
      if (action === 'pao') {
        picker.busy=true;
        const date=paoDate();
        setInput(inputs.month,String(date.month).padStart(2,'0'));
        setTimeout(()=>setInput(inputs.day,String(date.day).padStart(2,'0')),35);
        setTimeout(()=>setInput(inputs.year,String(date.year)),70);
        setTimeout(()=>{confirmExpiry(inputs.year);picker.busy=false;},130);
      }
    });
    renderPicker();
  }

  function refresh() {
    refreshQueued = false;
    installPersistence();
    mountPicker();
  }

  function scheduleRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(refresh);
  }

  const observer = new MutationObserver(mutations => {
    const relevant = mutations.some(mutation => {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      return !target?.closest?.('#sh-dock,#sh-queue,#sh-scrub,#sh-qty,#sh-lazy,#sh-og-expiry');
    });
    if (relevant || !persistenceInstalled) scheduleRefresh();
  });

  observer.observe(document.body, { subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['hidden','style','class','aria-hidden'] });
  window.addEventListener('resize', schedulePosition, true);
  window.addEventListener('scroll', schedulePosition, true);
  setInterval(scheduleRefresh, 1500);
  scheduleRefresh();
})();