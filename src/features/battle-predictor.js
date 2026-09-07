// Battle ticket predictor. Once both seeds are known every roll is determined,
// so precompute the whole grid (round x slot) when the page settles and show it
// on demand. Read-only: it forecasts what the site will show.

CR.feature({
  id: "battlePredictor",
  setting: "battlePredictorEnabled",
  routes: (r) => r.isBattlePage(),

  start(ctx) {
    const state = { results: null, meta: null, loading: false, tries: 0, status: "loading" };
    CR.predictor.state = state;

    ctx.onCleanup(() => {
      CR.ui.dock.remove("predictor");
      CR.ui.panel.close("predictor");
    });

    // Show the button straight away. It used to appear only once the seeds had
    // been read, so any failure left no button and no explanation — the feature
    // looked like it simply wasn't there.
    CR.predictor.addAction(state);

    const attempt = async () => {
      if (state.results || state.loading) return;
      state.tries++;

      if (!CR.dom.$(CR.SEL.fairnessButton)) {
        // Give the page a while to mount before calling it a miss.
        if (state.tries > CR.predictor.MAX_TRIES) {
          state.status = "no-button";
          CR.predictor.addAction(state);
        }
        return;
      }

      state.loading = true;
      CR.predictor.addAction(state);
      try {
        const loaded = await CR.predictor.load(CR.router.battleId());
        if (loaded) {
          state.results = loaded.results;
          state.meta = loaded.meta;
          state.status = "ready";
        } else if (state.tries > CR.predictor.MAX_TRIES) {
          state.status = "no-seeds";
        }
      } finally {
        state.loading = false;
        CR.predictor.addAction(state);
      }
    };

    // Each attempt clicks the site's fairness button, so this must not run
    // forever — it used to retry for as long as the page stayed open.
    const timer = ctx.interval(() => {
      if (state.results || state.tries > CR.predictor.MAX_TRIES) {
        clearInterval(timer);
        return;
      }
      CR.fire(attempt());
    }, 1500);
    CR.fire(attempt());

    CR.predictor.retry = () => {
      state.tries = 0;
      state.status = "loading";
      CR.predictor.addAction(state);
      CR.fire(attempt());
    };
  },

  stop() {
    CR.predictor.state = null;
  },
});

CR.predictor = {
  state: null,
  MAX_TRIES: 12,   // ~20s of page-settling before we call it a miss

  async load(battleId) {
    if (!battleId) return null;

    let apiData = null;
    try {
      apiData = await CR.api.battle(battleId);
    } catch (e) {
      CR.log.debug("battle API unavailable:", e.message);
    }

    const seeds = await CR.seeds.resolve(apiData);
    if (!seeds) { CR.log.debug("no seeds yet"); return null; }
    CR.log.debug(`seeds via ${seeds.source}`);

    const totalRounds = this.resolveRounds(apiData);
    const players = this.resolvePlayers(apiData);
    const cases = this.buildCases(apiData);

    CR.log.info(`predicting ${totalRounds} round(s) x ${players.length} slot(s)`);
    CR.log.debug("slots:", players.map((p) => `${p.slot}=${p.name || "?"}`).join(" "));

    const results = await CR.fairness.simulate({
      serverSeed: seeds.serverSeed,
      blockId: seeds.blockId,
      totalRounds, slots: players.map((p) => p.slot), cases,
    });

    return { results, meta: { totalRounds, players, totalSlots: players.length, cases, seeds } };
  },

  resolveRounds(apiData) {
    if (apiData && apiData.totalRounds) return apiData.totalRounds;
    const el = CR.dom.$(CR.SEL.roundCount);
    const m = el && el.textContent.match(/(\d+)\s*of\s*(\d+)/i);
    return m ? parseInt(m[2], 10) : 1;
  },

  // The players, in slot order, carrying the slot number the fairness formula
  // needs. Reading a slot off an array index is what made every prediction land
  // in the wrong column — see the note in CR.fairness.simulate.
  resolvePlayers(apiData) {
    const teams = (apiData && apiData.teams) || [];
    const seated = [];
    let capacity = 0;

    for (const team of teams) {
      capacity += team.capacity || (team.users || []).length;
      for (const user of team.users || []) {
        if (typeof user.slot === "number") {
          seated.push({ slot: user.slot, name: user.username || null });
        }
      }
    }

    if (seated.length) {
      // An empty seat still rolls once someone (or a bot) takes it, so predict
      // every slot the battle holds rather than only the occupied ones.
      const total = Math.max(capacity, ...seated.map((p) => p.slot));
      const bySlot = new Map(seated.map((p) => [p.slot, p]));
      return Array.from({ length: total }, (_, i) => bySlot.get(i + 1) || { slot: i + 1, name: null });
    }

    // No teams in the payload — fall back to counting seats, numbering them in
    // order. Tickets stay correct for a solo battle and are a guess above that.
    const openings = apiData && apiData.rounds && apiData.rounds[0] && apiData.rounds[0].openings;
    const count = (openings && openings.length) || CR.dom.$$(CR.SEL.battleSlot).length || 2;
    return Array.from({ length: count }, (_, i) => ({ slot: i + 1, name: null }));
  },

  buildCases(apiData) {
    if (!apiData || !apiData.cases) return [];
    return apiData.cases.map((entry) => {
      const info = entry.case || entry;
      return {
        index: entry.index,
        amount: entry.amount,
        name: info.name,
        ticketRanges: CR.fairness.buildTicketRanges(info.items || []),
      };
    });
  },

  tally(results) {
    const counts = { gold: 0, red: 0, blue: 0, grey: 0 };
    let raves = 0;
    for (const row of results) {
      for (const cell of row) {
        counts[CR.fairness.tierOf(cell.ticket).name]++;
        if (cell.item && cell.item.rave) raves++;
      }
    }
    return { counts, raves };
  },

  LABELS: {
    loading:     "Reading the battle's seeds…",
    ready:       "Predicted tickets",
    "no-seeds":  "Couldn't read this battle's seeds",
    "no-button": "Couldn't find this battle's fairness button",
  },

  addAction(state) {
    CR.ui.dock.action({
      id: "predictor",
      icon: CR.dom.svg(CR.ui.ICONS.tickets, 17),
      label: this.LABELS[state.status] || this.LABELS.ready,
      active: CR.ui.panel.isOpen("predictor"),
      onClick: () => this.togglePanel(state),
    });
    const btn = CR.ui._actions.get("predictor");
    if (btn) {
      btn.classList.toggle("is-waiting", state.status === "loading");
      btn.classList.toggle("is-stuck", state.status === "no-seeds" || state.status === "no-button");
    }
  },

  togglePanel(state) {
    const ready = !!state.results;
    const opened = CR.ui.panel.toggle({
      id: "predictor",
      title: "Predicted tickets",
      subtitle: ready
        ? `${state.meta.totalRounds} rounds × ${state.meta.totalSlots} players`
        : this.LABELS[state.status] || "Working on it",
      body: ready ? this.render(state) : this.explain(state),
      onClose: () => this.addAction(state),
    });
    this.addAction(state);
    return opened;
  },

  // Something to look at when there's no grid, instead of no button at all.
  explain(state) {
    const wrap = document.createElement("div");
    wrap.className = "panel-body";

    const why = {
      loading: "Opening the battle's fairness panel to read its seeds. This " +
               "usually takes a couple of seconds.",
      "no-seeds": "The seeds weren't readable. That's expected on a battle " +
                  "that hasn't started — the server seed stays hidden until " +
                  "the first round rolls.",
      "no-button": "The fairness button wasn't found on this page. If the site " +
                   "has been redesigned the selector needs updating — run " +
                   "CR.diagnose() in the console and check caseSoundButton's " +
                   "neighbour, fairnessButton.",
    }[state.status] || "Working on it.";

    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = why;
    wrap.appendChild(p);

    if (state.status !== "loading") {
      const row = document.createElement("div");
      row.className = "tpl-actions";
      row.innerHTML = `<span class="spacer"></span>` +
                      `<button class="mini is-primary" type="button">Try again</button>`;
      row.querySelector("button").onclick = () => {
        CR.ui.panel.close("predictor");
        if (this.retry) this.retry();
      };
      wrap.appendChild(row);
    }
    return wrap;
  },

  render(state) {
    const { results, meta } = state;
    const slots = meta.totalSlots;
    const { counts, raves } = this.tally(results);

    const frag = document.createDocumentFragment();

    // Only the rare tiers are worth counting up here — blue and grey are the
    // bulk of every battle, and the grid already shows them.
    const strip = document.createElement("div");
    strip.className = "strip";
    const tally = (tier, n, name) =>
      n > 0
        ? `<span class="tally"><span class="swatch" style="background:var(--${tier})"></span>` +
          `<b>${n}</b> ${name}</span>`
        : "";
    strip.innerHTML =
      `<span><b>${raves}</b> rave${raves === 1 ? "" : "s"} incoming</span>` +
      `<span class="spacer"></span>` +
      tally("gold", counts.gold, "gold") + tally("red", counts.red, "red");
    frag.appendChild(strip);

    const wrap = document.createElement("div");
    wrap.className = "panel-body";

    const totals = new Array(slots).fill(0);
    const perSlotRaves = new Array(slots).fill(0);

    let rows = "";
    results.forEach((row, r) => {
      rows += `<tr><td><span class="round">${r + 1}</span></td>`;
      for (let s = 0; s < slots; s++) {
        const { ticket, item } = row[s];
        const tier = CR.fairness.tierOf(ticket);
        const rave = !!(item && item.rave);
        if (item) totals[s] += item.price;
        if (rave) perSlotRaves[s]++;
        rows +=
          `<td${rave ? ' class="is-rave"' : ""}>` +
            `<span class="cell">` +
              `<span class="ticket t-${tier.name}">${ticket}</span>` +
              (item ? `<span class="price">${item.price.toFixed(2)}</span>` : "") +
            `</span>` +
          `</td>`;
      }
      rows += "</tr>";
    });

    // Name the columns. Reading a row is only useful if you can tell which
    // column is yours, and slot order is not join order — "P1" next to the
    // first seat you see on the page would point at the wrong player.
    const head = meta.players
      .map((p) => {
        const full = p.name || `Slot ${p.slot}`;
        const short = full.length > 12 ? `${full.slice(0, 11)}…` : full;
        return `<th title="${CR.dom.esc(full)}">${CR.dom.esc(short)}</th>`;
      })
      .join("");

    wrap.innerHTML =
      `<table class="grid"><thead><tr><th>Round</th>` + head +
      `</tr></thead><tbody>${rows}</tbody></table>`;
    frag.appendChild(wrap);

    // Totals sit outside the scroll area so they stay readable on a long battle.
    const foot = document.createElement("div");
    foot.className = "foot";
    const footRow = (label, values, fmt) =>
      `<tr><td><span class="label">${label}</span></td>` +
      values.map((v) => `<td><span class="sum-val">${fmt(v)}</span></td>`).join("") +
      `</tr>`;
    foot.innerHTML =
      `<table>` +
      footRow("Raves", perSlotRaves, (v) => v) +
      footRow("Value", totals, (v) => v.toFixed(2)) +
      `</table>`;
    frag.appendChild(foot);

    return frag;
  },
};
