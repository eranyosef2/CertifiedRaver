// All extension UI lives in one shadow root attached to document.body.
//
// Nothing is ever inserted into the site's own containers. Those are React-
// managed: injecting there fought reconciliation, and a variable-width node in
// the battle toolbar overflowed the row mid-battle. A shadow root also means
// the site's Tailwind can't reach our markup and our CSS can't leak out.
//
// Design rule: colour is reserved for data. Chrome is neutral graphite; the
// only saturated colour in the interface is a ticket's rarity tier. The single
// accent (violet) marks interaction only, and sits far from all four tier hues.

CR.ui = {
  HOST_ID: "certifiedraver-root",
  _shadow: null,
  _dock: null,
  _actions: new Map(),

  shadow() {
    if (this._shadow && document.body.contains(this._shadow.host)) return this._shadow;

    const host = document.createElement("div");
    host.id = this.HOST_ID;
    // The host itself is inert: it must never intercept clicks meant for the
    // site. Children opt back in with pointer-events: auto.
    host.style.cssText =
      "position:fixed;inset:0;z-index:2147483000;pointer-events:none;";
    document.body.appendChild(host);

    this._shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = this.CSS;
    this._shadow.appendChild(style);
    return this._shadow;
  },

  mount(el) {
    this.shadow().appendChild(el);
    return el;
  },

  $(sel) { return this.shadow().querySelector(sel); },

  teardown() {
    const host = document.getElementById(this.HOST_ID);
    if (host) host.remove();
    this._shadow = null;
    this._dock = null;
    this._actions.clear();
  },
};

// --- dock -------------------------------------------------------------------
// A slim capsule pinned bottom-right showing only the actions valid for the
// current route, so it stays about 130px wide and never grows unbounded.

CR.ui.dock = {
  el() {
    if (CR.ui._dock && CR.ui.shadow().contains(CR.ui._dock)) return CR.ui._dock;

    const dock = document.createElement("div");
    dock.className = "dock";
    dock.innerHTML =
      '<span class="dock-status" part="status" title="Rain watch"></span>' +
      '<span class="dock-items"></span>';
    CR.ui.mount(dock);
    CR.ui._dock = dock;
    return dock;
  },

  // Idempotent: calling with the same id updates in place rather than
  // re-inserting, so nothing flickers on a re-render.
  action({ id, icon, label, onClick, active = false }) {
    const items = this.el().querySelector(".dock-items");
    let btn = items.querySelector(`[data-id="${id}"]`);

    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.id = id;
      btn.className = "dock-btn";
      items.appendChild(btn);
    }

    btn.innerHTML = icon;
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.classList.toggle("is-active", !!active);
    btn.onclick = onClick;
    CR.ui._actions.set(id, btn);
    this._sync();
    return btn;
  },

  remove(id) {
    const btn = CR.ui._actions.get(id);
    if (btn) btn.remove();
    CR.ui._actions.delete(id);
    this._sync();
  },

  // 'watching' — armed and waiting. 'alert' — rain is up right now.
  status(state) {
    const dot = this.el().querySelector(".dock-status");
    dot.className = `dock-status is-${state}`;
    dot.title = state === "alert" ? "Rain is up" : "Watching for rain";
  },

  // Hide the whole dock when there is nothing to show but the status dot.
  _sync() {
    const dock = this.el();
    dock.classList.toggle("is-bare", CR.ui._actions.size === 0);
  },
};

// --- panel ------------------------------------------------------------------

CR.ui.panel = {
  open({ id, title, subtitle, body, onClose }) {
    this.close(id);

    const panel = document.createElement("section");
    panel.className = "panel";
    panel.dataset.id = id;

    const head = document.createElement("header");
    head.className = "panel-head";
    head.innerHTML =
      `<div class="panel-titles">` +
        `<span class="panel-title"></span>` +
        (subtitle ? `<span class="panel-sub"></span>` : "") +
      `</div>` +
      `<button class="panel-close" type="button" aria-label="Close">` +
        CR.dom.svg('<path d="M18 6 6 18M6 6l12 12"/>', 16) +
      `</button>`;
    head.querySelector(".panel-title").textContent = title;
    if (subtitle) head.querySelector(".panel-sub").textContent = subtitle;
    head.querySelector(".panel-close").onclick = () => {
      this.close(id);
      if (onClose) onClose();
    };

    panel.appendChild(head);
    panel.appendChild(body);
    CR.ui.mount(panel);

    this._drag(panel, head);
    requestAnimationFrame(() => panel.classList.add("is-open"));
    return panel;
  },

  close(id) {
    const panel = CR.ui.shadow().querySelector(`.panel[data-id="${id}"]`);
    if (panel) panel.remove();
  },

  isOpen(id) {
    return !!CR.ui.shadow().querySelector(`.panel[data-id="${id}"]`);
  },

  toggle(config) {
    if (this.isOpen(config.id)) { this.close(config.id); return null; }
    return this.open(config);
  },

  _drag(panel, handle) {
    let dragging = false, dx = 0, dy = 0;

    handle.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".panel-close")) return;
      const rect = panel.getBoundingClientRect();
      dragging = true;
      dx = e.clientX - rect.left;
      dy = e.clientY - rect.top;
      // Switch from bottom/right anchoring to absolute placement on first drag.
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.top}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      handle.setPointerCapture(e.pointerId);
      panel.classList.add("is-dragging");
    });

    handle.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const maxX = window.innerWidth - panel.offsetWidth - 8;
      const maxY = window.innerHeight - panel.offsetHeight - 8;
      panel.style.left = `${Math.min(Math.max(8, e.clientX - dx), maxX)}px`;
      panel.style.top = `${Math.min(Math.max(8, e.clientY - dy), maxY)}px`;
    });

    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      panel.classList.remove("is-dragging");
      try { handle.releasePointerCapture(e.pointerId); } catch (err) { /* already gone */ }
    };
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  },
};

CR.ui.ICONS = {
  tickets: '<path d="M3 8.5V6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2.5a2 2 0 0 0 0 7V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2.5a2 2 0 0 0 0-7Z"/><path d="M14 5v14" stroke-dasharray="2 2.5"/>',
  recreate: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
  stack: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  wallet: '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M16 12.5h.01"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
};

// --- stylesheet ---
CR.ui.CSS = `
:host {
  /* Chrome: neutral graphite. Deliberately not a tinted black — it has to read
     as a separate instrument sitting above the site, not a hole in it. */
  --ink:      #14181C;
  --panel:    #1B2026;
  --raised:   #242A32;
  --hairline: #303740;
  --text:     #E8EAED;
  --muted:    #98A0A9;
  --faint:    #656D77;

  /* The one accent. Interaction and active state only — never data. */
  --accent:   #A96BE0;
  --accent-d: rgba(169, 107, 224, 0.14);

  /* Data. The only saturated colour in the interface. */
  --gold: #E8B54A;
  --red:  #E0645F;
  --blue: #5A93D4;
  --grey: #8E9298;

  --sans: ui-sans-serif, -apple-system, "SF Pro Text", "Segoe UI Variable Text",
          "Segoe UI", Roboto, sans-serif;
  --mono: ui-monospace, "SF Mono", "JetBrains Mono", "Cascadia Code",
          "Roboto Mono", monospace;

  --r-lg: 14px;
  --r-md: 10px;
  --r-sm: 7px;
  --shadow: 0 1px 2px rgba(0,0,0,.4), 0 12px 32px -8px rgba(0,0,0,.65);
  --ease: cubic-bezier(.22,.61,.36,1);
}

*, *::before, *::after { box-sizing: border-box; }
button { font: inherit; color: inherit; margin: 0; }

/* ---------- dock ---------- */

.dock {
  position: fixed;
  right: 18px;
  bottom: 18px;
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px 6px 12px;
  background: linear-gradient(180deg, #1E242B 0%, var(--ink) 100%);
  border: 1px solid var(--hairline);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow);
  font-family: var(--sans);
  /* A hairline of light along the top edge reads as a machined bevel. */
  background-clip: padding-box;
}
.dock::before {
  content: "";
  position: absolute;
  inset: 0 0 auto 0;
  height: 1px;
  border-radius: var(--r-lg) var(--r-lg) 0 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.09) 30%,
                              rgba(255,255,255,.09) 70%, transparent);
}
.dock.is-bare { padding: 6px 12px; }
.dock.is-bare .dock-items { display: none; }

.dock-status {
  position: relative;
  width: 7px; height: 7px;
  flex: none;
  border-radius: 50%;
  background: var(--faint);
  transition: background .3s var(--ease);
}
.dock-status.is-watching { background: #4F9E72; }
.dock-status.is-alert    { background: var(--gold); }
.dock-status.is-alert::after {
  content: "";
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 1px solid var(--gold);
  animation: ping 1.6s var(--ease) infinite;
}
@keyframes ping {
  0%   { transform: scale(.7); opacity: .9; }
  70%  { transform: scale(1.5); opacity: 0; }
  100% { opacity: 0; }
}

.dock-items { display: flex; align-items: center; gap: 4px; }

.dock-btn {
  display: grid;
  place-items: center;
  width: 32px; height: 32px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: background .15s var(--ease), color .15s var(--ease),
              border-color .15s var(--ease);
}
.dock-btn:hover { background: var(--raised); color: var(--text); }
.dock-btn:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-d);
}
.dock-btn.is-active {
  background: var(--accent-d);
  border-color: rgba(169,107,224,.34);
  color: #C9A6EE;
}
.dock-btn svg { display: block; }

/* ---------- panel ---------- */

.panel {
  position: fixed;
  right: 18px;
  bottom: 70px;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  max-height: min(70vh, 620px);
  max-width: min(92vw, 560px);
  background: var(--panel);
  border: 1px solid var(--hairline);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow);
  color: var(--text);
  font-family: var(--sans);
  overflow: hidden;
  /* One orchestrated moment: the panel grows out of the button that opened it. */
  transform: scale(.96) translateY(6px);
  opacity: 0;
  transform-origin: bottom right;
  transition: transform .18s var(--ease), opacity .18s var(--ease);
}
.panel.is-open { transform: none; opacity: 1; }
.panel.is-dragging { transition: none; user-select: none; }

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 13px 14px 12px 16px;
  border-bottom: 1px solid var(--hairline);
  cursor: grab;
  flex: none;
}
.panel.is-dragging .panel-head { cursor: grabbing; }
.panel-titles { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.panel-title { font-size: 13px; font-weight: 600; letter-spacing: -.01em; }
.panel-sub { font-size: 11.5px; color: var(--muted); }

.panel-close {
  flex: none;
  display: grid; place-items: center;
  width: 26px; height: 26px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--faint);
  cursor: pointer;
  transition: background .15s var(--ease), color .15s var(--ease);
}
.panel-close:hover { background: var(--raised); color: var(--text); }
.panel-close:focus-visible {
  outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-d);
}

.panel-body { overflow: auto; padding: 4px 8px 10px; }
.panel-body::-webkit-scrollbar { width: 9px; height: 9px; }
.panel-body::-webkit-scrollbar-thumb {
  background: var(--raised); border-radius: 9px; border: 2px solid var(--panel);
}
.panel-body::-webkit-scrollbar-thumb:hover { background: #2F3641; }

/* ---------- ticket grid ---------- */

.grid { border-collapse: separate; border-spacing: 0; width: 100%; }

.grid th {
  position: sticky; top: 0; z-index: 1;
  padding: 8px 10px 7px;
  background: var(--panel);
  border-bottom: 1px solid var(--hairline);
  font-size: 11px; font-weight: 500; color: var(--muted);
  text-align: center; white-space: nowrap;
}
.grid th:first-child { text-align: left; padding-left: 12px; }

.grid td {
  padding: 6px 10px;
  text-align: center;
  white-space: nowrap;
  border-bottom: 1px solid rgba(48,55,64,.5);
}
.grid tbody tr:last-child td { border-bottom: none; }
.grid td:first-child { text-align: left; padding-left: 12px; }

.round { font-size: 11px; color: var(--faint); font-variant-numeric: tabular-nums; }

.cell { display: inline-flex; flex-direction: column; align-items: center; gap: 1px; }
.ticket {
  font-family: var(--mono);
  font-size: 12.5px; font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: -.02em;
}
.price { font-family: var(--mono); font-size: 10px; color: var(--faint); }

.t-gold { color: var(--gold); }
.t-red  { color: var(--red); }
.t-blue { color: var(--blue); }
.t-grey { color: var(--grey); }

/* A rave lifts the cell onto a raised plate rather than adding a glyph —
   the number's own colour already carries rarity. */
.is-rave { background: rgba(232,181,74,.055); }

.sum td {
  padding-top: 9px; padding-bottom: 9px;
  border-top: 1px solid var(--hairline);
  border-bottom: none;
  font-size: 11.5px; font-weight: 600;
}
.sum .round { color: var(--muted); font-size: 11px; font-weight: 500; }
.sum-val { font-family: var(--mono); font-variant-numeric: tabular-nums; }

/* ---------- summary strip ---------- */

.strip {
  display: flex; align-items: center; gap: 14px;
  padding: 9px 16px;
  border-bottom: 1px solid var(--hairline);
  font-size: 11.5px; color: var(--muted);
  flex: none;
}
.strip b { color: var(--text); font-weight: 600; font-variant-numeric: tabular-nums; }
.strip .spacer { margin-left: auto; }
.tally { display: inline-flex; align-items: center; gap: 6px; }
.swatch { width: 6px; height: 6px; border-radius: 2px; flex: none; }

.foot {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0;
  padding: 0;
  border-top: 1px solid var(--hairline);
  background: linear-gradient(180deg, var(--panel), #1E242B);
  flex: none;
}
.foot::before {
  content: "";
  position: absolute;
  bottom: 100%; left: 0; right: 0;
  height: 22px;
  background: linear-gradient(transparent, var(--panel));
  pointer-events: none;
}
.foot table { border-collapse: separate; border-spacing: 0; width: 100%; }
.foot td { padding: 7px 10px; text-align: center; white-space: nowrap; }
.foot tr:first-child td { padding-top: 10px; }
.foot tr:last-child td { padding-bottom: 10px; }
.foot tr:first-child .sum-val { color: var(--gold); }
.foot td:first-child { text-align: left; padding-left: 12px; }
.foot .label { font-size: 11px; color: var(--muted); }
.foot .sum-val {
  font-family: var(--mono); font-size: 12px; font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* ---------- templates ---------- */

.mini {
  padding: 5px 10px;
  border: 1px solid var(--hairline);
  border-radius: var(--r-sm);
  background: var(--raised);
  color: var(--muted);
  font: inherit; font-size: 11px;
  cursor: pointer;
  transition: background .15s var(--ease), color .15s var(--ease), border-color .15s var(--ease);
}
.mini:hover:not(:disabled) { background: #2C333C; color: var(--text); }
.mini:disabled { opacity: .55; cursor: default; }
.mini.is-primary {
  background: var(--accent-d); border-color: rgba(169,107,224,.34); color: #C9A6EE;
}
.mini.is-primary:hover:not(:disabled) { background: rgba(169,107,224,.22); }
.mini:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--accent-d); }

.hint {
  padding: 11px 16px;
  border-bottom: 1px solid var(--hairline);
  font-size: 11.5px; line-height: 1.55; color: var(--muted);
  flex: none;
}
.hint b { color: var(--text); font-weight: 600; }
.hint .mini { margin-top: 8px; }

.tpl {
  padding: 12px 14px;
  border: 1px solid var(--hairline);
  border-radius: var(--r-md);
  background: var(--ink);
  margin: 8px 6px;
}
.tpl-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.tpl-name { font-size: 12.5px; font-weight: 600; }
.tpl-meta { display: flex; gap: 10px; font-size: 11px; color: var(--faint); white-space: nowrap; }
.tpl-cases { margin-top: 5px; font-size: 11.5px; color: var(--muted); line-height: 1.5; }
.tpl-cases.is-error { color: var(--red); }
.tpl-actions { display: flex; align-items: center; gap: 6px; margin-top: 11px; }
.tpl-actions .spacer { margin-left: auto; }

.tpl-edit { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--hairline); }
.tpl-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
.tpl-field { display: flex; flex-direction: column; gap: 5px; }
.tpl-field span { font-size: 11px; color: var(--faint); }
.tpl-field input, .tpl-case input {
  padding: 6px 9px;
  border: 1px solid var(--hairline);
  border-radius: var(--r-sm);
  background: var(--panel);
  color: var(--text);
  font: inherit; font-size: 12px;
}
.tpl-field input:focus, .tpl-case input:focus {
  outline: none; border-color: rgba(169,107,224,.45); box-shadow: 0 0 0 3px var(--accent-d);
}
.tpl-field input:disabled, .tpl-case input:disabled { opacity: .45; }

.tpl-caselist { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.tpl-case { display: flex; align-items: center; gap: 10px; font-size: 11.5px; color: var(--muted); }
.tpl-case span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tpl-case input { width: 68px; flex: none; }

.tpl-error { margin-top: 8px; font-size: 11.5px; line-height: 1.5; color: var(--red); }

.tpl-check {
  display: flex; align-items: center; gap: 8px;
  margin-top: 11px; font-size: 11.5px; color: var(--muted); cursor: pointer;
}
.tpl-check input { accent-color: var(--accent); cursor: pointer; }

.tpl-raw { margin-top: 12px; }
.tpl-raw summary {
  font-size: 11.5px; color: var(--muted); cursor: pointer; list-style: none;
}
.tpl-raw summary::-webkit-details-marker { display: none; }
.tpl-raw summary::before { content: "▸ "; color: var(--faint); }
.tpl-raw[open] summary::before { content: "▾ "; }
.tpl-raw textarea {
  width: 100%; min-height: 150px; margin-top: 8px; padding: 9px 10px;
  border: 1px solid var(--hairline); border-radius: var(--r-sm);
  background: var(--panel); color: var(--text);
  font-family: var(--mono); font-size: 11px; line-height: 1.5;
  resize: vertical;
}
.tpl-raw textarea:focus {
  outline: none; border-color: rgba(169,107,224,.45); box-shadow: 0 0 0 3px var(--accent-d);
}

.tpl-note { margin-top: 10px; font-size: 11px; color: var(--faint); line-height: 1.5; }

/* ---------- support prompt ---------- */

.support {
  position: fixed; inset: 0;
  pointer-events: auto;
  display: grid; place-items: center;
  background: rgba(8, 10, 13, .58);
  backdrop-filter: blur(4px);
  opacity: 0;
  transition: opacity .2s var(--ease);
}
.support.is-open { opacity: 1; }

.support-card {
  width: 420px; max-width: 92vw;
  background: var(--panel);
  border: 1px solid var(--hairline);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow);
  color: var(--text);
  font-family: var(--sans);
  transform: translateY(8px) scale(.98);
  transition: transform .22s var(--ease);
}
.support.is-open .support-card { transform: none; }

.support-body { padding: 20px; }
.support-lead { margin: 0 0 16px; font-size: 13px; line-height: 1.6; color: var(--muted); }

.support-code {
  display: flex; align-items: center; justify-content: space-between; gap: 14px;
  padding: 13px 15px; margin-bottom: 16px;
  background: var(--ink);
  border: 1px solid var(--hairline);
  border-radius: var(--r-md);
}
.support-label { display: block; font-size: 11px; color: var(--faint); margin-bottom: 3px; }
.support-value {
  font-family: var(--mono); font-size: 17px; font-weight: 600; letter-spacing: .04em;
}
.support-actions { display: flex; align-items: center; gap: 8px; }
.support-actions .spacer { margin-left: auto; }
.support-actions a.mini { text-decoration: none; display: inline-flex; align-items: center; }

@media (prefers-reduced-motion: reduce) {
  .support, .support-card { transition: none; }
  .support { opacity: 1; }
  .support-card { transform: none; }
}

/* ---------- like heart ---------- */

.case-heart {
  position: fixed;
  display: grid; place-items: center;
  padding: 0;
  pointer-events: auto;
  border: 1px solid var(--hairline);
  border-radius: var(--r-sm);
  background: var(--raised);
  color: var(--muted);
  cursor: pointer;
  transition: color .15s var(--ease), border-color .15s var(--ease),
              background .15s var(--ease);
}
.case-heart:hover { color: var(--red); border-color: rgba(224,100,95,.45); }
.case-heart.is-on { color: var(--red); border-color: rgba(224,100,95,.4); }
.case-heart.is-on svg { fill: var(--red); }
.case-heart.is-busy { opacity: .5; pointer-events: none; }
.case-heart:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--accent-d); }

.liked-blank {
  width: 40px; height: 30px; flex: none;
  border: 1px dashed var(--hairline); border-radius: 4px;
}



.liked {
  display: flex; align-items: center; gap: 11px;
  padding: 9px 12px;
  margin: 6px;
  border: 1px solid var(--hairline);
  border-radius: var(--r-md);
  background: var(--ink);
}
.liked img { width: 40px; height: 30px; object-fit: contain; flex: none; }
.liked-name { flex: 1; min-width: 0; font-size: 12.5px; overflow: hidden;
              text-overflow: ellipsis; white-space: nowrap; }

.empty { padding: 26px 20px; text-align: center; color: var(--muted); font-size: 12.5px; }

@media (prefers-reduced-motion: reduce) {
  .panel, .dock-btn, .dock-status, .panel-close { transition: none; }
  .panel { transform: none; opacity: 1; }
  .dock-status.is-alert::after { animation: none; }
}
`;
