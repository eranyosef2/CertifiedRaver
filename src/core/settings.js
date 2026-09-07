// Settings live in chrome.storage.local. Add a key here and it shows up in both
// the content script cache and the popup.
CR.DEFAULTS = {
  rainAlertEnabled: true,
  battlePredictorEnabled: false,
  recreateEnabled: true,
  affordableFilterEnabled: true,

  notificationsEnabled: true,
  volume: 50,
  soundPattern: "chime",     // chime | soft | alert

  affordableFilterActive: false,

  // Support prompt
  supportCodeEnabled: true,
  supportCode: "coindrop",
  supportAffiliateToken: "",    // optional: lets the prompt stop by itself
  supportIntervalMs: 3600000,   // 1 hour
  supportShownAt: 0,
  supportDone: false,           // set once the code has been used, or dismissed for good

  caseLikesEnabled: true,
  likeRequest: null,            // the site's like request, learned by watching
  likedCases: [],
  caseCatalogue: {},            // id -> { id, name, iconUrl }

  templatesEnabled: true,
  lastCreated: null,            // the last create request the recorder saw
  battleTemplates: [],

  // Discord relay
  discordEnabled: false,
  discordWebhook: "",
  discordMention: "role",       // role | everyone | here | none
  discordRoleId: "",
  discordMinPot: 0,             // skip pings below this pot size
  discordCooldownMs: 300000,    // 5 min, so a busy site can't spam the channel

  rainCount: 0,
  lastSoundTime: 0,
  lastDiscordPost: 0,
  discordLastResult: "",        // surfaced in the popup so failures aren't silent
};

CR.settings = {
  cache: { ...CR.DEFAULTS },
  _listeners: new Set(),

  async load() {
    if (!CR.alive()) return this.cache;
    const stored = await chrome.storage.local.get(Object.keys(CR.DEFAULTS));
    for (const key of Object.keys(CR.DEFAULTS)) {
      this.cache[key] = stored[key] !== undefined ? stored[key] : CR.DEFAULTS[key];
    }
    return this.cache;
  },

  get(key) {
    return this.cache[key] !== undefined ? this.cache[key] : CR.DEFAULTS[key];
  },

  async set(patch) {
    Object.assign(this.cache, patch);
    if (CR.alive()) await chrome.storage.local.set(patch);
  },

  // Re-read before writing so other tabs don't get clobbered.
  async bump(key, by = 1) {
    if (!CR.alive()) return;
    const cur = (await chrome.storage.local.get(key))[key] || 0;
    const next = cur + by;
    await this.set({ [key]: next });
    return next;
  },

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  },

  _startWatching() {
    if (!CR.alive()) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      const changed = {};
      for (const [key, { newValue }] of Object.entries(changes)) {
        if (!(key in CR.DEFAULTS)) continue;
        this.cache[key] = newValue !== undefined ? newValue : CR.DEFAULTS[key];
        changed[key] = this.cache[key];
      }
      if (!Object.keys(changed).length) return;
      for (const fn of this._listeners) {
        try { fn(changed, this.cache); } catch (e) { CR.log.error("settings listener failed:", e); }
      }
    });
  },
};
