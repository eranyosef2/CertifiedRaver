// The site's own pushState calls happen in the main world and can't be hooked
// from here, so poll the path and listen for back/forward.
CR.router = {
  _current: location.pathname,
  _listeners: new Set(),
  _timer: null,

  battleId() {
    const m = location.pathname.match(/\/case-battles\/(\d+)/);
    return m ? m[1] : null;
  },

  isBattlePage() { return this.battleId() !== null; },

  isBattleListPage() { return /\/case-battles\/?$/.test(location.pathname); }

  ,isBattleCreatePage() { return /\/case-battles\/create\/?$/.test(location.pathname); }

  // Where "create a battle" lives: the dedicated page, or the list page whose
  // create button opens a modal.
  ,isCreateContext() { return this.isBattleCreatePage() || this.isBattleListPage(); },

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  },

  _emit() {
    const path = location.pathname;
    if (path === this._current) return;
    this._current = path;
    CR.log.debug("route:", path);
    for (const fn of this._listeners) {
      try { fn(path); } catch (e) { CR.log.error("router listener failed:", e); }
    }
  },

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => {
      if (!CR.alive()) { clearInterval(this._timer); this._timer = null; return; }
      this._emit();
    }, 400);
    window.addEventListener("popstate", () => this._emit());
  },
};
