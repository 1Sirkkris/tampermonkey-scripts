// ==UserScript==
// @name         v1.0.0 SidelineApp Helper CLEAN TEST
// @namespace    https://github.com/1Sirkkris
// @version      1.0.0
// @description  Clean Sideline helper: Tote Queue, Tote Scrubber, Qty quick select, Lazy Sideline.
// @match        https://aft-poirot-website-nrt.nrt.proxy.amazon.com/*
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SidelineApp_Helper_CLEAN_TEST.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SidelineApp_Helper_CLEAN_TEST.user.js
// @run-at       document-end
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  if (window.__sidelineCleanTest_v100) return;
  window.__sidelineCleanTest_v100 = true;

  const VERSION = '1.0.0';
  const $ = (s, r = document) => { try { return r.querySelector(s); } catch { return null; } };
  const $$ = (s, r = document) => { try { return [...r.querySelectorAll(s)]; } catch { return []; } };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = v => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

  const helperSelector = '#sh-dock,#sh-queue,#sh-scrub,#sh-qty,#sh-lazy';
  const state = { owner: '', scrubBusy: false, queueBusy: false, lazyBusy: false };

  function visible(el) {
    if (!(el instanceof Element) || !el.isConnected || el.hidden) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function enabled(el) {
    return visible(el) && !el.disabled && !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true';
  }
  function appElements(selector) {
    return $$(selector).filter(el => !el.closest(helperSelector));
  }
  function appText() {
    const root = document.body;
    if (!root) return '';
    return norm(root.innerText || root.textContent || '');
  }
  function screen() {
    const t = appText();
    if (t.includes('enter quantity')) return 'QTY';
    if (t.includes('verify item')) return 'VERIFY';
    if (t.includes('scan destination container')) return 'DEST';
    if (t.includes('scan source container')) return 'SOURCE';
    if (t.includes('scan item')) return 'ITEM';
    if (t.includes('expiration date') || t.includes('expiry date')) return 'EXPIRY';
    if (t.includes('successfully')) return 'SUCCESS';
    return 'UNKNOWN';
  }
  function scanInput() {
    const byId = $('#scan-text-input');
    if (enabled(byId) && !byId.closest(helperSelector)) return byId;
    return appElements('input,textarea,[role="textbox"],[contenteditable="true"]').find(el => {
      if (!enabled(el)) return false;
      const type = norm(el.type);
      return !type || ['text', 'search', 'tel', 'number'].includes(type) || el.tagName === 'TEXTAREA' || el.isContentEditable;
    }) || null;
  }
  function buttonByText(re) {
    return appElements('button,[role="button"],a,alchemy-button,mdw-button,input[type="button"],input[type="submit"]')
      .find(el => enabled(el) && re.test(norm(el.innerText || el.textContent || el.value || ''))) || null;
  }
  function confirmButton() {
    const byId = $('#confirm-button');
    if (enabled(byId) && !byId.closest(helperSelector)) return byId;
    return buttonByText(/^(confirm|item match|continue|submit|enter)\b/);
  }
  function changeButton() {
    const byId = $('#change-container-button');
    if (enabled(byId) && !byId.closest(helperSelector)) return byId;
    return buttonByText(/change container/);
  }
  function modalButton(choice) {
    const wanted = norm(choice);
    const scopes = [$('#modal-root'), ...$$('[role="dialog"],dialog,.modal,.Dialog,.dialog,.ReactModal__Content')].filter(Boolean);
    const find = root => $$('button,[role="button"],input[type="button"],input[type="submit"]', root)
      .find(el => enabled(el) && norm(el.innerText || el.textContent || el.value || '') === wanted) || null;
    for (const root of scopes) { const hit = find(root); if (hit) return hit; }
    return find(document);
  }
  function setValue(input, value) {
    if (!input) return false;
    const proto = Object.getPrototypeOf(input);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value') ||
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') ||
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    const old = input.value;
    if (desc?.set) desc.set.call(input, String(value)); else input.value = String(value);
    input._valueTracker?.setValue?.(old);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function enter(el) {
    if (!el) return;
    for (const type of ['keydown', 'keypress', 'keyup']) {
      el.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true }));
    }
  }
  function click(el) {
    if (!el) return false;
    const target = el.shadowRoot?.querySelector('button,[role="button"],input[type="button"],input[type="submit"]') || el;
    for (const type of ['mouseover', 'mousedown', 'mouseup']) target.dispatchEvent(new MouseEvent(type, { bubbles: true, composed: true }));
    target.click();
    return true;
  }
  async function waitFor(test, timeout = 10000, gap = 50) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const value = test();
      if (value) return value;
      await sleep(gap);
    }
    return null;
  }
  async function fillAndConfirm(value, expectedScreen = '') {
    const input = await waitFor(() => (!expectedScreen || screen() === expectedScreen) && scanInput(), 12000, 60);
    if (!input) return false;
    input.focus(); input.select?.();
    setValue(input, '');
    await sleep(10);
    setValue(input, value);
    await sleep(25);
    const btn = confirmButton();
    if (enabled(btn)) click(btn); else enter(input);
    return true;
  }
  async function clearOpenContainer() {
    const change = await waitFor(changeButton, 12000, 35);
    if (!change) return 'change timeout';
    click(change);
    const yes = await waitFor(() => modalButton('yes'), 3500, 25);
    if (!yes) return 'yes timeout';
    click(yes);
    return await waitFor(() => screen() === 'SOURCE' && scanInput(), 12000, 50) ? 'cleared' : 'source timeout';
  }

  const css = `
#sh-dock{position:fixed;right:14px;bottom:12px;z-index:2147483647;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;width:304px;padding:6px;background:#fff;border:1px solid #c7d0dd;box-shadow:0 2px 8px #0003;font:12px Arial,sans-serif}
#sh-dock button,.sh-btn{border:1px solid #aeb8c5;border-radius:3px;padding:8px 6px;font-weight:700;cursor:pointer;background:#f5f7fa;color:#1f2937}.sh-on{background:#146eb4!important;color:#fff!important;border-color:#0f5c99!important}
.sh-panel{position:fixed;right:14px;bottom:58px;z-index:2147483646;width:460px;max-width:calc(100vw - 28px);box-sizing:border-box;padding:10px;background:#fff;border:1px solid #c7d0dd;box-shadow:0 2px 8px #0003;font:12px Arial,sans-serif;color:#111827}.sh-title{font-weight:800;margin:-10px -10px 8px;padding:9px 10px;background:#f3f5f8;border-bottom:1px solid #d5dbe3}.sh-grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.sh-input{width:100%;box-sizing:border-box;border:1px solid #b8c2cf;border-radius:3px;padding:8px;font:12px Arial,sans-serif}.sh-area{height:88px;resize:vertical}.sh-status{margin-top:7px;font-weight:700;line-height:1.35}.sh-error{margin-top:4px;color:#b91c1c;font-weight:700}.sh-row{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:7px}#sh-qty{left:14px;right:auto;width:332px}.sh-qty-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.sh-qty-grid button{min-height:48px;font-size:17px}.sh-stop{background:#fff7ed!important;color:#9a3412!important;border-color:#fed7aa!important}
`;
  const style = document.createElement('style'); style.textContent = css; document.documentElement.appendChild(style);

  const feature = { queue: false, scrub: false, qty: false, lazy: false };
  const panels = {};
  function mountDock() {
    if ($('#sh-dock')) return;
    const dock = document.createElement('div'); dock.id = 'sh-dock';
    for (const [key, label] of [['queue','Tote'],['scrub','Scrub'],['lazy','Lazy'],['qty','QTY']]) {
      const b = document.createElement('button'); b.textContent = label; b.dataset.key = key;
      b.onclick = () => { feature[key] = !feature[key]; applyPanels(); };
      dock.appendChild(b);
    }
    document.body.appendChild(dock);
  }
  function applyPanels() {
    const dock = $('#sh-dock');
    dock?.querySelectorAll('button').forEach(b => b.classList.toggle('sh-on', feature[b.dataset.key]));
    for (const [key, panel] of Object.entries(panels)) panel.style.display = feature[key] ? 'block' : 'none';
    let bottom = 58;
    for (const key of ['lazy','scrub','queue']) {
      const panel = panels[key];
      if (!panel || !feature[key]) continue;
      panel.style.bottom = `${bottom}px`;
      bottom += Math.max(80, panel.offsetHeight) + 10;
    }
  }
  function panel(id, title, key) {
    const root = document.createElement('div'); root.id = id; root.className = 'sh-panel'; root.innerHTML = `<div class="sh-title">${title}</div>`;
    root.style.display = 'none'; document.body.appendChild(root); panels[key] = root; return root;
  }

  const scrubPanel = panel('sh-scrub', `Tote Scrubber v${VERSION}`, 'scrub');
  const scrubStatus = document.createElement('div'); scrubStatus.className = 'sh-status'; scrubPanel.appendChild(scrubStatus);
  function renderScrub() { scrubStatus.textContent = feature.scrub ? 'ACTIVE — Change container → Yes' : 'OFF'; }
  async function scrubTick() {
    if (!feature.scrub || state.scrubBusy || state.owner === 'queue' || state.owner === 'lazy') return;
    const change = changeButton();
    if (!change) return;
    state.scrubBusy = true; state.owner = 'scrub'; renderScrub();
    try { click(change); const yes = await waitFor(() => modalButton('yes'), 3000, 20); if (yes) click(yes); }
    finally { state.scrubBusy = false; state.owner = ''; }
  }

  const q = { running:false, paused:false, index:0, list:[], failed:[] };
  const queuePanel = panel('sh-queue', `Tote Queue v${VERSION}`, 'queue');
  queuePanel.insertAdjacentHTML('beforeend', `<textarea class="sh-input sh-area" placeholder="Paste tsX/csX list"></textarea><div class="sh-grid4"><button class="sh-btn sh-on" data-a="start">Start</button><button class="sh-btn" data-a="pause">Pause</button><button class="sh-btn" data-a="skip">Skip</button><button class="sh-btn sh-stop" data-a="stop">Stop</button></div><div class="sh-status"></div><div class="sh-error"></div>`);
  const qText = $('textarea', queuePanel), qStatus = $('.sh-status', queuePanel), qError = $('.sh-error', queuePanel);
  function parseContainers(text) { const seen=new Set(); return (String(text).match(/\b(?:tsX|csX)[A-Za-z0-9_-]+\b/gi)||[]).filter(v=>{const k=v.toLowerCase();if(seen.has(k))return false;seen.add(k);return true;}); }
  function renderQueue(note='') { const cur=q.list[q.index]||'—'; qStatus.textContent=`${q.running?(q.paused?'PAUSED':'RUNNING'):'STOPPED'} | ${Math.min(q.index,q.list.length)}/${q.list.length} | Current: ${cur}${note?' | '+note:''}`; qError.textContent=q.failed.length?`Errors: ${q.failed.join(', ')}`:''; }
  async function queuePump() {
    if (!q.running || q.paused || state.queueBusy) return;
    if (q.index >= q.list.length) { q.running=false; state.owner=''; renderQueue('done'); return; }
    state.queueBusy=true; state.owner='queue'; const code=q.list[q.index];
    try {
      if (screen() !== 'SOURCE' && changeButton()) { const r=await clearOpenContainer(); if(r!=='cleared') throw new Error(r); }
      renderQueue('scanning source');
      if (!await fillAndConfirm(code,'SOURCE')) throw new Error('scan timeout');
      const result=await clearOpenContainer();
      if(result!=='cleared') throw new Error(result);
      q.index++; renderQueue('cleared');
    } catch(e) { q.failed.push(`${code} (${e.message})`); q.index++; renderQueue(e.message); }
    finally { state.queueBusy=false; state.owner=''; if(q.running&&!q.paused)setTimeout(queuePump,40); }
  }
  queuePanel.onclick=e=>{const a=e.target.dataset.a;if(!a)return;if(a==='start'){q.list=parseContainers(qText.value);q.index=0;q.failed=[];q.running=!!q.list.length;q.paused=false;renderQueue(q.running?'starting':'no containers');queuePump();}if(a==='pause'){q.paused=!q.paused;e.target.textContent=q.paused?'Resume':'Pause';renderQueue();if(!q.paused)queuePump();}if(a==='skip'){if(q.list[q.index]){q.failed.push(`${q.list[q.index]} (skipped)`);q.index++;state.queueBusy=false;renderQueue('skipped');queuePump();}}if(a==='stop'){q.running=false;q.paused=false;state.owner='';renderQueue('stopped');}};
  renderQueue();

  const qtyPanel = panel('sh-qty', `Qty quick select v${VERSION}`, 'qty');
  qtyPanel.innerHTML += `<div class="sh-qty-grid"></div><div class="sh-status"></div>`;
  const qtyGrid=$('.sh-qty-grid',qtyPanel), qtyStatus=$('.sh-status',qtyPanel);
  for(let i=1;i<=10;i++){const b=document.createElement('button');b.className='sh-btn';b.textContent=i;b.onclick=()=>runQty(i);qtyGrid.appendChild(b);}
  async function runQty(qty){if(state.owner)return;state.owner='qty';qtyStatus.textContent=`QTY ${qty}`;try{if(screen()==='VERIFY'){const b=confirmButton();if(b)click(b);}const input=await waitFor(()=>screen()==='QTY'&&scanInput(),5000,40);if(!input)throw new Error('quantity screen not found');input.focus();input.select?.();setValue(input,'');await sleep(10);setValue(input,qty);await sleep(25);const b=confirmButton();if(enabled(b))click(b);else enter(input);qtyStatus.textContent=`QTY ${qty} sent`;}catch(e){qtyStatus.textContent=e.message;}finally{setTimeout(()=>{state.owner='';},150);}}

  const lazy={running:false,paused:false,stage:'IDLE',index:0,items:[],src:'',dest:'',error:''};
  const lazyPanel=panel('sh-lazy',`Lazy Sideline v${VERSION}`,'lazy');
  lazyPanel.insertAdjacentHTML('beforeend',`<div class="sh-row"><input class="sh-input" data-f="src" placeholder="Source container"><input class="sh-input" data-f="dest" placeholder="Destination container"></div><textarea class="sh-input sh-area" data-f="items" placeholder="Scan/paste item barcodes; duplicates = qty"></textarea><label style="display:block;margin:7px 0"><input type="checkbox" data-f="clear"> Clear source when done</label><div class="sh-grid4"><button class="sh-btn sh-on" data-a="start">Start</button><button class="sh-btn" data-a="pause">Pause</button><button class="sh-btn sh-stop" data-a="stop">Stop</button><button class="sh-btn" data-a="reset">Reset</button></div><div class="sh-status"></div><div class="sh-error"></div>`);
  const lSrc=$('[data-f="src"]',lazyPanel),lDest=$('[data-f="dest"]',lazyPanel),lItems=$('[data-f="items"]',lazyPanel),lClear=$('[data-f="clear"]',lazyPanel),lStatus=$('.sh-status',lazyPanel),lError=$('.sh-error',lazyPanel);
  function validContainer(v){return /^(?:cs|ts)x[0-9a-z_-]+$/i.test(String(v).trim());}
  function parseItems(text){const m=new Map();for(const v of String(text).split(/\r?\n/).map(x=>x.trim()).filter(Boolean))m.set(v,(m.get(v)||0)+1);return [...m].map(([code,qty])=>({code,qty}));}
  function renderLazy(note=''){const cur=lazy.items[lazy.index];lStatus.textContent=`${lazy.running?(lazy.paused?'PAUSED':'RUNNING'):'IDLE'} | ${lazy.index}/${lazy.items.length} | ${lazy.stage}${cur?` | ${cur.code} x${cur.qty}`:''}${note?' | '+note:''}`;lError.textContent=lazy.error;}
  async function lazyTick(){if(!lazy.running||lazy.paused||state.lazyBusy||state.owner&&state.owner!=='lazy')return;const item=lazy.items[lazy.index];if(!item){lazy.running=false;if(lClear.checked&&changeButton())await clearOpenContainer();state.owner='';renderLazy('done');return;}state.lazyBusy=true;state.owner='lazy';try{const s=screen();if(s==='EXPIRY'){lazy.paused=true;lazy.error='Expiry screen detected — handle manually, then Resume.';renderLazy();return;}if(lazy.stage==='SOURCE'){if(s==='SOURCE'){await fillAndConfirm(lazy.src,'SOURCE');}else if(['ITEM','VERIFY','QTY','DEST'].includes(s))lazy.stage='ITEM';}else if(lazy.stage==='ITEM'){if(s==='ITEM'){await fillAndConfirm(item.code,'ITEM');lazy.stage='VERIFY';}else if(s==='VERIFY')lazy.stage='VERIFY';else if(s==='SOURCE')lazy.stage='SOURCE';}else if(lazy.stage==='VERIFY'){if(s==='VERIFY'){const b=confirmButton();if(b)click(b);}else if(s==='QTY')lazy.stage='QTY';else if(s==='DEST')lazy.stage='DEST';}else if(lazy.stage==='QTY'){if(s==='QTY'){const input=scanInput();if(input){input.focus();input.select?.();setValue(input,'');await sleep(10);setValue(input,item.qty);await sleep(20);const b=confirmButton();if(enabled(b))click(b);else enter(input);}}else if(s==='DEST')lazy.stage='DEST';}else if(lazy.stage==='DEST'){if(s==='DEST'){await fillAndConfirm(lazy.dest,'DEST');lazy.stage='ADVANCE';}}else if(lazy.stage==='ADVANCE'){if(['ITEM','SUCCESS','SOURCE'].includes(s)){lazy.index++;lazy.stage=s==='SOURCE'?'SOURCE':'ITEM';lazy.error='';}}renderLazy();}catch(e){lazy.error=e.message;lazy.paused=true;renderLazy();}finally{state.lazyBusy=false;if(!lazy.running||lazy.paused)state.owner='';}}
  lazyPanel.onclick=e=>{const a=e.target.dataset.a;if(!a)return;if(a==='start'){lazy.src=lSrc.value.trim();lazy.dest=lDest.value.trim();lazy.items=parseItems(lItems.value);lazy.index=0;lazy.error='';if(!validContainer(lazy.src)||!validContainer(lazy.dest)){lazy.error='SRC and DEST must start with csX or tsX.';renderLazy();return;}if(!lazy.items.length){lazy.error='No item barcodes.';renderLazy();return;}lazy.running=true;lazy.paused=false;lazy.stage='SOURCE';renderLazy('started');}if(a==='pause'){lazy.paused=!lazy.paused;e.target.textContent=lazy.paused?'Resume':'Pause';if(!lazy.paused){lazy.error='';state.owner='lazy';}else state.owner='';renderLazy();}if(a==='stop'){lazy.running=false;lazy.paused=false;lazy.stage='IDLE';state.owner='';renderLazy('stopped');}if(a==='reset'){lazy.running=false;lazy.paused=false;lazy.stage='IDLE';lazy.index=0;lazy.items=[];lazy.error='';lSrc.value=lDest.value=lItems.value='';state.owner='';renderLazy();}};
  renderLazy();

  function boot(){mountDock();applyPanels();renderScrub();setInterval(scrubTick,80);setInterval(lazyTick,110);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();