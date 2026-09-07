// Skinrave's provably-fair scheme.
//
//   key    = "<serverSeed>-<blockId>-<round>-<slot>"
//   ticket = parseInt(HMAC_SHA256(key, "").slice(0, 8), 16) % 10000
//
// The seed string is the HMAC KEY and the message is empty. Swap those and
// every number changes.
CR.fairness = {
  TICKETS: 10000,

  async hmacHex(key, message = "") {
    const enc = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      "raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
    return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  },

  ticketFromHash(hash) {
    return parseInt(hash.substring(0, 8), 16) % this.TICKETS;
  },

  async ticketFor(serverSeed, blockId, round, slot) {
    return this.ticketFromHash(await this.hmacHex(`${serverSeed}-${blockId}-${round}-${slot}`));
  },

  tierOf(ticket) {
    if (ticket < 50) return { name: "gold", color: "#facc15" };
    if (ticket < 250) return { name: "red", color: "#ef4444" };
    if (ticket < 1000) return { name: "blue", color: "#3b82f6" };
    return { name: "grey", color: "#9a9eb5" };
  },

  // Lay a case's items over the 0..9999 ticket space.
  //
  // Order is by ASCENDING chance, tie-broken by DESCENDING price — not by
  // price. Sorting on price alone mispredicts cases holding expensive but
  // common items.
  buildTicketRanges(rawItems) {
    const items = rawItems
      .map((item) => ({
        name: item.marketHashName,
        price: item.price ? item.price.amount : 0,
        chance: parseFloat(item.chance) || 0,
        iconUrl: item.iconUrl,
      }))
      .sort((a, b) => a.chance - b.chance || b.price - a.price);

    // A rave needs the item under 5% AND at least two such items in the case —
    // the animation cycles between rare items, so one rare item never triggers it.
    const canRave = items.filter((i) => Math.round(i.chance * 100) < 500).length >= 2;

    const ranges = [];
    let cursor = 0;
    for (const item of items) {
      const tickets = Math.round(item.chance * 100);
      ranges.push({
        ...item,
        rave: canRave && tickets < 500,
        from: cursor,
        to: cursor + tickets - 1,
      });
      cursor += tickets;
    }
    return ranges;
  },

  ticketToItem(ticket, ranges) {
    if (!ranges) return null;
    for (const range of ranges) {
      if (ticket >= range.from && ticket <= range.to) return range;
    }
    return null;
  },

  // Cases open in `index` order, each `amount` times in a row.
  buildRoundMap(cases) {
    const map = {};
    let round = 1;
    for (const c of [...cases].sort((a, b) => a.index - b.index)) {
      for (let i = 0; i < (c.amount || 1); i++) map[round++] = c;
    }
    return map;
  },

  // results[round-1][slot-1] = { ticket, item }
  async simulate({ serverSeed, blockId, totalRounds, totalSlots, cases }) {
    const roundMap = this.buildRoundMap(cases || []);
    const results = [];
    for (let round = 1; round <= totalRounds; round++) {
      const caseData = roundMap[round];
      const row = [];
      for (let slot = 1; slot <= totalSlots; slot++) {
        const ticket = await this.ticketFor(serverSeed, blockId, round, slot);
        row.push({ ticket, item: this.ticketToItem(ticket, caseData && caseData.ticketRanges) });
      }
      results.push(row);
    }
    return results;
  },
};

// The API withholds serverSeed while a battle is live, but the site's fairness
// modal renders it. Try the modal scraper first, then plain selectors, then the
// SSR payload, then the API (which does return it once the battle ends).
CR.seeds = {
  BRIDGE_REQUEST: "__cr_fairness_request",
  BRIDGE_RESPONSE: "__cr_fairness_response",

  fromBridge({ timeout = 6000 } = {}) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        window.removeEventListener(this.BRIDGE_RESPONSE, handler);
        resolve(null);
      }, timeout);

      const handler = (e) => {
        clearTimeout(timer);
        window.removeEventListener(this.BRIDGE_RESPONSE, handler);
        resolve(e.detail || null);
      };

      window.addEventListener(this.BRIDGE_RESPONSE, handler);
      window.dispatchEvent(new Event(this.BRIDGE_REQUEST));
    });
  },

  fromDOM() {
    for (const [seedSel, blockSel] of CR.SEL.seedPairs) {
      const seedEl = CR.dom.$(seedSel);
      const blockEl = CR.dom.$(blockSel);
      if (!seedEl || !blockEl) continue;
      const serverSeed = seedEl.textContent.trim();
      const blockId = blockEl.textContent.trim();
      if (serverSeed && blockId) return { serverSeed, blockId };
    }
    return null;
  },

  fromInlineScripts() {
    let text = "";
    for (const s of document.querySelectorAll("script")) {
      if (!s.src) text += (s.textContent || "") + "\n";
    }
    const cleaned = text.replace(/\\"/g, '"').replace(/\\'/g, "'");
    const seeds = [...cleaned.matchAll(/"(?:serverSeed|server_seed)"\s*:\s*"([^"]{16,})"/g)];
    const blocks = [...cleaned.matchAll(/"(?:eosBlockId|eos_block_id|eosBlock|blockId|block_id)"\s*:\s*"([^"]{16,})"/g)];
    if (!seeds.length || !blocks.length) return null;
    return {
      serverSeed: seeds[seeds.length - 1][1],
      blockId: blocks[blocks.length - 1][1],
    };
  },

  async resolve(apiData) {
    const bridge = await this.fromBridge();
    if (bridge && bridge.serverSeed && bridge.blockId) return { ...bridge, source: "modal" };

    const dom = this.fromDOM();
    if (dom) return { ...dom, source: "dom" };

    const inline = this.fromInlineScripts();
    if (inline) return { ...inline, source: "inline" };

    if (apiData && apiData.serverSeed && apiData.blockId) {
      return { serverSeed: apiData.serverSeed, blockId: apiData.blockId, source: "api" };
    }
    return null;
  },
};
