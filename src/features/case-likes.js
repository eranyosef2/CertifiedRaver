// Like a case wherever you meet it.
//
// The site's own like button lives in the case adder, so liking something you
// saw in a battle means going and finding it again. This puts a heart on every
// case picture on the page — including battles you're only watching.
//
// Cases are recognised by their picture, matched against a catalogue built from
// every battle we've loaded, so no per-page selectors are involved. Hearts are
// drawn in our shadow layer and positioned over the tiles: nothing is inserted
// into the site's DOM.

CR.feature({
  id: "caseLikes",
  setting: "caseLikesEnabled",

  start(ctx) {
    ctx.onCleanup(() => {
      CR.ui.dock.remove("likes");
      CR.ui.panel.close("likes");
      CR.likes.clearOverlay();
    });

    // Learn the site's like request the first time you use its own button.
    const onHit = async (e) => {
      if (!e.detail || e.detail.kind !== "like") return;
      await CR.settings.set({
        likeRequest: {
          _request: { url: e.detail.url, method: e.detail.method },
          body: e.detail.body,
          caseId: e.detail.caseId,
          at: Date.now(),
        },
      });
      CR.log.info("learned the site's like button — hearts now sync");
    };
    window.addEventListener("__cr_record_hit", onHit);
    ctx.onCleanup(() => window.removeEventListener("__cr_record_hit", onHit));

    // Arm the recorder here too: this feature runs site-wide, and the templates
    // feature only arms it on the create pages.
    const arm = () => window.dispatchEvent(
      new CustomEvent("__cr_record_arm", { detail: { on: true } }));
    window.addEventListener("__cr_record_ready", arm);
    ctx.onCleanup(() => window.removeEventListener("__cr_record_ready", arm));
    arm();

    CR.fire(CR.likes.init(ctx));
  },
});

CR.likes = {
  _index: new Map(),     // icon filename stem -> case
  _layer: null,
  _pending: false,

  async init(ctx) {
    await this.learnFromPage();
    this._index = CR.cases.index(await CR.cases.catalogue());
    this.addAction();

    const schedule = () => this.schedule();
    ctx.observe(document.body, { childList: true, subtree: true }, schedule);
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule, { passive: true });
    ctx.onCleanup(() => {
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
    });

    // Re-read the catalogue as new battles teach us new cases.
    ctx.interval(async () => {
      this._index = CR.cases.index(await CR.cases.catalogue());
      this.schedule();
    }, 10000);

    this.schedule();
  },

  // A battle page hands us ids, names and icons for everything in play —
  // including battles we're only spectating.
  async learnFromPage() {
    const id = CR.router.battleId();
    if (!id) return;
    try {
      const data = await CR.api.battle(id);
      const cases = (data.cases || []).map((entry) => {
        const info = entry.case || entry;
        return { id: info.id ?? entry.caseId ?? null, name: info.name, iconUrl: info.iconUrl };
      });
      await CR.cases.remember(cases.filter((c) => c.id != null && c.iconUrl));
    } catch (e) {
      CR.log.debug("could not read cases from this battle:", e.message);
    }
  },

  layer() {
    if (this._layer && CR.ui.shadow().contains(this._layer)) return this._layer;
    const el = document.createElement("div");
    el.className = "hearts";
    CR.ui.mount(el);
    this._layer = el;
    return el;
  },

  clearOverlay() {
    if (this._layer) this._layer.remove();
    this._layer = null;
  },

  // Coalesce scroll/mutation bursts into one paint.
  schedule() {
    if (this._pending) return;
    this._pending = true;
    requestAnimationFrame(() => {
      this._pending = false;
      CR.fire(this.paint());
    });
  },

  async paint() {
    if (!CR.alive() || !this._index.size) return;
    const liked = new Set((await CR.cases.likes()).map((c) => String(c.id)));
    const layer = this.layer();
    const seen = new Set();

    for (const img of document.images) {
      const hit = this._index.get(CR.cases.stem(img.currentSrc || img.src));
      if (!hit) continue;

      const box = img.getBoundingClientRect();
      // Skip anything off-screen or too small to carry a control.
      if (box.width < 44 || box.height < 44) continue;
      if (box.bottom < 0 || box.top > innerHeight || box.right < 0 || box.left > innerWidth) continue;

      const key = `${hit.id}:${Math.round(box.left)}:${Math.round(box.top)}`;
      seen.add(key);

      let heart = layer.querySelector(`[data-key="${CSS.escape(key)}"]`);
      if (!heart) {
        heart = document.createElement("button");
        heart.type = "button";
        heart.className = "heart";
        heart.dataset.key = key;
        heart.innerHTML = CR.dom.svg(
          '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8Z"/>', 14);
        heart.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          CR.fire(this.toggle(hit, heart));
        };
        layer.appendChild(heart);
      }

      const on = liked.has(String(hit.id));
      heart.classList.toggle("is-on", on);
      heart.title = `${on ? "Liked" : "Like"} ${hit.name}`;
      heart.style.left = `${box.right - 26}px`;
      heart.style.top = `${box.top + 6}px`;
    }

    for (const stale of layer.children) {
      if (!seen.has(stale.dataset.key)) stale.remove();
    }
  },

  async toggle(caseInfo, heart) {
    const on = await CR.cases.isLiked(caseInfo.id);
    heart.classList.add("is-busy");
    try {
      if (on) {
        await CR.cases.unlike(caseInfo.id);
      } else {
        const res = await CR.cases.like(caseInfo);
        if (!res.synced) CR.log.info(`liked "${caseInfo.name}" — ${res.reason}`);
      }
    } catch (e) {
      CR.log.error("like failed:", e.message);
    }
    heart.classList.remove("is-busy");
    this.addAction();
    this.schedule();
    CR.fire(this.refresh());
  },

  addAction() {
    CR.fire(CR.cases.likes().then((list) => {
      CR.ui.dock.action({
        id: "likes",
        icon: CR.dom.svg(
          '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8Z"/>', 17),
        label: list.length ? `Liked cases (${list.length})` : "Liked cases",
        active: CR.ui.panel.isOpen("likes"),
        onClick: () => CR.fire(this.togglePanel()),
      });
    }));
  },

  async togglePanel() {
    if (CR.ui.panel.isOpen("likes")) {
      CR.ui.panel.close("likes");
      this.addAction();
      return;
    }
    CR.ui.panel.open({
      id: "likes",
      title: "Liked cases",
      subtitle: CR.cases.learned()
        ? "Synced with your Skinrave likes"
        : "Saved here — like one case on the site to sync them",
      body: await this.render(),
      onClose: () => this.addAction(),
    });
    this.addAction();
  },

  async refresh() {
    if (CR.ui.panel.isOpen("likes")) { CR.ui.panel.close("likes"); await this.togglePanel(); }
  },

  async render() {
    const list = (await CR.cases.likes()).sort((a, b) => b.at - a.at);
    const wrap = document.createElement("div");
    wrap.className = "panel-body";

    if (!list.length) {
      wrap.innerHTML = `<p class="empty">No liked cases yet. Hit the heart on any
        case picture — in your battles or anyone else's.</p>`;
      return wrap;
    }

    for (const c of list) {
      const row = document.createElement("div");
      row.className = "liked";
      row.innerHTML =
        `<img alt="" loading="lazy">` +
        `<span class="liked-name"></span>` +
        `<button class="mini" type="button">Remove</button>`;
      row.querySelector("img").src = c.iconUrl;
      row.querySelector(".liked-name").textContent = c.name;
      row.querySelector("button").onclick = async () => {
        await CR.cases.unlike(c.id);
        this.addAction();
        this.schedule();
        CR.fire(this.refresh());
      };
      wrap.appendChild(row);
    }
    return wrap;
  },
};
