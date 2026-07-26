// ==UserScript==
// @name         v5.0.21 SIM Markdown Toolbar
// @namespace    http://tampermonkey.net/
// @version      5.0.21
// @description  SIM Markdown toolbar with snippets, stable React attach, compact non-stretching buttons, plus snippet export/import (with repair for malformed stored JSON)
// @match        https://t.corp.amazon.com/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SIM_Markdown_Toolbar.user.js
// @downloadURL  https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SIM_Markdown_Toolbar.user.js
// ==/UserScript==

(function () {
    "use strict";

    const SNIPPET_KEY = "simMdSnippets_v1";
    const TOOLBAR_CLASS = "sim-md-toolbar";
    let warnedBadStorage = false;

    function repairJsonControlChars(raw) {
        // Fix "bad control character in string literal" by escaping raw control chars
        // (\n, \r, \t, \b, \f) that appear *inside* JSON strings.
        // Leaves whitespace outside strings untouched.
        let out = "";
        let inStr = false;
        let esc = false;

        for (let i = 0; i < raw.length; i++) {
            const ch = raw[i];

            if (!inStr) {
                if (ch === '"') inStr = true;
                out += ch;
                continue;
            }

            // inStr == true
            if (esc) {
                out += ch;
                esc = false;
                continue;
            }

            if (ch === "\\") {
                out += ch;
                esc = true;
                continue;
            }

            if (ch === '"') {
                out += ch;
                inStr = false;
                continue;
            }

            // Escape raw control characters inside string
            if (ch === "\n") { out += "\\n"; continue; }
            if (ch === "\r") { out += "\\r"; continue; }
            if (ch === "\t") { out += "\\t"; continue; }
            if (ch === "\b") { out += "\\b"; continue; }
            if (ch === "\f") { out += "\\f"; continue; }

            out += ch;
        }

        return out;
    }

    function normalizeImported(arr) {
        if (!Array.isArray(arr)) return [];
        const out = [];
        for (const x of arr) {
            if (!x || typeof x !== "object") continue;
            const name = String(x.name ?? "").trim();
            const text = String(x.text ?? "");
            if (!name) continue;
            out.push({ name, text });
        }
        return out;
    }

    function loadSnippets() {
        const raw = localStorage.getItem(SNIPPET_KEY);
        if (!raw) return [];
        try {
            return normalizeImported(JSON.parse(raw));
        } catch (_) {
            // Attempt repair for malformed JSON where newlines/tabs were pasted directly into string values
            try {
                const repaired = repairJsonControlChars(raw);
                const parsed = normalizeImported(JSON.parse(repaired));
                // Persist the repaired form so future loads are clean
                localStorage.setItem(SNIPPET_KEY, JSON.stringify(parsed));
                if (!warnedBadStorage) {
                    warnedBadStorage = true;
                    console.warn("[SIM MD] Repaired malformed snippet storage and re-saved.");
                }
                return parsed;
            } catch (e2) {
                if (!warnedBadStorage) {
                    warnedBadStorage = true;
                    console.warn("[SIM MD] Snippet storage is malformed and could not be repaired. Use Import to restore.");
                }
                return [];
            }
        }
    }

    function saveSnippets(v) {
        const clean = normalizeImported(v || []);
        localStorage.setItem(SNIPPET_KEY, JSON.stringify(clean));
        snippets = clean;
        refreshAllSnippetSelects();
    }

    let snippets = loadSnippets();

    function injectStyles() {
        if (document.getElementById("sim-md-style")) return;
        const s = document.createElement("style");
        s.id = "sim-md-style";
        s.textContent = `
            .${TOOLBAR_CLASS} {
                display: flex;
                align-items: center;
                gap: 4px;
                margin-bottom: 6px;
                flex-wrap: nowrap;
            }
            .${TOOLBAR_CLASS} button {
                flex: 0 0 auto;
                width: auto;
                min-width: unset !important;
                max-width: unset !important;
                padding: 2px 6px;
                height: 24px;
                font-size: 11px;
                line-height: 20px;
                white-space: nowrap;
                box-sizing: border-box;
            }
            .${TOOLBAR_CLASS} select {
                flex: 0 0 auto;
                min-width: 180px;
                height: 24px;
            }
        `;
        document.head.appendChild(s);
    }

    function getHandler(ta) {
        const k = Object.keys(ta).find(x => x.startsWith("__reactFiber"));
        if (!k) return null;
        let f = ta[k];
        while (f) {
            const p = f.memoizedProps || f.pendingProps;
            if (p && typeof p.onChange === "function" && "text" in p) return p.onChange;
            f = f.return;
        }
        return null;
    }

    function apply(ta, fn) {
        const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
        const o = fn({ s, e, v, sel: v.slice(s, e) });
        if (!o) return;

        const h = getHandler(ta);
        if (h) h(o.v);
        else {
            ta.value = o.v;
            ta.dispatchEvent(new Event("input", { bubbles: true }));
        }

        setTimeout(() => {
            ta.focus();
            ta.setSelectionRange(o.ss, o.se);
        }, 0);
    }

    const wrap   = (ta,a,b)=>apply(ta,({s,e,v,sel})=>({v:v.slice(0,s)+a+sel+b+v.slice(e),ss:s+a.length,se:s+a.length+sel.length}));
    const insert = (ta,t)=>apply(ta,({s,v})=>({v:v.slice(0,s)+t+v.slice(s),ss:s+t.length,se:s+t.length}));

    function fillSnippetOptions(sel) {
        // Always refresh from storage so console-set/imported changes show without a full reload
        snippets = loadSnippets();

        sel.innerHTML = "";
        const opt = (v,t,d)=>{
            const o=document.createElement("option");
            o.value=v; o.textContent=t;
            if (d) o.disabled=true;
            sel.appendChild(o);
        };
        opt("","Snippets…");
        opt("","──────────",true);
        snippets.forEach((s,i)=>opt("s:"+i,s.name));
        opt("","──────────",true);
        opt("add","+ Add Snippet");
        opt("manage","Manage Snippets");
        sel.value="";
    }

    function refreshAllSnippetSelects() {
        document.querySelectorAll("." + TOOLBAR_CLASS + " select[data-role='snippets']").forEach(sel => {
            fillSnippetOptions(sel);
            sel.value = "";
        });
    }

    function handleSnippetSelect(sel, ta) {
        const v = sel.value;
        if (!v) return;
        if (v.startsWith("s:")) {
            const sn = snippets[parseInt(v.slice(2), 10)];
            if (sn) insert(ta, sn.text);
        } else if (v === "add") openSnippetEditor();
        else if (v === "manage") openSnippetManager();
        sel.value="";
    }

    function escapeHtml(str) {
        return String(str ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function openSnippetEditor(edit) {
        const isEdit = typeof edit === "number";
        snippets = loadSnippets();
        const sn = isEdit ? snippets[edit] : { name:"", text:"" };

        const bd=document.createElement("div");
        bd.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:9999";
        const m=document.createElement("div");
        m.style.cssText="background:#fff;padding:16px;border-radius:6px;width:640px";

        m.innerHTML=`
            <b>${isEdit?"Edit":"Add"} Snippet</b><br><br>
            Name<br><input id="n" style="width:100%" value="${escapeHtml(sn?.name || "")}"><br><br>
            Text<br><textarea id="t" style="width:100%;height:200px">${escapeHtml(sn?.text || "")}</textarea><br><br>
            <button id="save">Save</button>
            <button id="cancel">Cancel</button>
        `;

        bd.appendChild(m); document.body.appendChild(bd);

        m.querySelector("#cancel").onclick=()=>bd.remove();
        m.querySelector("#save").onclick=()=>{
            const name=m.querySelector("#n").value.trim();
            if (!name) return alert("Name required");
            const text=m.querySelector("#t").value;

            const fresh = loadSnippets();
            if (isEdit) fresh[edit] = { name, text };
            else fresh.push({ name, text });

            saveSnippets(fresh);
            bd.remove();
        };
    }

    function openSnippetManager() {
        snippets = loadSnippets();

        const bd=document.createElement("div");
        bd.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:9999";
        const m=document.createElement("div");
        m.style.cssText="background:#fff;padding:16px;border-radius:6px;width:520px";

        m.innerHTML = `<b>Manage Snippets</b><br><br>` +
            snippets.map((s,i)=>`
                <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                    <span>${escapeHtml(s.name)}</span>
                    <span>
                        <button data-e="${i}">Edit</button>
                        <button data-d="${i}">Del</button>
                    </span>
                </div>`).join("") +
            `<br><button id="close">Close</button>`;

        bd.appendChild(m); document.body.appendChild(bd);

        m.querySelector("#close").onclick=()=>bd.remove();
        m.querySelectorAll("[data-e]").forEach(b=>b.onclick=()=>{bd.remove();openSnippetEditor(parseInt(b.dataset.e,10));});
        m.querySelectorAll("[data-d]").forEach(b=>b.onclick=()=>{
            const i=parseInt(b.dataset.d,10);
            if (!confirm("Delete snippet?")) return;

            const fresh = loadSnippets();
            fresh.splice(i,1);
            saveSnippets(fresh);

            bd.remove(); openSnippetManager();
        });
    }

    function downloadText(filename, text) {
        const blob = new Blob([text], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2500);
    }

    function tsForFilename() {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        return (
            d.getFullYear() +
            pad(d.getMonth() + 1) +
            pad(d.getDate()) + "-" +
            pad(d.getHours()) +
            pad(d.getMinutes()) +
            pad(d.getSeconds())
        );
    }

    function exportSnippets() {
        const payload = JSON.stringify(loadSnippets(), null, 2);
        downloadText(`sim-snippets-${tsForFilename()}.json`, payload);
    }

    function mergeSnippets(existing, incoming) {
        const out = (existing || []).slice();
        const names = new Set(out.map(s => s && s.name).filter(Boolean));

        for (const sn of incoming) {
            let name = sn.name;
            if (!names.has(name)) {
                out.push({ name, text: sn.text });
                names.add(name);
                continue;
            }
            let n = 2;
            while (names.has(`${name} (${n})`)) n++;
            const newName = `${name} (${n})`;
            out.push({ name: newName, text: sn.text });
            names.add(newName);
        }
        return out;
    }

    function importSnippetsFromFile(file) {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const raw = String(reader.result || "");
                const parsed = JSON.parse(raw);
                const incoming = normalizeImported(parsed);
                if (!incoming.length) return alert("Import failed: no valid snippets found.");

                const existing = loadSnippets();
                const hasExisting = existing.length > 0;

                if (hasExisting) {
                    const overwrite = confirm(
                        "Import snippets:\n\nOK = OVERWRITE existing snippets\nCancel = MERGE (keep existing; duplicates get a suffix)"
                    );
                    if (overwrite) {
                        saveSnippets(incoming);
                        alert(`Imported ${incoming.length} snippets (overwrote existing).`);
                    } else {
                        const merged = mergeSnippets(existing, incoming);
                        saveSnippets(merged);
                        alert(`Imported ${incoming.length} snippets (merged).`);
                    }
                } else {
                    saveSnippets(incoming);
                    alert(`Imported ${incoming.length} snippets.`);
                }
            } catch (e) {
                alert("Import failed: invalid JSON file.");
            }
        };
        reader.onerror = () => alert("Import failed: could not read file.");
        reader.readAsText(file);
    }

    function buildToolbar(ta) {
        const bar=document.createElement("div");
        bar.className = TOOLBAR_CLASS;

        const B=(l,f,title)=>{
            const b=document.createElement("button");
            b.type="button";
            b.textContent=l;
            if (title) b.title = title;
            b.onclick=()=>f(ta);
            bar.appendChild(b);
        };

        B("Bold",    t=>wrap(t,"**","**"));
        B("Italics", t=>wrap(t,"*","*"));
        B("BoldIT",  t=>wrap(t,"***","***"));
        B("Code",    t=>wrap(t,"`","`"));
        B("CodeBlk", t=>wrap(t,"```","```"));
        B("Quote",   t=>insert(t,"> "));
        B("•",       t=>insert(t,"- "));
        B("1.",      t=>insert(t,"1. "));
        B("HR",      t=>insert(t,"----"));
        B("Space",   t=>insert(t,"&nbsp;"));
        B("Strike",  t=>wrap(t,"~~","~~"));

        const sel=document.createElement("select");
        sel.dataset.role = "snippets";
        fillSnippetOptions(sel);
        sel.onchange=()=>handleSnippetSelect(sel,ta);
        bar.appendChild(sel);

        const exportBtn = document.createElement("button");
        exportBtn.type = "button";
        exportBtn.textContent = "Export";
        exportBtn.title = "Download your snippet templates as a .json file";
        exportBtn.onclick = () => exportSnippets();
        bar.appendChild(exportBtn);

        const importBtn = document.createElement("button");
        importBtn.type = "button";
        importBtn.textContent = "Import";
        importBtn.title = "Import snippet templates from a .json file";
        importBtn.onclick = () => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "application/json,.json";
            input.style.display = "none";
            input.onchange = () => {
                const f = input.files && input.files[0];
                if (f) importSnippetsFromFile(f);
                input.remove();
            };
            document.body.appendChild(input);
            input.click();
        };
        bar.appendChild(importBtn);

        return bar;
    }

    function attach() {
        document.querySelectorAll('textarea[data-testid="sim-markdownEditor--textArea"]').forEach(ta=>{
            if (ta.dataset.simToolbar === "1") return;
            const parent = ta.parentNode;
            if (!parent) return;

            parent.querySelectorAll("." + TOOLBAR_CLASS).forEach(tb=>tb.remove());
            parent.insertBefore(buildToolbar(ta), ta);
            ta.dataset.simToolbar = "1";
        });
    }

    injectStyles();
    attach();

    const mo = new MutationObserver(() => {
        Promise.resolve().then(attach);
    });
    mo.observe(document.body, { childList:true, subtree:true });
})();