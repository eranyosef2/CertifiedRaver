// Saved battle setups.
//
// `recreate` clones a battle 1:1, which is enough to relaunch something you
// liked but not to tweak it. To change rounds, mode or the case list we need
// the site's own create request — and rather than guess its field names, the
// API recorder captures a real one the first time you build a battle by hand.
// Everything here works off that captured payload.

CR.templates = {
  KEY: "battleTemplates",

  // Payload key names differ between sites and versions, so resolve each field
  // against the captured payload instead of assuming one spelling.
  ALIASES: {
    rounds:  ["totalRounds", "rounds", "roundsCount", "roundCount"],
    mode:    ["mode", "gameMode", "type", "battleType"],
    players: ["maxPlayers", "playerCount", "players", "slots"],
    private:  ["private", "isPrivate"],
    borrow:   ["borrow"],
    wildcard: ["wildcard", "isWildcard", "hasWildcard", "wildcardEnabled"],
    cases:   ["cases", "caseList", "items"],
  },

  async all() {
    if (!CR.alive()) return [];
    const { battleTemplates = [] } = await chrome.storage.local.get(this.KEY);
    return battleTemplates;
  },

  async put(template) {
    const list = await this.all();
    const at = list.findIndex((t) => t.id === template.id);
    const next = { ...template, updatedAt: Date.now() };
    if (at === -1) list.push(next); else list[at] = next;
    await chrome.storage.local.set({ [this.KEY]: list });
    return next;
  },

  async remove(id) {
    const list = (await this.all()).filter((t) => t.id !== id);
    await chrome.storage.local.set({ [this.KEY]: list });
  },

  async get(id) {
    return (await this.all()).find((t) => t.id === id) || null;
  },

  newId() {
    return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  },

  // Read a field out of a captured payload, whatever the site calls it.
  readField(payload, field) {
    const key = this.keyFor(payload, field);
    return key === null ? null : payload[key];
  },

  // A template built from the exact request the site sent when you created a
  // battle. This is the accurate path: no field names are guessed, and
  // settings we don't recognise still ride along inside `payload`.
  fromPayload(captured, name) {
    const body = captured.body || {};
    const cases = this.describeCases(body);

    return {
      id: this.newId(),
      name: name || (cases.length === 1
        ? `${cases[0].name} ×${cases[0].amount}`
        : `${cases.length || "?"} cases`),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sourceBattleId: null,
      borrow:   this.readField(body, "borrow") ?? 0,
      rounds:   this.readField(body, "rounds") ?? 0,
      mode:     this.readField(body, "mode") ?? "",
      players:  this.readField(body, "players") ?? 0,
      wildcard: this.readField(body, "wildcard") ?? null,
      cases,
      payload: captured,
    };
  },

  // The create request carries case ids, not names — names come from whatever
  // the page already told us, so fall back to the id when we have nothing.
  describeCases(body, lookup = {}) {
    const key = this.keyFor(body, "cases");
    const raw = key ? body[key] : null;
    if (!Array.isArray(raw)) return [];
    return raw.map((entry) => {
      if (typeof entry !== "object" || entry === null) {
        return { id: entry, name: lookup[entry] || `Case ${entry}`, amount: 1 };
      }
      const id = entry.caseId ?? entry.id ?? entry.case ?? null;
      const amount = entry.amount ?? entry.count ?? entry.quantity ?? 1;
      return { id, name: lookup[id] || entry.name || `Case ${id}`, amount };
    });
  },

  // Read a live battle and turn it into an editable spec.
  async fromBattle(battleId) {
    const data = await CR.api.battle(battleId);

    const cases = (data.cases || []).map((entry) => {
      const info = entry.case || entry;
      return {
        id: info.id ?? entry.caseId ?? entry.id ?? null,
        name: info.name || "Case",
        amount: entry.amount || 1,
        price: info.price?.amount ?? info.price ?? null,
      };
    });

    let players = 0;
    for (const team of data.teams || []) players += (team.users || []).length;

    return {
      id: this.newId(),
      name: cases.length === 1
        ? `${cases[0].name} ×${cases[0].amount}`
        : `${cases.length} cases`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sourceBattleId: String(battleId),
      borrow: 0,
      rounds: data.totalRounds || cases.reduce((n, c) => n + c.amount, 0) || 1,
      mode: this.readMode(data),
      players: players || 2,
      cases,
      // Set once the recorder has seen a real create request.
      payload: null,
    };
  },

  // The battle document's own mode field, whatever it happens to be called.
  readMode(data) {
    for (const key of this.ALIASES.mode) {
      if (data && data[key] != null) return String(data[key]);
    }
    return "";
  },

  // Which key in this payload holds `field`? Only keys actually present count.
  keyFor(payload, field) {
    for (const alias of this.ALIASES[field] || []) {
      if (payload && Object.prototype.hasOwnProperty.call(payload, alias)) return alias;
    }
    return null;
  },

  // Apply a template's editable fields onto a captured create payload.
  // Anything the payload doesn't carry is left alone rather than invented.
  applyTo(payload, template) {
    const body = JSON.parse(JSON.stringify(payload));
    const set = (field, value) => {
      const key = this.keyFor(body, field);
      if (key !== null && value !== undefined && value !== null && value !== "") {
        body[key] = value;
      }
    };

    set("rounds", template.rounds);
    set("mode", template.mode);
    set("players", template.players);
    set("borrow", template.borrow);
    // Booleans must bypass the empty-value guard in `set`.
    const wildKey = this.keyFor(body, "wildcard");
    if (wildKey !== null && template.wildcard !== null && template.wildcard !== undefined) {
      body[wildKey] = template.wildcard;
    }

    const casesKey = this.keyFor(body, "cases");
    const sample = casesKey && Array.isArray(body[casesKey]) ? body[casesKey][0] : null;
    const idKeyOf = (o) => ["caseId", "id", "case"].find((k) =>
      Object.prototype.hasOwnProperty.call(o, k));

    // Only rebuild when the captured payload shows us what a case entry looks
    // like. Without a sample we'd emit empty objects and the create would fail
    // in a way that's hard to read — better to send the original list.
    if (sample && typeof sample === "object" && idKeyOf(sample) && template.cases.length) {
      // Rebuild the list in the same shape the site sent, so unknown per-case
      // fields keep whatever the original had.
      body[casesKey] = template.cases
        .filter((c) => c.id != null)
        .map((c, i) => {
          const base = typeof sample === "object" && sample !== null
            ? { ...(body[casesKey][i] || sample) }
            : {};
          const idKey = idKeyOf(base);
          const amountKey = ["amount", "count", "quantity"].find((k) =>
            Object.prototype.hasOwnProperty.call(base, k));
          if (idKey) base[idKey] = c.id;
          if (amountKey) base[amountKey] = c.amount;
          return base;
        });
    }

    return body;
  },

  // True when nothing that needs the create endpoint has been changed, so a
  // plain recreate of the source battle is enough.
  isUnchanged(template) {
    return !!template.sourceBattleId && !template._dirty;
  },

  async launch(template) {
    if (!template.payload && this.isUnchanged(template)) {
      const data = await CR.api.recreateBattle(template.sourceBattleId, {
        borrow: template.borrow || 0,
      });
      if (!data || !data.id) throw new Error(data?.message || "no battle id returned");
      return data.id;
    }

    if (!template.payload) {
      throw new Error(
        "This template has no saved settings. Create a battle on the site and " +
        "save that instead."
      );
    }

    const { url, method } = template.payload._request;
    const body = this.applyTo(template.payload.body, template);
    const res = await fetch(url, {
      method: method || "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "x-version": "v2" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.id) {
      throw new Error(data.message || `create returned ${res.status}`);
    }
    return data.id;
  },
};
