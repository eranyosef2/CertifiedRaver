// Feature lifecycle. Register a feature; the runtime starts and stops it based
// on its `setting` toggle and `routes` predicate, on boot, route change, and
// settings change.
//
//   CR.feature({
//     id: "myThing",
//     setting: "myThingEnabled",          // key in CR.DEFAULTS; omit = always on
//     routes: (r) => r.isBattlePage(),    // omit = every page
//     restartOn: ["volume"],              // extra keys that force a restart
//     start(ctx) { ... },
//     stop() { ... },                     // optional; ctx cleans itself up
//   });

CR.features = [];

CR.feature = function feature(def) {
  if (!def || !def.id || typeof def.start !== "function") {
    throw new Error("CR.feature: need at least { id, start }");
  }
  CR.features.push({ ...def, _running: false, _ctx: null });
};

// Anything created through ctx is torn down on stop, so features don't track
// their own timers, observers, or injected nodes.
function makeContext(id) {
  const cleanups = [];
  return {
    id,
    onCleanup(fn) { cleanups.push(fn); return fn; },

    interval(fn, ms) {
      const handle = setInterval(() => {
        if (!CR.alive()) { clearInterval(handle); return; }
        try { fn(); } catch (e) { CR.log.error(`${id} interval threw:`, e); }
      }, ms);
      cleanups.push(() => clearInterval(handle));
      return handle;
    },

    observe(target, options, cb) {
      if (!target) return null;
      const obs = new MutationObserver((records) => {
        if (!CR.alive()) { obs.disconnect(); return; }
        try { cb(records); } catch (e) { CR.log.error(`${id} observer threw:`, e); }
      });
      obs.observe(target, options);
      cleanups.push(() => obs.disconnect());
      return obs;
    },

    // Register an injected node (or selector) for removal on stop.
    own(nodeOrSelector) {
      cleanups.push(() => {
        const node = typeof nodeOrSelector === "string"
          ? document.querySelector(nodeOrSelector)
          : nodeOrSelector;
        if (node && node.remove) node.remove();
      });
      return nodeOrSelector;
    },

    _teardown() {
      while (cleanups.length) {
        const fn = cleanups.pop();
        try { fn(); } catch (e) { CR.log.error(`${id} cleanup threw:`, e); }
      }
    },
  };
}

CR.runtime = {
  shouldRun(f) {
    if (f.setting && !CR.settings.get(f.setting)) return false;
    if (typeof f.routes === "function" && !f.routes(CR.router)) return false;
    return true;
  },

  startFeature(f) {
    if (f._running) return;
    f._ctx = makeContext(f.id);
    f._running = true;
    try {
      f.start(f._ctx);
      CR.log.debug("started:", f.id);
    } catch (e) {
      CR.log.error(`feature "${f.id}" failed to start:`, e);
      this.stopFeature(f);
    }
  },

  stopFeature(f) {
    if (!f._running) return;
    f._running = false;
    try { if (typeof f.stop === "function") f.stop(); }
    catch (e) { CR.log.error(`feature "${f.id}" stop threw:`, e); }
    if (f._ctx) f._ctx._teardown();
    f._ctx = null;
    CR.log.debug("stopped:", f.id);
  },

  restartFeature(f) {
    this.stopFeature(f);
    if (this.shouldRun(f)) this.startFeature(f);
  },

  sync() {
    if (!CR.alive()) return;
    for (const f of CR.features) {
      const want = this.shouldRun(f);
      if (want && !f._running) this.startFeature(f);
      else if (!want && f._running) this.stopFeature(f);
    }
  },

  handleSettingsChange(changed) {
    const keys = Object.keys(changed);
    for (const f of CR.features) {
      if (!f._running) continue;
      if (keys.some((k) => (f.restartOn || []).includes(k))) this.restartFeature(f);
    }
    this.sync();
  },
};
