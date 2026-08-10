// ==UserScript==
// @name         v0.3.2 AFT Tools Master CLEAN TEST
// @namespace    https://github.com/1Sirkkris
// @version      0.3.2
// @description  Single clean AFT master: Mode Each Quick Flip, Mode Sku loop, Expiration Queue, FcSku Flip and MoveItems.
// @match        http://aft-qt-jp.aka.nrt.corp.amazon.com/app/edititems*
// @match        https://aft-qt-jp.aka.nrt.corp.amazon.com/app/edititems*
// @match        http://aft-qt-*.aka.*.corp.amazon.com/app/edititems*
// @match        https://aft-qt-*.aka.*.corp.amazon.com/app/edititems*
// @match        http://aft-qt-*.corp.amazon.com/app/edititems*
// @match        https://aft-qt-*.corp.amazon.com/app/edititems*
// @match        http://aft-qt-jp.aka.nrt.corp.amazon.com/app/fcskuflip*
// @match        https://aft-qt-jp.aka.nrt.corp.amazon.com/app/fcskuflip*
// @match        http://aft-qt-*.aka.*.corp.amazon.com/app/fcskuflip*
// @match        https://aft-qt-*.aka.*.corp.amazon.com/app/fcskuflip*
// @match        http://aft-qt-*.corp.amazon.com/app/fcskuflip*
// @match        https://aft-qt-*.corp.amazon.com/app/fcskuflip*
// @match        http://aft-qt-jp.aka.nrt.corp.amazon.com/app/moveitems*
// @match        https://aft-qt-jp.aka.nrt.corp.amazon.com/app/moveitems*
// @match        http://aft-qt-*.aka.*.corp.amazon.com/app/moveitems*
// @match        https://aft-qt-*.aka.*.corp.amazon.com/app/moveitems*
// @match        http://aft-qt-*.corp.amazon.com/app/moveitems*
// @match        https://aft-qt-*.corp.amazon.com/app/moveitems*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/AFT_Tools_Master_CLEAN_TEST.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/AFT_Tools_Master_CLEAN_TEST.user.js
// ==/UserScript==

(() => {
  'use strict';
  if (window.__AFT_MASTER_V032__) return;
  window.__AFT_MASTER_V032__ = true;

  const VERSION = '0.3.2';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const norm = v => String(v ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const low = v => norm(v).toLowerCase();
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function visible(el) {
    if (!el || !el.isConnected || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
  }
  function pageText() { return norm(document.body?.innerText || ''); }
  function heading() { return norm($$('h1,h2,h3,[role="heading"]').map(x => x.textContent).find(Boolean) || ''); }
  function setValue(el, value) {
    if (!el) return false;
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const d = Object.getOwnPropertyDescriptor(proto, 'value');
    el.focus();
    if (d?.set) d.set.call(el, String(value)); else el.value = String(value);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(value) }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function press(target, key) {
    const code = key === 'Enter' ? 'Enter' : `Key${key.toUpperCase()}`;
    const n = key === 'Enter' ? 13 : key.toUpperCase().charCodeAt(0);
    for (const type of ['keydown', 'keypress', 'keyup']) {
      (target || document).dispatchEvent(new KeyboardEvent(type, { key, code, keyCode:n, which:n, bubbles:true, cancelable:true }));
    }
  }
  function inputOutside(exclude = '') {
    return $$('input[type="text"],input:not([type]),textarea').filter(visible).find(el => !exclude || !el.closest(exclude)) || null;
  }
  function button(words, exclude = '') {
    const wanted = words.map(low);
    return $$('button,input[type="button"],input[type="submit"],a,[role="button"],span.a-button,div.a-button')
      .filter(visible).filter(el => !exclude || !el.closest(exclude))
      .find(el => {
        const t = low(el.textContent || el.value || el.getAttribute('aria-label'));
        return t && wanted.some(w => t.includes(w));
      }) || null;
  }
  function click(words, exclude = '') {
    const n = button(words, exclude); if (!n) return false;
    const real = n.querySelector?.('input.a-button-input,input[type="submit"],button') || n;
    if (!visible(real)) return false;
    real.click(); return true;
  }
  async function waitFor(fn, timeout = 12000, every = 90, tokenFn = null, token = null) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (tokenFn && tokenFn() !== token) return null;
      try { const v = fn(); if (v) return v; } catch {}
      await sleep(every);
    }
    return null;
  }
  function radioByText(wanted) {
    const w = low(wanted);
    for (const r of $$('input[type="radio"]')) {
      let node = r, text = low(r.value).replace(/_/g, ' ');
      for (let i = 0; i < 7 && node; i++, node = node.parentElement) {
        if ((node.querySelectorAll?.('input[type="radio"]').length || 0) === 1) { text += ' ' + low(node.textContent); break; }
      }
      if (text.includes(w) && !(w === 'sellable' && text.includes('unsellable'))) return r;
    }
    return null;
  }
  function chooseRadio(label) {
    const r = radioByText(label); if (!r) return false;
    r.click(); r.dispatchEvent(new Event('input', { bubbles:true })); r.dispatchEvent(new Event('change', { bubbles:true })); return true;
  }

  function injectCss() {
    if ($('#aftm-style')) return;
    const s = document.createElement('style'); s.id = 'aftm-style';
    s.textContent = `
      .aftm{position:fixed;z-index:2147483647;font:13px/1.35 Arial,sans-serif;box-shadow:0 8px 24px #0005}
      .aftm *{box-sizing:border-box}.aftm button{cursor:pointer;font-weight:700}
      .aftm input,.aftm textarea,.aftm select{width:100%;padding:7px;border:1px solid #789;border-radius:4px;background:#fff;color:#111}
      #aftm-each{top:106px;left:18px;width:355px;background:#eef7fb;border:1px solid #174b57;border-radius:8px;overflow:hidden;color:#111}
      #aftm-each .head,#aftm-sku .head{background:#003b45;color:#fff;padding:9px 12px;font-weight:800}
      #aftm-each .body,#aftm-sku .body{padding:10px;display:grid;gap:8px}
      #aftm-each .timer{display:flex;align-items:center;justify-content:space-between;gap:6px;background:#e8f6ff;border-bottom:1px solid #174b57;padding:8px 10px;font-weight:700}
      #aftm-each .row,#aftm-sku .row{display:flex;gap:7px} #aftm-each .row>* ,#aftm-sku .row>*{flex:1}
      #aftm-each .primary,#aftm-sku .primary{background:#003b45;color:#fff;border:0;padding:8px;border-radius:4px}
      #aftm-each .danger,#aftm-sku .danger{background:#d94343;color:#fff;border:1px solid #b22;padding:7px;border-radius:6px}
      #aftm-sku{right:12px;bottom:12px;width:350px;background:#111827;color:#fff;border-radius:10px;overflow:hidden}
      #aftm-sku .head{display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;user-select:none}
      #aftm-sku .head button{width:28px;height:24px;padding:0;border:1px solid #6b7280;border-radius:5px;background:#111827;color:#fff}
      #aftm-sku .tabs{display:flex;gap:6px} #aftm-sku .tabs button.active{background:#0f8f8f;color:#fff}
      #aftm-sku label{display:grid;gap:3px;font-weight:700}.aftm-status{font-weight:700;min-height:17px}
      #aftm-sku.minimized{width:235px}
      #aftm-sku.minimized .body{display:none!important}
    `;
    document.documentElement.appendChild(s);
  }

  const Edit = {
    active:false, mode:null, panel:null, running:false, token:0,
    keys:{ q:'aftm_edit_q', active:'aftm_edit_active', done:'aftm_edit_done', total:'aftm_edit_total', state:'aftm_edit_state', disp:'aftm_edit_disp', sku:'aftm_edit_sku', exp:'aftm_exp_cfg', workflow:'aftm_workflow', minimized:'aftm_sku_minimized' },
    match:()=>/\/app\/edititems/i.test(location.pathname),
    detect(){ const t = pageText(); if (/\bMode\s*:\s*Each\b/i.test(t)) return 'each'; if (/\bMode\s*:\s*Sku\b/i.test(t)) return 'sku'; return null; },
    start(){ this.refresh(); },
    stop(){ this.token++; this.running=false; this.panel?.remove(); this.panel=null; },
    refresh(){ const m = this.detect(); if (!m) return; if (m !== this.mode || !this.panel?.isConnected) { this.mode=m; this.render(); } if (localStorage.getItem(this.keys.active)==='1'&&!this.running) this.drive(); },
    render(){ this.panel?.remove(); this.panel = this.mode === 'each' ? this.renderEach() : this.renderSku(); },
    renderEach(){
      const p=document.createElement('section'); p.id='aftm-each'; p.className='aftm';
      p.innerHTML=`<div class="timer"><span>⚡ Smart Auto Timer: shared</span><button data-aggr>Toggle Aggressive</button><button class="danger" data-clear>CLEAR QUEUE</button></div><div class="head">Quick Flip ▾</div><div class="head" style="margin-top:1px">Multi Quick Flip ▴</div><div class="body"><label>Inventory State<select data-state><option>Sellable</option><option selected>Unsellable</option><option>Pending Research</option></select></label><label>Disposition<select data-disp><option>Amazon Damage</option><option>Defective</option><option>Distributor Damage</option><option>Expired</option></select></label><textarea data-list rows="6" placeholder="Paste:\nTOTE ASIN\nor\nTOTE ASIN FNSKU"></textarea><button class="primary" data-start>Start Multi Flip</button><div><b>Mode:</b> Each</div><button class="danger" data-clear2 style="width:118px">CLEAR QUEUE</button><div class="aftm-status" data-status>Idle</div></div>`;
      document.body.appendChild(p);
      $('[data-state]',p).value=localStorage.getItem(this.keys.state)||'Unsellable'; $('[data-disp]',p).value=localStorage.getItem(this.keys.disp)||'Amazon Damage';
      $('[data-start]',p).onclick=()=>this.startEach(); $('[data-clear]',p).onclick=$('[data-clear2]',p).onclick=()=>this.clear('Queue cleared', true);
      return p;
    },
    renderSku(){
      const p=document.createElement('section'); p.id='aftm-sku'; p.className='aftm';
      p.innerHTML=`<div class="head" data-head><span>AFT EditItems Master v${VERSION}</span><button type="button" data-min title="Minimize">−</button></div><div class="body"><div><b>SKU mode</b></div><div class="tabs"><button data-tab="flip" class="active">State / SKU Flip</button><button data-tab="exp">Expiration Queue</button></div><div data-flip><label>SKU / ASIN / FNSKU / FCSKU<input data-sku></label><label>Locations / containers / items<textarea data-list rows="6"></textarea></label><div class="row"><label>Desired state<select data-state><option>Sellable</option><option selected>Unsellable</option><option>Pending Research</option></select></label><label>Desired damage<select data-disp><option>Amazon Damage</option><option>Defective</option><option>Distributor Damage</option><option>Expired</option></select></label></div></div><div data-exp hidden><label>Containers<textarea data-cont rows="4"></textarea></label><label>ASINs<textarea data-asins rows="4"></textarea></label><label>Expiration date<input data-date type="date"></label><label><input data-pr type="checkbox" style="width:auto"> Pending Research → Sellable</label></div><div class="row"><button class="primary" data-start>START</button><button data-stop>STOP</button><button class="danger" data-clear>CLEAR QUEUE</button></div><div class="aftm-status" data-status>Idle</div></div>`;
      document.body.appendChild(p);

      const setMinimized = minimized => {
        p.classList.toggle('minimized', minimized);
        $('[data-min]',p).textContent = minimized ? '+' : '−';
        $('[data-min]',p).title = minimized ? 'Expand' : 'Minimize';
        localStorage.setItem(this.keys.minimized, minimized ? '1' : '0');
        if (minimized && p.contains(document.activeElement)) document.activeElement.blur();
      };
      setMinimized(localStorage.getItem(this.keys.minimized)==='1');
      $('[data-min]',p).onclick=e=>{e.stopPropagation();setMinimized(!p.classList.contains('minimized'));};
      $('[data-head]',p).onclick=e=>{if(e.target.closest('button'))return;setMinimized(!p.classList.contains('minimized'));};

      const tab=(name)=>{ $('[data-flip]',p).hidden=name!=='flip'; $('[data-exp]',p).hidden=name!=='exp'; $('[data-tab="flip"]',p).classList.toggle('active',name==='flip'); $('[data-tab="exp"]',p).classList.toggle('active',name==='exp'); localStorage.setItem(this.keys.workflow,name); };
      $('[data-tab="flip"]',p).onclick=()=>tab('flip'); $('[data-tab="exp"]',p).onclick=()=>tab('exp'); tab(localStorage.getItem(this.keys.workflow)||'flip');
      $('[data-start]',p).onclick=()=>{ document.activeElement?.blur(); $('[data-exp]',p).hidden?this.startSku():this.startExpiration(); };
      $('[data-stop]',p).onclick=()=>{this.token++;this.running=false;document.activeElement?.blur();this.status('Stopped')};
      $('[data-clear]',p).onclick=()=>this.clear('Queue + fields cleared', true);

      p.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        const target = e.target;
        if (target?.tagName === 'TEXTAREA') return;
        if (!target?.matches?.('input,select')) return;
        e.preventDefault();
        e.stopPropagation();
        target.blur();
        setTimeout(() => {
          click(['change items','continue','confirm','save'], '.aftm') || press(document,'Enter');
        }, 0);
      }, true);

      return p;
    },
    status(t){ const el=this.panel&&$('[data-status]',this.panel); if(el)el.textContent=t; },
    queue(){ try { const q=JSON.parse(localStorage.getItem(this.keys.q)||'[]'); return Array.isArray(q)?q:[]; } catch { return []; } },
    saveQueue(q){ localStorage.setItem(this.keys.q,JSON.stringify(q)); },
    clear(msg='Idle', clearFields=false){
      this.token++; this.running=false;
      [this.keys.q,this.keys.active,this.keys.done,this.keys.total,'aftm_edit_meta'].forEach(k=>localStorage.removeItem(k));
      if (clearFields && this.panel) {
        ['[data-sku]','[data-list]','[data-cont]','[data-asins]','[data-date]'].forEach(sel=>{ const el=$(sel,this.panel); if(el){ el.value=''; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }});
        const pr=$('[data-pr]',this.panel); if(pr)pr.checked=false;
        localStorage.removeItem(this.keys.sku);
        localStorage.removeItem(this.keys.exp);
      }
      if (this.panel?.contains(document.activeElement)) document.activeElement.blur();
      this.status(msg);
    },
    begin(items,meta){ this.saveQueue(items);localStorage.setItem(this.keys.done,'0');localStorage.setItem(this.keys.total,String(items.length));localStorage.setItem(this.keys.active,'1');localStorage.setItem('aftm_edit_meta',JSON.stringify(meta));this.drive(); },
    startEach(){ const lines=$('[data-list]',this.panel).value.split(/\r?\n/).map(norm).filter(Boolean).map(line=>{const [location,asin,fnsku]=line.split(/\s+/);return{location,asin,fnsku:fnsku||asin}}).filter(x=>x.location&&x.asin); if(!lines.length){this.status('Paste TOTE ASIN rows');return} const state=$('[data-state]',this.panel).value,disp=$('[data-disp]',this.panel).value;localStorage.setItem(this.keys.state,state);localStorage.setItem(this.keys.disp,disp);this.begin(lines,{type:'each',state,disp}); },
    startSku(){ const sku=norm($('[data-sku]',this.panel).value),list=$('[data-list]',this.panel).value.split(/\r?\n/).map(norm).filter(Boolean),state=$('[data-state]',this.panel).value,disp=$('[data-disp]',this.panel).value;if(!sku||!list.length){this.status('Need SKU and locations');return}localStorage.setItem(this.keys.sku,sku);this.begin(list.map(location=>({location,sku})),{type:'sku',state,disp}); },
    startExpiration(){ const containers=$('[data-cont]',this.panel).value.split(/\r?\n/).map(norm).filter(Boolean),asins=$('[data-asins]',this.panel).value.split(/\r?\n/).map(norm).filter(Boolean),date=$('[data-date]',this.panel).value,pr=$('[data-pr]',this.panel).checked;if(!containers.length||!asins.length||!date){this.status('Need containers, ASINs and date');return}const items=[];for(const location of containers)for(const asin of asins)items.push({location,asin});this.begin(items,{type:'expiration',date,pr}); },
    step(){ const h=low(heading()),t=low(pageText()); if(t.includes('service failed')||t.includes('work is errored'))return'error';if(t.includes('success')&&t.includes('start over'))return'success';if(h.includes('confirm change')||t.includes('confirm change'))return'confirm';if(h.includes('select new disposition')||t.includes('select new disposition'))return'newDisp';if(h.includes('select new inventory state')||t.includes('select new inventory state'))return'newState';if(h.includes('select source disposition')||t.includes('select source disposition'))return'sourceDisp';if(h.includes('select source inventory state')||t.includes('select source inventory state'))return'sourceState';if(h.includes('expiration')||t.includes('expiration date'))return'expiration';if(h.includes('input fnsku')||h.includes('input fcsku')||t.includes('input fnsku or fcsku')||t.includes('scan item'))return'item';if(h.includes('scan location')||t.includes('scan location')||t.includes('scan container'))return'location';return'unknown'; },
    async drive(){ if(this.running)return;this.running=true;const tok=++this.token;try{while(this.active&&localStorage.getItem(this.keys.active)==='1'&&this.token===tok){const q=this.queue();if(!q.length){this.clear('Complete');break}const meta=JSON.parse(localStorage.getItem('aftm_edit_meta')||'{}'),current=q[0],step=this.step();this.status(`${meta.type||this.mode} • ${step} • ${q.length} remaining`);if(step==='error'){click(['start over'],'.aftm')||press(document,'r')}else if(step==='location'){const i=await waitFor(()=>inputOutside('.aftm'),10000,90,()=>this.token,tok);if(!i)break;setValue(i,current.location);press(i,'Enter')}else if(step==='item'){const value=meta.type==='sku'?current.sku:(current.fnsku||current.asin),i=await waitFor(()=>inputOutside('.aftm'),10000,90,()=>this.token,tok);if(!i)break;setValue(i,value);press(i,'Enter')}else if(step==='sourceState'){chooseRadio(meta.pr?'Pending Research':'Sellable')||chooseRadio('Unsellable');click(['continue'],'.aftm')}else if(step==='sourceDisp'){chooseRadio('Amazon Damage')||chooseRadio('Defective')||chooseRadio('Expired');click(['continue'],'.aftm')}else if(step==='newState'){chooseRadio(meta.type==='expiration'?'Sellable':meta.state);click(['continue'],'.aftm')}else if(step==='newDisp'){if(meta.type!=='expiration'&&low(meta.state)==='unsellable')chooseRadio(meta.disp);click(['continue'],'.aftm')}else if(step==='expiration'){const dateInput=$$('input[type="date"],input').filter(visible).find(i=>!i.closest('.aftm')&&/date|expir/i.test([i.id,i.name,i.placeholder,i.getAttribute('aria-label')].map(norm).join(' ')))||inputOutside('.aftm');if(dateInput){setValue(dateInput,meta.date);click(['save','continue','confirm'],'.aftm')||press(dateInput,'Enter')}}else if(step==='confirm'){click(['change items','confirm','continue'],'.aftm')||press(document,'Enter')}else if(step==='success'){click(['start over'],'.aftm')||press(document,'r');q.shift();this.saveQueue(q);localStorage.setItem(this.keys.done,String(+(localStorage.getItem(this.keys.done)||0)+1))}await sleep(350)}}finally{this.running=false}}
  };

  const MoveItems={active:false,busy:false,last:'',match:()=>/\/app\/moveitems/i.test(location.pathname),start(){this.refresh()},stop(){this.busy=false},async refresh(){if(!this.active||this.busy||!/enter quantity/i.test(pageText()))return;const qty=[...pageText().matchAll(/\bQuantity:\s*([0-9]{1,5})\b/gi)].map(m=>+m[1]).filter(n=>n>0).at(-1),i=$$('input').filter(visible).find(x=>/quantity|qty/i.test([x.id,x.name,x.placeholder].map(norm).join(' ')))||$$('input').filter(visible)[0];if(!qty||!i)return;const k=`${location.href}|${qty}`;if(k===this.last)return;this.last=k;this.busy=true;try{setValue(i,qty);await sleep(100);press(i,'Enter');await sleep(120);if(/enter quantity/i.test(pageText()))click(['continue','enter'])}finally{this.busy=false}}};

  const FcSku={active:false,match:()=>/\/app\/fcskuflip/i.test(location.pathname),start(){console.log('AFT Master FcSku module active')},stop(){}};
  const modules=[Edit,MoveItems,FcSku];let timer=0;
  function route(){clearTimeout(timer);timer=setTimeout(()=>{for(const m of modules){const yes=m.match();if(yes&&!m.active){m.active=true;m.start()}else if(!yes&&m.active){m.active=false;m.stop?.()}else if(yes)m.refresh?.()}},80)}
  function start(){injectCss();const mo=new MutationObserver(route);mo.observe(document.documentElement,{childList:true,subtree:true,characterData:true});window.addEventListener('hashchange',route,true);window.addEventListener('popstate',route,true);window.addEventListener('focus',route,true);route();console.log(`AFT Tools Master CLEAN TEST v${VERSION} loaded`)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
