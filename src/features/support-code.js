// The "use my code" prompt.
//
// Asks the person using the extension to put the developer's affiliate code in
// on Skinrave. Shown on a long interval, dismissible, and it stops for good once
// they've used it — either because they said so, or because the affiliate API
// confirms it when a token is configured.
//
// Rendered in the shadow layer like everything else, so it can't disturb the
// page underneath.

CR.feature({
  id: "supportCode",
  setting: "supportCodeEnabled",

  start(ctx) {
    ctx.onCleanup(() => CR.support.close());

    // Let the page settle before asking for anything.
    ctx.interval(() => CR.fire(CR.support.maybeShow()), 30000);
    setTimeout(() => CR.fire(CR.support.maybeShow()), 8000);
  },
});

CR.support = {
  async maybeShow() {
    if (!CR.alive()) return;
    if (CR.settings.get("supportDone")) return;
    if (CR.ui.shadow().querySelector(".support")) return;

    const code = (CR.settings.get("supportCode") || "").trim();
    if (!code) return;

    // Only ask people who are actually signed in — otherwise there's nothing
    // for them to do with the code.
    const user = CR.currentUser();
    if (!user || !user.username) return;

    if (await this.alreadyApplied(user.username)) {
      await CR.settings.set({ supportDone: true });
      CR.log.debug("affiliate already applied — prompt retired");
      return;
    }

    const since = Date.now() - (CR.settings.get("supportShownAt") || 0);
    if (since < CR.settings.get("supportIntervalMs")) return;

    this.show(code);
  },

  // Walks the public applicant list for the configured token. Without a token
  // we simply can't tell, so we don't guess.
  async alreadyApplied(username) {
    const token = (CR.settings.get("supportAffiliateToken") || "").trim();
    if (!token) return false;

    const target = username.toLowerCase();
    try {
      let skip = 0;
      for (let page = 0; page < 40; page++) {   // hard stop; don't walk forever
        const data = await CR.api.affiliateApplicants(token, { skip, take: 30 });
        const list = data.list || [];
        if (list.some((e) => e.user?.username?.toLowerCase() === target)) return true;
        skip += 30;
        if (!list.length || skip >= (data.totalCount || 0)) return false;
      }
    } catch (e) {
      CR.log.debug("affiliate check failed:", e.message);
    }
    return false;
  },

  close() {
    const el = CR.ui.shadow().querySelector(".support");
    if (el) el.remove();
    if (this._onKey) {
      document.removeEventListener("keydown", this._onKey, true);
      this._onKey = null;
    }
  },

  async dismiss({ forever = false } = {}) {
    this.close();
    await CR.settings.set({
      supportShownAt: Date.now(),
      ...(forever ? { supportDone: true } : {}),
    });
  },

  show(code) {
    const wrap = document.createElement("div");
    wrap.className = "support";
    wrap.innerHTML =
      `<div class="support-card" role="dialog" aria-modal="true" aria-label="Support the developer">` +
        `<div class="support-body">` +
          `<p class="support-lead">CertifiedRaver is free. If it's useful, put my` +
          ` affiliate code in on Skinrave — it costs you nothing and it's the only` +
          ` thing I get out of it.</p>` +
          `<div class="support-code">` +
            `<div><span class="support-label">Affiliate code</span>` +
            `<span class="support-value"></span></div>` +
            `<button class="mini" data-act="copy" type="button">Copy</button>` +
          `</div>` +
          `<div class="support-actions">` +
            `<button class="mini" data-act="later" type="button">Not now</button>` +
            `<button class="mini" data-act="never" type="button">Already used it</button>` +
            `<span class="spacer"></span>` +
            `<a class="mini is-primary" data-act="go"` +
            ` href="https://skinrave.gg/en/affiliates" target="_blank" rel="noopener">Use code</a>` +
          `</div>` +
        `</div>` +
      `</div>`;

    wrap.querySelector(".support-value").textContent = code;

    const copy = wrap.querySelector('[data-act="copy"]');
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(code);
        copy.textContent = "Copied";
      } catch (e) {
        copy.textContent = "Copy failed";
      }
    };

    wrap.querySelector('[data-act="later"]').onclick = () => CR.fire(this.dismiss());
    wrap.querySelector('[data-act="never"]').onclick = () => CR.fire(this.dismiss({ forever: true }));
    wrap.querySelector('[data-act="go"]').onclick = () => CR.fire(this.dismiss());
    // Clicking the backdrop dismisses; the original made you hunt for a button.
    wrap.onclick = (e) => { if (e.target === wrap) CR.fire(this.dismiss()); };

    this._onKey = (e) => { if (e.key === "Escape") CR.fire(this.dismiss()); };
    document.addEventListener("keydown", this._onKey, true);

    CR.ui.mount(wrap);
    requestAnimationFrame(() => wrap.classList.add("is-open"));
    CR.fire(CR.settings.set({ supportShownAt: Date.now() }));
  },
};
