// Battle templates.
//
// Build a battle on Skinrave the normal way and the extension captures the
// exact request the site sends — every setting you picked, under the site's own
// field names. Save that as a template and relaunch it whenever, tweaked or not.
//
// Lives in the create-a-battle context rather than the whole site, because
// that's the only place it's useful. It renders in our own shadow dock, not
// inside the site's create form: injecting there is what used to break the
// battle toolbar.

CR.feature({
  id: "templates",
  setting: "templatesEnabled",
  routes: (r) => r.isCreateContext(),

  start(ctx) {
    ctx.onCleanup(() => {
      CR.ui.dock.remove("templates");
      CR.ui.panel.close("templates");
      window.dispatchEvent(new CustomEvent("__cr_record_arm", { detail: { on: false } }));
    });

    // Stay armed the whole time: any battle you create here is a template you
    // might want to keep.
    const arm = () => window.dispatchEvent(
      new CustomEvent("__cr_record_arm", { detail: { on: true } }));

    const onHit = async (e) => {
      if (!e.detail || e.detail.kind !== "create") return;
      await CR.settings.set({
        lastCreated: { _request: { url: e.detail.url, method: e.detail.method },
                       body: e.detail.body, at: Date.now() },
      });
      CR.log.info("captured the battle settings you just created");
      CR.tpl.addAction();
      CR.fire(CR.tpl.refresh());
    };
    window.addEventListener("__cr_record_hit", onHit);
    ctx.onCleanup(() => window.removeEventListener("__cr_record_hit", onHit));

    // Both worlds start at document_idle with no ordering guarantee, so an arm
    // sent before the recorder is listening would be dropped. It announces
    // itself on load; re-arm whenever it does.
    const onReady = () => arm();
    window.addEventListener("__cr_record_ready", onReady);
    ctx.onCleanup(() => window.removeEventListener("__cr_record_ready", onReady));

    arm();
    CR.tpl.addAction();
    ctx.interval(() => CR.tpl.addAction(), 5000);
  },
});

CR.tpl = {
  addAction() {
    const n = CR.settings.get("battleTemplates")?.length || 0;
    CR.ui.dock.action({
      id: "templates",
      icon: CR.dom.svg(CR.ui.ICONS.stack, 17),
      label: n ? `Battle templates (${n})` : "Battle templates",
      active: CR.ui.panel.isOpen("templates"),
      onClick: () => CR.fire(this.toggle()),
    });
  },

  async toggle() {
    if (CR.ui.panel.isOpen("templates")) {
      CR.ui.panel.close("templates");
      this.addAction();
      return;
    }
    await this.open();
  },

  async open() {
    const body = await this.render();
    CR.ui.panel.open({
      id: "templates",
      title: "Battle templates",
      subtitle: "Your saved battle setups",
      body,
      onClose: () => this.addAction(),
    });
    this.addAction();
  },

  async refresh() {
    if (CR.ui.panel.isOpen("templates")) { CR.ui.panel.close("templates"); await this.open(); }
  },

  async render() {
    const frag = document.createDocumentFragment();
    const list = await CR.templates.all();
    const last = CR.settings.get("lastCreated");

    const strip = document.createElement("div");
    strip.className = "strip";
    strip.innerHTML = `<span><b>${list.length}</b> saved</span><span class="spacer"></span>`;

    if (last) {
      const save = document.createElement("button");
      save.className = "mini is-primary";
      save.textContent = "Save last battle you created";
      save.onclick = () => CR.fire(this.saveLast(save));
      strip.appendChild(save);
    }
    frag.appendChild(strip);

    if (!last) {
      const hint = document.createElement("div");
      hint.className = "hint";
      hint.innerHTML =
        `<b>Create a battle to save it.</b> Set it up on the site as usual —
         cases, rounds, mode, wildcard, borrow — and the exact settings appear
         here to save as a template.`;
      frag.appendChild(hint);
    }

    const wrap = document.createElement("div");
    wrap.className = "panel-body";
    if (!list.length) {
      wrap.innerHTML = `<p class="empty">No templates yet.</p>`;
    } else {
      for (const t of list.slice().sort((a, b) => b.updatedAt - a.updatedAt)) {
        wrap.appendChild(this.row(t));
      }
    }
    frag.appendChild(wrap);
    return frag;
  },

  row(t) {
    const el = document.createElement("div");
    el.className = "tpl";
    const cases = t.cases.map((c) => `${c.name} ×${c.amount}`).join(", ") || "no cases";

    el.innerHTML =
      `<div class="tpl-head"><span class="tpl-name"></span><span class="tpl-meta"></span></div>` +
      `<div class="tpl-cases"></div>` +
      `<div class="tpl-actions">` +
        `<button class="mini" data-act="edit">Edit</button>` +
        `<button class="mini" data-act="delete">Delete</button>` +
        `<span class="spacer"></span>` +
        `<button class="mini is-primary" data-act="launch">Create battle</button>` +
      `</div>` +
      `<p class="tpl-error" hidden></p>` +
      `<div class="tpl-edit" hidden></div>`;

    el.querySelector(".tpl-name").textContent = t.name;
    const meta = [
      t.rounds ? `${t.rounds} rounds` : null,
      t.mode || null,
      t.players ? `${t.players} players` : null,
      t.wildcard ? "wildcard" : null,
      t.borrow ? `borrow ${t.borrow}` : null,
    ].filter(Boolean);
    for (const bit of meta) {
      const tag = document.createElement("span");
      tag.textContent = bit;
      el.querySelector(".tpl-meta").appendChild(tag);
    }
    const caseLine = el.querySelector(".tpl-cases");
    if (cases === t.name) caseLine.remove(); else caseLine.textContent = cases;

    el.querySelector('[data-act="delete"]').onclick = async () => {
      await CR.templates.remove(t.id);
      CR.fire(this.refresh());
    };
    el.querySelector('[data-act="edit"]').onclick = () => {
      const box = el.querySelector(".tpl-edit");
      if (!box.hidden) { box.hidden = true; return; }
      box.hidden = false;
      this.editor(box, t);
    };
    el.querySelector('[data-act="launch"]').onclick = (e) => this.launch(t, e.currentTarget);
    return el;
  },

  editor(box, t) {
    const field = (key, label, attrs = "") =>
      `<label class="tpl-field"><span>${label}</span>` +
      `<input data-k="${key}" ${attrs}></label>`;

    box.innerHTML =
      `<div class="tpl-grid">` +
        field("name", "Name") +
        field("borrow", "Borrow", 'type="number" min="0"') +
        field("rounds", "Rounds", 'type="number" min="1"') +
        field("players", "Players", 'type="number" min="2"') +
        field("mode", "Mode") +
      `</div>` +
      `<label class="tpl-check"><input type="checkbox" data-k="wildcard">` +
        `<span>Wildcard round</span></label>` +
      `<div class="tpl-caselist"></div>` +
      `<details class="tpl-raw"><summary>All settings</summary>` +
        `<p class="tpl-note">The exact request sent when this battle was created.
          Anything the fields above don't cover can be changed here.</p>` +
        `<textarea spellcheck="false"></textarea>` +
      `</details>` +
      `<div class="tpl-actions"><span class="spacer"></span>` +
        `<button class="mini is-primary" data-act="save">Save changes</button></div>`;

    for (const input of box.querySelectorAll("[data-k]")) {
      const v = t[input.dataset.k];
      if (input.type === "checkbox") input.checked = !!v;
      else input.value = v ?? "";
    }

    const caseList = box.querySelector(".tpl-caselist");
    t.cases.forEach((c, i) => {
      const row = document.createElement("label");
      row.className = "tpl-case";
      row.innerHTML = `<span></span><input type="number" min="0" data-case="${i}">`;
      row.querySelector("span").textContent = c.name;
      row.querySelector("input").value = c.amount;
      caseList.appendChild(row);
    });

    const raw = box.querySelector("textarea");
    raw.value = t.payload ? JSON.stringify(t.payload.body, null, 2) : "";
    if (!t.payload) box.querySelector(".tpl-raw").hidden = true;

    box.querySelector('[data-act="save"]').onclick = async () => {
      const err = box.closest(".tpl").querySelector(".tpl-error");
      const next = { ...t, cases: t.cases.map((c) => ({ ...c })) };

      for (const input of box.querySelectorAll("[data-k]")) {
        const k = input.dataset.k;
        if (input.type === "checkbox") next[k] = input.checked;
        else if (input.type === "number") next[k] = parseInt(input.value, 10) || 0;
        else next[k] = input.value;
      }
      for (const input of box.querySelectorAll("[data-case]")) {
        next.cases[+input.dataset.case].amount = parseInt(input.value, 10) || 0;
      }
      next.cases = next.cases.filter((c) => c.amount > 0);

      if (t.payload && raw.value.trim()) {
        try {
          next.payload = { ...t.payload, body: JSON.parse(raw.value) };
        } catch (e) {
          err.textContent = `That JSON doesn't parse: ${e.message}`;
          err.hidden = false;
          return;
        }
      }

      next._dirty = true;
      await CR.templates.put(next);
      CR.fire(this.refresh());
    };
  },

  async saveLast(btn) {
    const last = CR.settings.get("lastCreated");
    if (!last) return;
    btn.disabled = true;
    btn.textContent = "Saving…";
    const spec = CR.templates.fromPayload(last);
    await CR.templates.put(spec);
    await this.refresh();
  },

  async launch(t, btn) {
    const err = btn.closest(".tpl").querySelector(".tpl-error");
    err.hidden = true;
    btn.disabled = true;
    btn.textContent = "Creating…";
    try {
      const id = await CR.templates.launch(t);
      location.href = `/en/cs2/case-battles/${id}`;
    } catch (e) {
      CR.log.error("launch failed:", e);
      btn.disabled = false;
      btn.textContent = "Create battle";
      err.textContent = e.message;
      err.hidden = false;
    }
  },
};
