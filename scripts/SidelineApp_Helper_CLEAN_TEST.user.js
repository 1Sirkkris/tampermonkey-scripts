// ==UserScript==
// @name         v1.1.1 SidelineApp Helper CLEAN TEST
// @namespace    https://github.com/1Sirkkris
// @version      1.1.1
// @description  Clean Sideline helper with Tote Queue, Scrubber warning, Qty, Lazy progress, expiry picker.
// @match        https://aft-poirot-website-nrt.nrt.proxy.amazon.com/*
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SidelineApp_Helper_CLEAN_TEST.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SidelineApp_Helper_CLEAN_TEST.user.js
// @run-at       document-end
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  if (window.__sidelineCleanTest_v111) return;
  window.__sidelineCleanTest_v111 = true;

  const VERSION = '1.1.1';
  const $ = (s, r = document) => { try { return r.querySelector(s); } catch { return null; } };
  const $$ = (s, r = document) => { try { return [...r.querySelectorAll(s)]; } catch { return []; } };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = v => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const helperSelector = '#sh-dock,#sh-queue,#sh-scrub,#sh-qty,#sh-lazy,#sh-expiry,#sh-scrub-warning';
  const state = { owner: '', scrubBusy: false, queueBusy: false, lazyBusy: false, expiryBusy: false };

  function visible(el) {
    if (!(el instanceof Element) || !el.isConnected || el.hidden) return false;
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' && r.width > 0 && r.height > 0;
  }
  function enabled(el) { return visible(el) && !el.disabled && !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true'; }
  function appElements(selector) { return $$(selector).filter(el => !el.closest(helperSelector)); }
  function screen() {
    const t = norm(document.body?.innerText || document.body?.textContent || '');
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
    const direct = $('#scan-text-input');
    if (enabled(direct) && !direct.closest(helperSelector)) return direct;
    return appElements('input,textarea,[role="textbox"],[contenteditable="true"]').find(el => {
      if (!enabled(el)) return false;
      const type = norm(el.type);
      return !type || ['text','search','tel','number'].includes(type) || el.tagName === 'TEXTAREA' || el.isContentEditable;
    }) || null;
  }
  function buttonByText(re) {
    return appElements('button,[role="button"],a,alchemy-button,mdw-button,input[type="button"],input[type="submit"]')
      .find(el => enabled(el) && re.test(norm(el.innerText || el.textContent || el.value || ''))) || null;
  }
  function confirmButton() {
    const direct = $('#confirm-button');
    return enabled(direct) && !direct.closest(helperSelector) ? direct : buttonByText(/^(confirm|item match|continue|submit|enter)\b/);
  }
  function changeButton() {
    const direct = $('#change-container-button');
    return enabled(direct) && !direct.closest(helperSelector) ? direct : buttonByText(/change container/);
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
    const desc = Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') || Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    const old = input.value;
    if (desc?.set) desc.set.call(input, String(value)); else input.value = String(value);
    input._valueTracker?.setValue?.(old);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function enter(el) {
    for (const type of ['keydown','keypress','keyup']) el?.dispatchEvent(new KeyboardEvent(type, { key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true, cancelable:true, composed:true }));
  }
  function click(el) {
    if (!el) return false;
    const target = el.shadowRoot?.querySelector('button,[role="button"],input[type="button"],input[type="submit"]') || el;
    for (const type of ['mouseover','mousedown','mouseup']) target.dispatchEvent(new MouseEvent(type, { bubbles:true, composed:true }));
    target.click();
    return true;
  }
  async function waitFor(test, timeout = 10000, gap = 50) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const value = test(); if (value) return value; await sleep(gap); }
    return null;
  }
  async function fillAndConfirm(value, expected = '') {
    const input = await waitFor(() => (!expected || screen() === expected) && scanInput(), 12000, 60);
    if (!input) return false;
    input.focus(); input.select?.(); setValue(input, ''); await sleep(10); setValue(input, value); await sleep(25);
    const button = confirmButton(); enabled(button) ? click(button) : enter(input);
    return true;
  }
  async function clearOpenContainer() {
    const change = await waitFor(changeButton, 12000, 35); if (!change) return 'change timeout';
    click(change);
    const yes = await waitFor(() => modalButton('yes'), 3500, 25); if (!yes) return 'yes timeout';
    click(yes);
    return await waitFor(() => screen() === 'SOURCE' && scanInput(), 12000, 50) ? 'cleared' : 'source timeout';
  }

  const css = `
#sh-dock{position:fixed;right:14px;bottom:12px;z-index:2147483647;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;width:304px;padding:6px;background:#fff;border:1px solid #c7d0dd;box-shadow:0 2px 8px #0003;font:12px Arial,sans-serif}
#sh-dock button,.sh-btn{border:1px solid #aeb8c5;border-radius:3px;padding:8px 6px;font-weight:700;cursor:pointer;background:#f5f7fa;color:#1f2937}.sh-on{background:#146eb4!important;color:#fff!important;border-color:#0f5c99!important}
.sh-panel{position:fixed;right:14px;bottom:58px;z-index:2147483646;width:460px;max-width:calc(100vw - 28px);box-sizing:border-box;padding:10px;background:#fff;border:1px solid #c7d0dd;box-shadow:0 2px 8px #0003;font:12px Arial,sans-serif;color:#111827}.sh-title{font-weight:800;margin:-10px -10px 8px;padding:9px 10px;background:#f3f5f8;border-bottom:1px solid #d5dbe3}.sh-grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.sh-input{width:100%;box-sizing:border-box;border:1px solid #b8c2cf;border-radius:3px;padding:8px;font:12px Arial,sans-serif}.sh-area{height:88px;resize:vertical}.sh-status{margin-top:7px;font-weight:700;line-height:1.35}.sh-error{margin-top:4px;color:#b91c1c;font-weight:700}.sh-row{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:7px}#sh-qty{left:14px;right:auto;width:332px}.sh-qty-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.sh-qty-grid button{min-height:48px;font-size:17px}.sh-stop{background:#fff7ed!important;color:#9a3412!important;border-color:#fed7aa!important}
#sh-scrub-warning{position:fixed;left:0;right:0;bottom:0;z-index:2147483645;padding:11px 16px;text-align:center;font:900 15px Arial,sans-serif;letter-spacing:.4px;background:#b91c1c;color:#fff;border-top:3px solid #fff;animation:shWarn 1.2s steps(2,end) infinite;pointer-events:none}@keyframes shWarn{0%,100%{background:#b91c1c;color:#fff}50%{background:#fde047;color:#111}}
.sh-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:8px 0}.sh-metric{border:1px solid #c7d0dd;background:#f8fafc;padding:8px;text-align:center}.sh-metric b{display:block;font-size:26px;line-height:1}.sh-progress{max-height:180px;overflow:auto;border-top:1px solid #d5dbe3;margin-top:8px;padding-top:6px;font-family:Consolas,monospace}.sh-item{padding:4px 6px;border-radius:3px}.sh-item.current{background:#fff3bf;border:1px solid #f59e0b;font-weight:900}.sh-expiry-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-top:5px}.sh-expiry-grid button{padding:6px 4px}.sh-expiry-section{margin:8px 0}.sh-expiry-label{font-weight:800;margin-bottom:4px}.sh-pao{width:100%;margin-top:8px;background:#7c3aed!important;color:#fff!important;border-color:#6d28d9!important}`;
  const style = document.createElement('style'); style.textContent = css; document.documentElement.appendChild(style);

  const feature = { queue:false, scrub:false, qty:false, lazy:false };
  const panels = {};
  function panel(id, title, key) {
    const root = document.createElement('div'); root.id=id; root.className='sh-panel'; root.innerHTML=`<div class="sh-title">${title}</div>`; root.style.display='none'; document.body.appendChild(root); panels[key]=root; return root;
  }
  function mountDock() {
    if ($('#sh-dock')) return;
    const dock=document.createElement('div'); dock.id='sh-dock';
    for (const [key,label] of [['queue','Tote'],['scrub','Scrub'],['lazy','Lazy'],['qty','QTY']]) {
      const button=document.createElement('button'); button.textContent=label; button.dataset.key=key; button.onclick=()=>{feature[key]=!feature[key];applyPanels();}; dock.appendChild(button);
    }
    document.body.appendChild(dock);
  }
  function applyPanels() {
    $('#sh-dock')?.querySelectorAll('button').forEach(b=>b.classList.toggle('sh-on',feature[b.dataset.key]));
    for (const [key,p] of Object.entries(panels)) p.style.display=feature[key]?'block':'none';
    let bottom=58;
    for (const key of ['lazy','scrub','queue']) { const p=panels[key]; if(!p||!feature[key])continue; p.style.bottom=`${bottom}px`; bottom+=Math.max(80,p.offsetHeight)+10; }
    renderScrub();
  }

  const scrubPanel=panel('sh-scrub',`Tote Scrubber v${VERSION}`,'scrub');
  const scrubStatus=document.createElement('div'); scrubStatus.className='sh-status'; scrubPanel.appendChild(scrubStatus);
  function renderScrub(){scrubStatus.textContent=feature.scrub?'ACTIVE — Change container → Yes':'OFF';let w=$('#sh-scrub-warning');if(feature.scrub&&!w){w=document.createElement('div');w.id='sh-scrub-warning';w.textContent='⚠ TOTE SCRUBBER ACTIVE — OPENED CONTAINERS WILL BE EMPTIED ⚠';document.body.appendChild(w);}if(!feature.scrub&&w)w.remove();}
  async function scrubTick(){if(!feature.scrub||state.scrubBusy||state.owner==='queue'||state.owner==='lazy')return;const change=changeButton();if(!change)return;state.scrubBusy=true;state.owner='scrub';try{click(change);const yes=await waitFor(()=>modalButton('yes'),3000,20);if(yes)click(yes);}finally{state.scrubBusy=false;state.owner='';}}

  const q={running:false,paused:false,index:0,list:[],failed:[]};
  const queuePanel=panel('sh-queue',`Tote Queue v${VERSION}`,'queue');
  queuePanel.insertAdjacentHTML('beforeend','<textarea class="sh-input sh-area" placeholder="Paste tsX/csX list"></textarea><div class="sh-grid4"><button class="sh-btn sh-on" data-a="start">Start</button><button class="sh-btn" data-a="pause">Pause</button><button class="sh-btn" data-a="skip">Skip</button><button class="sh-btn sh-stop" data-a="stop">Stop</button></div><div class="sh-status"></div><div class="sh-error"></div>');
  const qText=$('textarea',queuePanel),qStatus=$('.sh-status',queuePanel),qError=$('.sh-error',queuePanel);
  function parseContainers(text){const seen=new Set();return(String(text).match(/\b(?:tsX|csX)[A-Za-z0-9_-]+\b/gi)||[]).filter(v=>{const k=v.toLowerCase();if(seen.has(k))return false;seen.add(k);return true;});}
  function renderQueue(note=''){const cur=q.list[q.index]||'—';qStatus.textContent=`${q.running?(q.paused?'PAUSED':'RUNNING'):'STOPPED'} | ${Math.min(q.index,q.list.length)}/${q.list.length} | Current: ${cur}${note?' | '+note:''}`;qError.textContent=q.failed.length?`Errors: ${q.failed.join(', ')}`:'';}
  async function queuePump(){if(!q.running||q.paused||state.queueBusy)return;if(q.index>=q.list.length){q.running=false;state.owner='';renderQueue('done');return;}state.queueBusy=true;state.owner='queue';const code=q.list[q.index];try{if(screen()!=='SOURCE'&&changeButton()){const r=await clearOpenContainer();if(r!=='cleared')throw new Error(r);}renderQueue('scanning source');if(!await fillAndConfirm(code,'SOURCE'))throw new Error('scan timeout');const result=await clearOpenContainer();if(result!=='cleared')throw new Error(result);q.index++;renderQueue('cleared');}catch(e){q.failed.push(`${code} (${e.message})`);q.index++;renderQueue(e.message);}finally{state.queueBusy=false;state.owner='';if(q.running&&!q.paused)setTimeout(queuePump,40);}}
  queuePanel.onclick=e=>{const a=e.target.dataset.a;if(!a)return;if(a==='start'){q.list=parseContainers(qText.value);q.index=0;q.failed=[];q.running=!!q.list.length;q.paused=false;renderQueue(q.running?'starting':'no containers');queuePump();}if(a==='pause'){q.paused=!q.paused;e.target.textContent=q.paused?'Resume':'Pause';renderQueue();if(!q.paused)queuePump();}if(a==='skip'&&q.list[q.index]){q.failed.push(`${q.list[q.index]} (skipped)`);q.index++;state.queueBusy=false;renderQueue('skipped');queuePump();}if(a==='stop'){q.running=false;q.paused=false;state.owner='';renderQueue('stopped');}};
  renderQueue();

  const qtyPanel=panel('sh-qty',`Qty quick select v${VERSION}`,'qty');qtyPanel.innerHTML+='<div class="sh-qty-grid"></div><div class="sh-status"></div>';
  const qtyGrid=$('.sh-qty-grid',qtyPanel),qtyStatus=$('.sh-status',qtyPanel);
  for(let i=1;i<=10;i++){const b=document.createElement('button');b.className='sh-btn';b.textContent=i;b.onclick=()=>runQty(i);qtyGrid.appendChild(b);}
  async function runQty(qty){if(state.owner)return;state.owner='qty';qtyStatus.textContent=`QTY ${qty}`;try{if(screen()==='VERIFY'){const b=confirmButton();if(b)click(b);}const input=await waitFor(()=>screen()==='QTY'&&scanInput(),5000,40);if(!input)throw new Error('quantity screen not found');input.focus();input.select?.();setValue(input,'');await sleep(10);setValue(input,qty);await sleep(25);const b=confirmButton();enabled(b)?click(b):enter(input);qtyStatus.textContent=`QTY ${qty} sent`;}catch(e){qtyStatus.textContent=e.message;}finally{setTimeout(()=>{state.owner='';},150);}}

  const lazy={running:false,paused:false,stage:'IDLE',index:0,items:[],src:'',dest:'',error:''};
  const lazyPanel=panel('sh-lazy',`Lazy Sideline v${VERSION}`,'lazy');
  lazyPanel.insertAdjacentHTML('beforeend','<div class="sh-row"><input class="sh-input" data-f="src" placeholder="Source container (csX / tsX)"><input class="sh-input" data-f="dest" placeholder="Destination container (csX / tsX)"></div><textarea class="sh-input sh-area" data-f="items" placeholder="Scan item barcodes — one per line"></textarea><label style="display:block;margin:7px 0"><input type="checkbox" data-f="clear"> Clear source when done</label><div class="sh-grid4"><button class="sh-btn sh-on" data-a="start">Start</button><button class="sh-btn" data-a="pause">Pause</button><button class="sh-btn sh-stop" data-a="stop">Stop</button><button class="sh-btn" data-a="reset">Reset</button></div><div class="sh-metrics"><div class="sh-metric">Total<b data-m="total">0</b></div><div class="sh-metric">Unique<b data-m="unique">0</b></div><div class="sh-metric">Remaining<b data-m="remaining">0</b></div></div><div class="sh-status"></div><div class="sh-error"></div><div class="sh-progress"></div>');
  const lSrc=$('[data-f="src"]',lazyPanel),lDest=$('[data-f="dest"]',lazyPanel),lItems=$('[data-f="items"]',lazyPanel),lClear=$('[data-f="clear"]',lazyPanel),lStatus=$('.sh-status',lazyPanel),lError=$('.sh-error',lazyPanel),lProgress=$('.sh-progress',lazyPanel),mTotal=$('[data-m="total"]',lazyPanel),mUnique=$('[data-m="unique"]',lazyPanel),mRemaining=$('[data-m="remaining"]',lazyPanel);
  function validContainer(v){return /^(?:cs|ts)x[0-9a-z_-]+$/i.test(String(v).trim());}
  function parseItems(text){const m=new Map();for(const v of String(text).split(/\r?\n/).map(x=>x.trim()).filter(Boolean))m.set(v,(m.get(v)||0)+1);return[...m].map(([code,qty])=>({code,qty}));}
  function refreshItems(){if(!lazy.running){lazy.items=parseItems(lItems.value);lazy.index=0;}renderLazy();}
  function renderLazy(note=''){const cur=lazy.items[lazy.index],total=lazy.items.reduce((s,x)=>s+x.qty,0),unique=lazy.items.length,remaining=Math.max(0,unique-lazy.index);mTotal.textContent=total;mUnique.textContent=unique;mRemaining.textContent=remaining;lStatus.textContent=`${lazy.running?(lazy.paused?'PAUSED':'RUNNING'):'IDLE'} | ${lazy.stage}${cur?` | ${cur.code} x${cur.qty}`:''}${note?' | '+note:''}`;lError.textContent=lazy.error;lProgress.innerHTML=lazy.items.map((it,i)=>`<div class="sh-item ${i===lazy.index&&lazy.running?'current':''}">${i<lazy.index?'✓ ':i===lazy.index&&lazy.running?'▶ ':'• '}${it.code} ×${it.qty}</div>`).join('');}
  function installContainerAdvance(input,next){input.addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!=='Tab')return;e.preventDefault();const v=input.value.trim();if(!validContainer(v)){lazy.error='Container must start with csX or tsX.';input.value='';renderLazy();return;}lazy.error='';setTimeout(()=>next.focus(),0);renderLazy();});input.addEventListener('paste',()=>setTimeout(()=>{if(validContainer(input.value.trim())){lazy.error='';next.focus();}else{lazy.error='Container must start with csX or tsX.';input.value='';}renderLazy();},0));}
  installContainerAdvance(lSrc,lDest);installContainerAdvance(lDest,lItems);
  lItems.addEventListener('keydown',e=>{if(e.key!=='Enter')return;e.preventDefault();e.stopPropagation();const cleaned=String(lItems.value||'').replace(/[\t ]+$/gm,'').replace(/\n{2,}$/g,'\n').replace(/\n*$/,'');lItems.value=cleaned?`${cleaned}\n`:'';lItems.dispatchEvent(new Event('input',{bubbles:true}));});
  lItems.addEventListener('input',refreshItems);lItems.addEventListener('paste',()=>setTimeout(refreshItems,0));
  async function lazyTick(){if(!lazy.running||lazy.paused||state.lazyBusy||(state.owner&&state.owner!=='lazy'))return;const item=lazy.items[lazy.index];if(!item){lazy.running=false;if(lClear.checked&&changeButton())await clearOpenContainer();state.owner='';renderLazy('done');return;}state.lazyBusy=true;state.owner='lazy';try{const s=screen();if(s==='EXPIRY'){lazy.paused=true;lazy.error='Expiry screen detected — use expiry helper, then Resume.';renderLazy();return;}if(lazy.stage==='SOURCE'){if(s==='SOURCE')await fillAndConfirm(lazy.src,'SOURCE');else if(['ITEM','VERIFY','QTY','DEST'].includes(s))lazy.stage='ITEM';}else if(lazy.stage==='ITEM'){if(s==='ITEM'){await fillAndConfirm(item.code,'ITEM');lazy.stage='VERIFY';}else if(s==='VERIFY')lazy.stage='VERIFY';else if(s==='SOURCE')lazy.stage='SOURCE';}else if(lazy.stage==='VERIFY'){if(s==='VERIFY'){const b=confirmButton();if(b)click(b);}else if(s==='QTY')lazy.stage='QTY';else if(s==='DEST')lazy.stage='DEST';}else if(lazy.stage==='QTY'){if(s==='QTY'){const input=scanInput();if(input){input.focus();input.select?.();setValue(input,'');await sleep(10);setValue(input,item.qty);await sleep(20);const b=confirmButton();enabled(b)?click(b):enter(input);}}else if(s==='DEST')lazy.stage='DEST';}else if(lazy.stage==='DEST'){if(s==='DEST'){await fillAndConfirm(lazy.dest,'DEST');lazy.stage='ADVANCE';}}else if(lazy.stage==='ADVANCE'&&['ITEM','SUCCESS','SOURCE'].includes(s)){lazy.index++;lazy.stage=s==='SOURCE'?'SOURCE':'ITEM';lazy.error='';}renderLazy();}catch(e){lazy.error=e.message;lazy.paused=true;renderLazy();}finally{state.lazyBusy=false;if(!lazy.running||lazy.paused)state.owner='';}}
  lazyPanel.onclick=e=>{const a=e.target.dataset.a;if(!a)return;if(a==='start'){lazy.src=lSrc.value.trim();lazy.dest=lDest.value.trim();lazy.items=parseItems(lItems.value);lazy.index=0;lazy.error='';if(!validContainer(lazy.src)||!validContainer(lazy.dest)){lazy.error='SRC and DEST must start with csX or tsX.';renderLazy();return;}if(!lazy.items.length){lazy.error='No item barcodes.';renderLazy();return;}lazy.running=true;lazy.paused=false;lazy.stage='SOURCE';renderLazy('started');}if(a==='pause'){lazy.paused=!lazy.paused;e.target.textContent=lazy.paused?'Resume':'Pause';if(!lazy.paused){lazy.error='';state.owner='lazy';}else state.owner='';renderLazy();}if(a==='stop'){lazy.running=false;lazy.paused=false;lazy.stage='IDLE';state.owner='';renderLazy('stopped');}if(a==='reset'){lazy.running=false;lazy.paused=false;lazy.stage='IDLE';lazy.index=0;lazy.items=[];lazy.error='';lSrc.value=lDest.value=lItems.value='';state.owner='';renderLazy();}};
  renderLazy();

  function expiryInputs(){const inputs=appElements('input,textarea').filter(visible);const hint=re=>inputs.find(el=>re.test(norm(`${el.name||''} ${el.id||''} ${el.placeholder||''} ${el.getAttribute('aria-label')||''}`)));const month=hint(/\b(mm|month)\b/),day=hint(/\b(dd|day)\b/),year=hint(/\b(yyyy|year)\b/);if(month&&day&&year)return{month,day,year};const text=inputs.filter(el=>['','text','tel','number','search'].includes(norm(el.type||'')));return text.length>=3?{month:text[0],day:text[1],year:text[2]}:null;}
  const expiryPanel=document.createElement('div');expiryPanel.id='sh-expiry';expiryPanel.className='sh-panel';expiryPanel.style.display='none';document.body.appendChild(expiryPanel);
  function fillExpiryPart(input,value){if(!input)return;input.focus();input.select?.();setValue(input,value);input.dispatchEvent(new Event('blur',{bubbles:true}));}
  function makeButtons(values,action){return values.map(v=>`<button class="sh-btn" data-exp="${action}" data-v="${v}">${v}</button>`).join('');}
  function renderExpiry(){const show=screen()==='EXPIRY';expiryPanel.style.display=show?'block':'none';if(!show)return;const now=new Date(),years=Array.from({length:16},(_,i)=>now.getFullYear()+i);expiryPanel.innerHTML=`<div class="sh-title">Expiry helper v${VERSION}</div><div class="sh-expiry-section"><div class="sh-expiry-label">Month</div><div class="sh-expiry-grid">${makeButtons(Array.from({length:12},(_,i)=>String(i+1).padStart(2,'0')),'m')}</div></div><div class="sh-expiry-section"><div class="sh-expiry-label">Day</div><div class="sh-expiry-grid">${makeButtons(Array.from({length:31},(_,i)=>String(i+1).padStart(2,'0')),'d')}</div></div><div class="sh-expiry-section"><div class="sh-expiry-label">Year</div><div class="sh-expiry-grid">${makeButtons(years,'y')}</div></div><button class="sh-btn sh-pao" data-exp="pao">PAO +900 DAYS</button>`;expiryPanel.style.bottom=`${feature.lazy?58+Math.max(80,lazyPanel.offsetHeight)+10:58}px`;}
  expiryPanel.addEventListener('click',async e=>{const b=e.target.closest('[data-exp]');if(!b||state.expiryBusy)return;const inputs=expiryInputs();if(!inputs)return;state.expiryBusy=true;try{const a=b.dataset.exp,v=b.dataset.v;if(a==='m')fillExpiryPart(inputs.month,v);if(a==='d')fillExpiryPart(inputs.day,v);if(a==='y'){fillExpiryPart(inputs.year,v);await sleep(40);const c=confirmButton();c?click(c):enter(inputs.year);}if(a==='pao'){const d=new Date();d.setDate(d.getDate()+900);fillExpiryPart(inputs.month,String(d.getMonth()+1).padStart(2,'0'));fillExpiryPart(inputs.day,String(d.getDate()).padStart(2,'0'));fillExpiryPart(inputs.year,String(d.getFullYear()));await sleep(40);const c=confirmButton();c?click(c):enter(inputs.year);}}finally{setTimeout(()=>{state.expiryBusy=false;},150);}});

  function boot(){mountDock();applyPanels();renderScrub();setInterval(scrubTick,80);setInterval(lazyTick,110);setInterval(renderExpiry,250);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();