// Rain alert. Skinrave renders a JOIN button in the rain pot when a rain is
// claimable and swaps its label to "JOINED" once you're in, so a rising edge on
// "present and not joined" is a new rain.
//
// Poll and observe together: the observer misses attribute-only re-renders, the
// timer alone is too coarse.

CR.feature({
  id: "rainAlert",
  setting: "rainAlertEnabled",

  start(ctx) {
    let armed = false;
    CR.ui.dock.status("watching");
    ctx.onCleanup(() => CR.ui.dock.status("idle"));

    const check = () => {
      const btn = CR.dom.$(CR.SEL.joinRainButton);
      const present = CR.dom.visible(btn);
      const joined = present && btn.textContent.trim().toUpperCase().includes("JOINED");

      if (present && !joined && !armed) {
        armed = true;
        CR.ui.dock.status("alert");
        CR.log.info("rain available");
        CR.fire(CR.rain.alert());
      } else if (!present && armed) {
        armed = false;
        CR.ui.dock.status("watching");
      }
    };

    ctx.interval(check, 2000);
    ctx.observe(document.body, { childList: true, subtree: true }, check);
    check();
  },
});

CR.rain = {
  COOLDOWN_MS: 120000,   // shared across tabs via storage

  potAmount() {
    return CR.dom.numberIn(CR.dom.$(CR.SEL.rainPot));
  },

  // Bigger pot plays further up the arpeggio.
  noteCount(amount) {
    if (amount === null) return 3;
    if (amount <= 100) return 2;
    if (amount <= 500) return 3;
    if (amount <= 1000) return 4;
    return 5;
  },

  async alert() {
    if (!CR.alive()) return;

    // Tell the worker first. It has its own cooldown and threshold, so a
    // muted or sound-throttled rain still reaches Discord.
    this.report();

    const { lastSoundTime = 0 } = await chrome.storage.local.get("lastSoundTime");
    if (Date.now() - lastSoundTime < this.COOLDOWN_MS) {
      CR.log.debug("alert suppressed, on cooldown");
      return;
    }
    await CR.settings.set({ lastSoundTime: Date.now() });

    const amount = this.potAmount();
    CR.sound.play(CR.settings.get("soundPattern"), {
      volume: CR.settings.get("volume") / 100,
      beeps: this.noteCount(amount),
    });

    await CR.settings.bump("rainCount");
    this.notify(amount);
  },

  // Fire-and-forget: the worker decides whether this becomes a Discord ping.
  report() {
    try {
      // No callback means this returns a promise, and it rejects when the
      // worker is asleep or gone. try/catch alone would leave that unhandled.
      const sent = chrome.runtime.sendMessage({ type: "cr:rain", amount: this.potAmount() });
      if (sent && typeof sent.catch === "function") {
        sent.catch((e) => CR.log.debug("worker unreachable:", e.message));
      }
    } catch (e) {
      CR.log.debug("could not reach the background worker:", e.message);
    }
  },

  notify(amount) {
    if (!("Notification" in window)) return;
    if (!CR.settings.get("notificationsEnabled")) return;

    const show = () => {
      const notif = new Notification("CertifiedRaver", {
        body: amount !== null
          ? `Rain of ${amount} is up — join now.`
          : "The rain pool is up — join now.",
        icon: chrome.runtime.getURL("icons/icon128.png"),
      });
      notif.onclick = () => { window.focus(); notif.close(); };
    };

    if (Notification.permission === "granted") show();
    else if (Notification.permission === "default") {
      Notification.requestPermission().then((p) => { if (p === "granted") show(); });
    }
  },
};
