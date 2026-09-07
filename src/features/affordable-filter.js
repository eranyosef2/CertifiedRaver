// Affordable filter. Hides battles costing more than your balance. Cards are
// display:none'd, never removed, so clearing restores the list untouched.
//
// Active state lives in storage so it survives SPA navigation and syncs tabs.

CR.feature({
  id: "affordableFilter",
  setting: "affordableFilterEnabled",
  routes: (r) => r.isBattleListPage(),

  start(ctx) {
    ctx.onCleanup(() => {
      CR.ui.dock.remove("affordable");
      CR.affordable.clear();
    });

    const sync = () => {
      CR.affordable.addAction();
      CR.affordable.render(CR.settings.get("affordableFilterActive"));
    };

    // The list virtualises as you scroll, so re-apply when it mutates.
    const list = CR.dom.$(CR.SEL.battlesList);
    if (list) ctx.observe(list, { childList: true }, sync);

    ctx.interval(sync, 2000);
    ctx.onCleanup(CR.settings.onChange((changed) => {
      if ("affordableFilterActive" in changed) sync();
    }));

    sync();
  },
});

CR.affordable = {
  addAction() {
    const active = CR.settings.get("affordableFilterActive");
    CR.ui.dock.action({
      id: "affordable",
      icon: CR.dom.svg(CR.ui.ICONS.wallet, 17),
      label: active ? "Showing what you can afford" : "Hide battles above your balance",
      active,
      onClick: () => CR.fire(CR.settings.set({ affordableFilterActive: !active })),
    });
  },

  balance() {
    const el = CR.dom.$(CR.SEL.userBalance);
    if (!el) return null;
    const val = parseFloat(el.getAttribute("data-user-balance") || el.getAttribute("data-balance"));
    return isNaN(val) ? null : val;
  },

  // Cards expose no price data, so find the currency icon and read the number
  // beside it, walking up a few levels to find the sibling.
  cardPrice(card) {
    const icons = card.querySelectorAll('img[src*="currencies/"], img[alt="TOKEN"], img[alt="STREAMER"]');
    for (const img of icons) {
      let el = img.parentElement;
      for (let level = 0; level < 3 && el; level++) {
        for (const child of el.children) {
          if (child.contains(img)) continue;
          const text = child.textContent.trim().replace(/,/g, "");
          if (/^\d+(\.\d+)?$/.test(text)) return parseFloat(text);
        }
        el = el.parentElement;
      }
    }
    return null;
  },

  cards() {
    const list = CR.dom.$(CR.SEL.battlesList);
    return list ? CR.dom.$$(":scope > div", list) : [];
  },

  apply() {
    const balance = this.balance();
    if (balance === null) return;
    for (const card of this.cards()) {
      const price = this.cardPrice(card);
      if (price === null) continue;
      card.style.display = price > balance ? "none" : "";
    }
  },

  clear() {
    for (const card of this.cards()) card.style.display = "";
  },

  render(active) {
    if (active) this.apply(); else this.clear();
  },
};
