// ==UserScript==
// @name         v0.2.0 AFT Tools Master CLEAN TEST
// @namespace    https://github.com/1Sirkkris
// @version      0.2.0
// @description  Clean AFT master for EditItems Each/Sku, FcSku Flip and MoveItems. Shared core only; no dead/hidden legacy engines.
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

  if (window.__AFT_MASTER_V020__) return;
  window.__AFT_MASTER_V020__ = true;

  const VERSION = '0.2.0';
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
    for (const type of ['keydown','keypress','keyup']) {
      (target || document).dispatchEvent(new KeyboardEvent(type, { key, code, keyCode:n, which:n, bubbles:true, cancelable:true }));
    }
  }

  function textInput(exclude = '') {
    return $$('input[type="text"],input:not([type]),textarea').filter(visible).find(el => !exclude || !el.closest(exclude)) || null;
  }

  function button(words, exclude = '') {
    const wanted = words.map(low);
    return $$('button,input[type="button"],input[type="submit"],a,[role="button"],span.a-button,div.a-button')
      .filter(visible)
      .filter(el => !exclude || !el.closest(exclude))
      .find(el => {
        const t = low(el.textContent || el.value || el.getAttribute('aria-label'));
        return t && wanted.some(w => t.includes(w));
      }) || null;
  }

  function click(words, exclude = '') {
    const n = button(words, exclude);
    if (!n) return false;
    const real = n.querySelector?.('input.a-button-input,input[type="submit"],button') || n;
    if (!visible(real)) return false;
    real.scrollIntoView?.({ block:'center', inline:'center' });
    real.click();
    return true;
  }

  async function waitFor(fn, timeout = 12000, every = 80, tokenFn = null, token = null) {
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
      const value = low(r.value).replace(/_/g,' ');
      let node = r, text = '';
      for (let i=0; i<7 && node; i++, node=node.parentElement) {
        const radios = node.querySelectorAll?.('input[type="radio"]').length || 0;
        if (radios === 1) { text = low(node.textContent); if (text) break; }
      }
      if (value === w || text === w || text.startsWith(w + ' ') || text.includes(w + ' (quantity:')) return r;
    }
    return null;
  }

  function chooseRadio(label) {
    const r = radioByText(label);
    if (!r) return false;
    r.scrollIntoView?.({ block:'center' });
    r.click();
    r.dispatchEvent(new Event('input',{bubbles:true}));
    r.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  }

  function injectCss() {
    if ($('#aft-master-style')) return;
    const s = document.createElement('style');
    s.id = 'aft-master-style';
    s.textContent = `.aftm-panel{position:fixed;right:12px;bottom:12px;z-index:2147483647;width:330px;background:#111827;color:#fff;border-radius:10px;box-shadow:0 8px 24px #0006;font:12px/1.35 Arial,sans-serif;overflow:hidden}.aftm-head{padding:8px 10px;background:#002e36;font-weight:800;cursor:pointer}.aftm-body{padding:10px;display:grid;gap:8px}.aftm-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.aftm-panel input,.aftm-panel textarea,.aftm-panel select{box-sizing:border-box;width:100%;padding:6px;border-radius:6px;border:1px solid #64748b;background:#fff;color:#111}.aftm-panel button{padding:6px 9px;border-radius:6px;border:1px solid #64748b;cursor:pointer;font-weight:700}.aftm-row{display:flex;gap:6px}.aftm-row>*{flex:1}.aftm-status{min-height:16px;font-weight:700}.aftm-danger{background:#7f1d1d;color:#fff}.aftm-primary{background:#002e36;color:#fff}`;
    document.documentElement.appendChild(s);
  }

  class Panel {
    constructor(id, title, html) {
      injectCss(); this.id = id; this.el = document.createElement('section'); this.el.id = id; this.el.className = 'aftm-panel';
      this.el.innerHTML = `<div class="aftm-head">${title} v${VERSION} ▴</div><div class="aftm-body">${html}</div>`;
      (document.body || document.documentElement).appendChild(this.el);
      const head = $('.aftm-head', this.el), body = $('.aftm-body', this.el);
      head.onclick = () => { const open = body.style.display !== 'none'; body.style.display = open ? 'none' : 'grid'; head.textContent = `${title} v${VERSION} ${open ? '▾' : '▴'}`; };
    }
    q(s) { return $(s, this.el); }
    remove() { this.el.remove(); }
  }

  const MoveItems = {
    active:false, busy:false, lastKey:'', lastAt:0,
    match:()=>/\/app\/moveitems/i.test(location.pathname), start(){ this.refresh(); }, stop(){ this.busy=false; },
    refresh: async function() {
      if (!this.active || this.busy || !/enter quantity/i.test(pageText())) return;
      const qty = [...pageText().matchAll(/\bQuantity:\s*([0-9]{1,5})\b/gi)].map(m=>+m[1]).filter(n=>n>0).at(-1);
      const input = $$('input').filter(visible).find(i=>/quantity|qty/i.test([i.id,i.name,i.placeholder,i.getAttribute('aria-label')].map(norm).join(' '))) || $$('input').filter(visible)[0];
      if (!qty || !input) return;
      const key = `${location.href}|${qty}|${pageText().slice(0,240)}`;
      if (key===this.lastKey && Date.now()-this.lastAt<3000) return;
      this.lastKey=key; this.lastAt=Date.now(); this.busy=true;
      try { setValue(input, qty); await sleep(100); press(input,'Enter'); await sleep(120); if (/enter quantity/i.test(pageText())) click(['continue','enter']); }
      finally { this.busy=false; }
    }
  };

  const FcSku = {
    active:false, running:false, token:0, panel:null,
    k:{old:'aftm_fc_old',next:'aftm_fc_new',loc:'aftm_fc_loc',queue:'aftm_fc_q',done:'aftm_fc_done',total:'aftm_fc_total',active:'aftm_fc_active'},
    match:()=>/\/app\/fcskuflip/i.test(location.pathname),
    start(){ this.ensure(); this.resume(); }, stop(){ this.token++; this.running=false; this.panel?.remove(); this.panel=null; },
    ensure(){
      if (this.panel?.el.isConnected || !document.body) return;
      this.panel = new Panel('aftm-fcsku','FcSku Multi Flip',`<label>Old FNSKU/FCSKU<input data-old></label><label>New FNSKU/FCSKU<input data-new></label><label>Containers / locations<textarea data-loc rows="6"></textarea></label><div class="aftm-row"><button data-start class="aftm-primary">START</button><button data-stop>STOP</button><button data-clear class="aftm-danger">CLEAR</button></div><div class="aftm-status" data-status>Idle</div>`);
      this.panel.q('[data-old]').value=localStorage.getItem(this.k.old)||''; this.panel.q('[data-new]').value=localStorage.getItem(this.k.next)||''; this.panel.q('[data-loc]').value=localStorage.getItem(this.k.loc)||'';
      this.panel.q('[data-start]').onclick=()=>this.startRun(); this.panel.q('[data-stop]').onclick=()=>{this.token++;this.running=false;this.status('Stopped');}; this.panel.q('[data-clear]').onclick=()=>this.clear();
      ['[data-old]','[data-new]','[data-loc]'].forEach(s=>this.panel.q(s).addEventListener('input',()=>this.saveFields())); this.update();
    },
    saveFields(){localStorage.setItem(this.k.old,norm(this.panel.q('[data-old]').value));localStorage.setItem(this.k.next,norm(this.panel.q('[data-new]').value));localStorage.setItem(this.k.loc,this.panel.q('[data-loc]').value);},
    queue(){try{return JSON.parse(localStorage.getItem(this.k.queue)||'[]')}catch{return[]}}, saveQueue(q){localStorage.setItem(this.k.queue,JSON.stringify(q));this.update()},
    status(t){if(this.panel)this.panel.q('[data-status]').textContent=t}, update(){const q=this.queue(),d=+(localStorage.getItem(this.k.done)||0),t=+(localStorage.getItem(this.k.total)||0);this.status(localStorage.getItem(this.k.active)==='1'?`${d}/${t} complete • ${q.length} remaining`:'Idle')},
    clear(){this.token++;this.running=false;[this.k.queue,this.k.done,this.k.total,this.k.active].forEach(k=>localStorage.removeItem(k));this.status('Queue cleared')},
    startRun(){this.saveFields();const old=localStorage.getItem(this.k.old),next=localStorage.getItem(this.k.next),q=this.panel.q('[data-loc]').value.split(/\r?\n/).map(norm).filter(Boolean);if(!old||!next||!q.length){this.status('Need old, new and container list');return}this.saveQueue(q);localStorage.setItem(this.k.done,'0');localStorage.setItem(this.k.total,String(q.length));localStorage.setItem(this.k.active,'1');this.drive();},
    resume(){if(localStorage.getItem(this.k.active)==='1'&&this.queue().length)this.drive()},
    kind(){const h=low(heading()),t=low(pageText());if((t.includes('success')&&t.includes('start over'))||h==='success')return'success';if(h.includes('scan container')||t.includes('scan container'))return'container';if(h.includes('enter new fnsku')||h.includes('enter new fcsku')||t.includes('enter new fnsku')||t.includes('enter new fcsku'))return'new';if(h.includes('input item')||t.includes('fnskus, fcskus, and lpns are supported'))return'old';if(h.includes('confirm flip')||t.includes('confirm flip'))return'confirm';return'unknown';},
    async drive(){if(this.running)return;this.running=true;const tok=++this.token;try{while(this.active&&localStorage.getItem(this.k.active)==='1'&&this.token===tok){const q=this.queue();if(!q.length){this.clear();this.status('Complete');break}const old=localStorage.getItem(this.k.old),next=localStorage.getItem(this.k.next),loc=q[0],k=this.kind();this.status(`${k} • ${q.length} remaining`);if(k==='old'){const i=await waitFor(()=>textInput('#aftm-fcsku'),10000,80,()=>this.token,tok);if(!i)break;setValue(i,old);press(i,'Enter')}else if(k==='new'){const i=await waitFor(()=>textInput('#aftm-fcsku'),10000,80,()=>this.token,tok);if(!i)break;setValue(i,next);press(i,'Enter')}else if(k==='container'){const i=await waitFor(()=>textInput('#aftm-fcsku'),10000,80,()=>this.token,tok);if(!i)break;setValue(i,loc);press(i,'Enter')}else if(k==='confirm'){if(!click(['confirm'],'#aftm-fcsku'))press(document,'Enter')}else if(k==='success'){click(['start over'],'#aftm-fcsku')||press(document,'r');q.shift();this.saveQueue(q);localStorage.setItem(this.k.done,String(+(localStorage.getItem(this.k.done)||0)+1));}await sleep(350);}}finally{this.running=false;this.update()}}
  };

  const EditItems = {
    active:false,running:false,token:0,panel:null,mode:null,
    k:{queue:'aftm_edit_q',active:'aftm_edit_active',done:'aftm_edit_done',total:'aftm_edit_total',state:'aftm_edit_state',disp:'aftm_edit_disp',sku:'aftm_edit_sku'},
    match:()=>/\/app\/edititems/i.test(location.pathname), detect(){const t=pageText();if(/\bMode\s*:\s*Each\b/i.test(t))return'each';if(/\bMode\s*:\s*Sku\b/i.test(t))return'sku';return null},
    start(){this.ensure();this.refresh()},stop(){this.token++;this.running=false;this.panel?.remove();this.panel=null},
    refresh(){const m=this.detect();if(!m)return;this.mode=m;this.ensure();this.panel.q('[data-mode]').textContent=m==='each'?'EACH • Pending Quick Flip':'SKU • EditItems Loop';if(localStorage.getItem(this.k.active)==='1'&&!this.running)this.drive()},
    ensure(){if(this.panel?.el.isConnected||!document.body)return;this.panel=new Panel('aftm-edit','EditItems',`<div data-mode>Detecting mode…</div><label>SKU / ASIN / FNSKU / FCSKU<input data-sku></label><label>Locations / containers / items<textarea data-list rows="6"></textarea></label><div class="aftm-grid"><label>Desired state<select data-state><option>Sellable</option><option selected>Unsellable</option><option>Pending Research</option></select></label><label>Desired damage<select data-disp><option>Amazon Damage</option><option>Defective</option><option>Distributor Damage</option><option>Expired</option></select></label></div><div class="aftm-row"><button data-start class="aftm-primary">START</button><button data-stop>STOP</button><button data-clear class="aftm-danger">CLEAR QUEUE</button></div><div class="aftm-status" data-status>Idle</div>`);this.panel.q('[data-sku]').value=localStorage.getItem(this.k.sku)||'';this.panel.q('[data-state]').value=localStorage.getItem(this.k.state)||'Unsellable';this.panel.q('[data-disp]').value=localStorage.getItem(this.k.disp)||'Amazon Damage';this.panel.q('[data-start]').onclick=()=>this.startRun();this.panel.q('[data-stop]').onclick=()=>{this.token++;this.running=false;this.status('Stopped')};this.panel.q('[data-clear]').onclick=()=>this.clear();},
    status(t){if(this.panel)this.panel.q('[data-status]').textContent=t},queue(){try{return JSON.parse(localStorage.getItem(this.k.queue)||'[]')}catch{return[]}},saveQueue(q){localStorage.setItem(this.k.queue,JSON.stringify(q))},
    clear(){this.token++;this.running=false;[this.k.queue,this.k.active,this.k.done,this.k.total].forEach(k=>localStorage.removeItem(k));this.status('Queue cleared')},
    startRun(){this.mode=this.detect();if(!this.mode){this.status('Mode not detected');return}const sku=norm(this.panel.q('[data-sku]').value),list=this.panel.q('[data-list]').value.split(/\r?\n/).map(norm).filter(Boolean),state=this.panel.q('[data-state]').value,disp=this.panel.q('[data-disp]').value;if(this.mode==='sku'&&!sku){this.status('SKU required for Mode: Sku');return}if(!list.length){this.status('Need at least one location/item');return}localStorage.setItem(this.k.sku,sku);localStorage.setItem(this.k.state,state);localStorage.setItem(this.k.disp,disp);this.saveQueue(list);localStorage.setItem(this.k.done,'0');localStorage.setItem(this.k.total,String(list.length));localStorage.setItem(this.k.active,'1');this.drive();},
    step(){const h=low(heading()),t=low(pageText());if(t.includes('the work is errored')||t.includes('service failed to process your request'))return'error';if(t.includes('success')&&t.includes('start over'))return'success';if(h.includes('confirm change')||t.includes('confirm change'))return'confirm';if(h.includes('select new disposition')||t.includes('select new disposition'))return'newDisp';if(h.includes('select new inventory state')||t.includes('select new inventory state'))return'newState';if(h.includes('select source disposition')||t.includes('select source disposition'))return'sourceDisp';if(h.includes('select source inventory state')||t.includes('select source inventory state'))return'sourceState';if(h.includes('input fnsku')||h.includes('input fcsku')||t.includes('input fnsku or fcsku'))return'item';if(h.includes('scan location')||t.includes('scan location')||t.includes('scan container'))return'location';return'unknown';},
    async drive(){if(this.running)return;this.running=true;const tok=++this.token;try{while(this.active&&localStorage.getItem(this.k.active)==='1'&&this.token===tok){const q=this.queue();if(!q.length){this.clear();this.status('Complete');break}const current=q[0],sku=localStorage.getItem(this.k.sku)||'',state=localStorage.getItem(this.k.state)||'Unsellable',disp=localStorage.getItem(this.k.disp)||'Amazon Damage',step=this.step();this.status(`${this.mode?.toUpperCase()} • ${step} • ${q.length} remaining`);if(step==='error'){click(['start over'],'#aftm-edit')||press(document,'r')}else if(step==='location'){const i=await waitFor(()=>textInput('#aftm-edit'),10000,80,()=>this.token,tok);if(!i)break;setValue(i,current);press(i,'Enter')}else if(step==='item'){const value=this.mode==='sku'?sku:current,i=await waitFor(()=>textInput('#aftm-edit'),10000,80,()=>this.token,tok);if(!i)break;setValue(i,value);press(i,'Enter')}else if(step==='sourceState'){chooseRadio('Sellable')||chooseRadio('Unsellable')||chooseRadio('Pending Research');click(['continue'],'#aftm-edit')}else if(step==='sourceDisp'){chooseRadio('Amazon Damage')||chooseRadio('Defective')||chooseRadio('Distributor Damage')||chooseRadio('Expired');click(['continue'],'#aftm-edit')}else if(step==='newState'){chooseRadio(state);click(['continue'],'#aftm-edit')}else if(step==='newDisp'){if(low(state)==='unsellable')chooseRadio(disp);click(['continue'],'#aftm-edit')}else if(step==='confirm'){click(['change items','confirm','continue'],'#aftm-edit')||press(document,'Enter')}else if(step==='success'){click(['start over'],'#aftm-edit')||press(document,'r');q.shift();this.saveQueue(q);localStorage.setItem(this.k.done,String(+(localStorage.getItem(this.k.done)||0)+1));}await sleep(350);}}finally{this.running=false}}
  };

  const modules=[MoveItems,FcSku,EditItems];let routeTimer=0;
  function route(){clearTimeout(routeTimer);routeTimer=setTimeout(()=>{for(const m of modules){const yes=m.match();if(yes&&!m.active){m.active=true;m.start()}else if(!yes&&m.active){m.active=false;m.stop?.()}else if(yes)m.refresh?.();}},80)}
  const start=()=>{const mo=new MutationObserver(route);mo.observe(document.documentElement,{childList:true,subtree:true,characterData:true});window.addEventListener('hashchange',route,true);window.addEventListener('popstate',route,true);window.addEventListener('focus',route,true);route();console.log(`AFT Tools Master CLEAN TEST v${VERSION} loaded`)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();