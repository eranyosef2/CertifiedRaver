// Like the case you're looking at.
//
// Skinrave's own like lives in the case adder, so liking something you met
// anywhere else means going and finding it again. This puts a heart next to the
// sound button on a case view, wherever you reached that case from.
//
// The heart is drawn in our shadow layer and positioned over the page, so
// nothing is inserted into the site's DOM and clicking it can't disturb the
// site's own handlers.

CR.feature({
  id: "caseLikes",
  setting: "caseLikesEnabled",

  start(ctx) {
    ctx.onCleanup(() => CR.likes.teardown());

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

    const arm = () => window.dispatchEvent(
      new CustomEvent("__cr_record_arm", { detail: { on: true } }));
    window.addEventListener("__cr_record_ready", arm);
    ctx.onCleanup(() => window.removeEventListener("__cr_record_ready", arm));
    arm();

    const schedule = () => CR.likes.schedule();
    ctx.observe(document.body, { childList: true, subtree: true }, schedule);
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule, { passive: true });
    ctx.onCleanup(() => {
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
    });

    ctx.interval(schedule, 1500);
    CR.likes.addAction();
    schedule();
  },
});

CR.likes = {
  _heart: null,
  _pending: false,

  teardown() {
    if (this._heart) this._heart.remove();
    this._heart = null;
    CR.ui.dock.remove("likes");
    CR.ui.panel.close("likes");
  },

  // The sound control on a case view, whichever spelling this build uses.
  soundButton() {
    for (const sel of CR.SEL.caseSoundButton) {
      const el = CR.dom.$(sel);
      if (el && CR.dom.visible(el)) return el;
    }
    return null;
  },

  // Identify the case being viewed. Prefer a numeric id, since that's what a
  // like request almost certainly wants; fall back to a slug so the like is at
  // least recorded locally.
  current() {
    const path = location.pathname;
    const numeric = path.match(/\/cases?\/(\d+)/);
    if (numeric) return { id: numeric[1], name: this.pageName() };

    const slug = path.match(/\/cases?\/([a-z0-9][a-z0-9-]{2,})/i);
    if (slug) {
      const pretty = slug[1].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      return { id: slug[1], slug: true, name: this.pageName() || pretty };
    }
    return null;
  },

  pageName() {
    const h = document.querySelector("h1, h2, [data-testid*='case-name' i]");
    const text = h && h.textContent.trim();
    return text && text.length < 80 ? text : null;
  },

  schedule() {
    if (this._pending) return;
    this._pending = true;
    requestAnimationFrame(() => {
      this._pending = false;
      CR.fire(this.paint());
    });
  },

  async paint() {
    if (!CR.alive()) return;

    const anchor = this.soundButton();
    const target = anchor ? this.current() : null;

    if (!anchor || !target) {
      if (this._heart) { this._heart.remove(); this._heart = null; }
      return;
    }

    if (!this._heart || !CR.ui.shadow().contains(this._heart)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "case-heart";
      btn.innerHTML = CR.dom.svg(
        '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8' +
        'l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8Z"/>', 18);
      CR.ui.mount(btn);
      this._heart = btn;
    }

    const heart = this._heart;
    const liked = await CR.cases.isLiked(target.id);
    heart.classList.toggle("is-on", liked);
    heart.title = `${liked ? "Liked" : "Like"}${target.name ? ` ${target.name}` : " this case"}`;
    heart.setAttribute("aria-label", heart.title);
    heart.onclick = () => CR.fire(this.toggle(target));

    // Sit immediately left of the sound button, matched to its height.
    const box = anchor.getBoundingClientRect();
    const size = Math.max(28, Math.min(box.height || 40, 48));
    heart.style.width = `${size}px`;
    heart.style.height = `${size}px`;
    heart.style.left = `${box.left - size - 8}px`;
    heart.style.top = `${box.top + (box.height - size) / 2}px`;
  },

  async toggle(target) {
    const heart = this._heart;
    if (heart) heart.classList.add("is-busy");
    try {
      if (await CR.cases.isLiked(target.id)) {
        await CR.cases.unlike(target.id);
      } else {
        const res = await CR.cases.like({ id: target.id, name: target.name || `Case ${target.id}`,
                                          iconUrl: this.pageIcon() });
        if (!res.synced) CR.log.info(`liked locally — ${res.reason}`);
      }
    } catch (e) {
      CR.log.error("like failed:", e.message);
    }
    if (heart) heart.classList.remove("is-busy");
    this.addAction();
    this.schedule();
    CR.fire(this.refresh());
  },

  // Largest image on a case view is almost always the case itself.
  pageIcon() {
    let best = null, area = 0;
    for (const img of document.images) {
      const r = img.getBoundingClientRect();
      if (r.width * r.height > area) { area = r.width * r.height; best = img; }
    }
    return best ? (best.currentSrc || best.src) : null;
  },

  addAction() {
    CR.fire(CR.cases.likes().then((list) => {
      CR.ui.dock.action({
        id: "likes",
        icon: CR.dom.svg(
          '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8' +
          'l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8Z"/>', 17),
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
      wrap.innerHTML = `<p class="empty">No liked cases yet. Open any case and hit
        the heart next to the sound button.</p>`;
      return wrap;
    }

    for (const c of list) {
      const row = document.createElement("div");
      row.className = "liked";
      row.innerHTML =
        (c.iconUrl ? `<img alt="" loading="lazy">` : `<span class="liked-blank"></span>`) +
        `<span class="liked-name"></span>` +
        `<button class="mini" type="button">Remove</button>`;
      if (c.iconUrl) row.querySelector("img").src = c.iconUrl;
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

