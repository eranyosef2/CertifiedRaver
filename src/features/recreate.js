// Recreate. The site only offers this once a battle has finished, but the
// endpoint has no such restriction — so expose it in the dock straight away and
// drop it once the site's own recreate button appears.

CR.feature({
  id: "recreate",
  setting: "recreateEnabled",
  routes: (r) => r.isBattlePage(),

  start(ctx) {
    ctx.onCleanup(() => CR.ui.dock.remove("recreate"));

    const tick = () => {
      if (CR.dom.$(CR.SEL.nativeRecreateButton)) {
        CR.ui.dock.remove("recreate");
        return;
      }
      CR.recreate.addAction();
    };

    ctx.interval(tick, 1500);
    tick();
  },
});

CR.recreate = {
  busy: false,

  addAction() {
    CR.ui.dock.action({
      id: "recreate",
      icon: CR.dom.svg(CR.ui.ICONS.recreate, 17),
      label: "Recreate this battle",
      onClick: () => this.run(),
    });
  },

  async run() {
    const battleId = CR.router.battleId();
    if (!battleId || this.busy) return;
    if (!confirm("Recreate this battle with the same cases and settings?")) return;

    this.busy = true;
    const btn = CR.ui._actions.get("recreate");
    if (btn) { btn.style.opacity = "0.5"; btn.style.pointerEvents = "none"; }

    try {
      const data = await CR.api.recreateBattle(battleId);
      if (!data || !data.id) throw new Error(data && data.message ? data.message : "no battle id returned");
      CR.log.info("recreated as battle", data.id);
      location.href = `/en/cs2/case-battles/${data.id}`;
    } catch (e) {
      CR.log.error("recreate failed:", e);
      alert(`Recreate failed: ${e.message}`);
      this.busy = false;
      if (btn) { btn.style.opacity = ""; btn.style.pointerEvents = ""; }
    }
  },
};
