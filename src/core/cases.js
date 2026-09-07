// Case catalogue and likes.
//
// Two problems to solve. First, identifying a case anywhere on the site: every
// battle we load hands us `cases[]` with an id, a name and an icon URL, so we
// remember them. After that a case is recognisable by its picture on any page,
// including battles you're only watching.
//
// Second, actually liking it. The site's own like lives in the case adder and
// we don't know the request it sends — so, as with templates, the recorder
// learns it the first time you like a case by hand, and we replay it with a
// different id.

CR.cases = {
  CATALOGUE: "caseCatalogue",   // { [id]: { id, name, iconUrl } }
  LIKES: "likedCases",          // [{ id, name, iconUrl, at }]

  async catalogue() {
    if (!CR.alive()) return {};
    const { caseCatalogue = {} } = await chrome.storage.local.get(this.CATALOGUE);
    return caseCatalogue;
  },

  // Remember whatever cases a page just told us about.
  async remember(cases) {
    if (!CR.alive() || !cases || !cases.length) return;
    const cat = await this.catalogue();
    let added = 0;
    for (const c of cases) {
      if (c.id == null || !c.iconUrl) continue;
      const key = String(c.id);
      if (!cat[key]) added++;
      cat[key] = { id: c.id, name: c.name || cat[key]?.name || `Case ${c.id}`, iconUrl: c.iconUrl };
    }
    if (added) {
      await chrome.storage.local.set({ [this.CATALOGUE]: cat });
      CR.log.debug(`catalogued ${added} new case(s)`);
    }
    return cat;
  },

  async likes() {
    if (!CR.alive()) return [];
    const { likedCases = [] } = await chrome.storage.local.get(this.LIKES);
    return likedCases;
  },

  async isLiked(id) {
    return (await this.likes()).some((c) => String(c.id) === String(id));
  },

  // The site's like request, learned by watching you use its own button.
  learned() {
    return CR.settings.get("likeRequest");
  },

  // Swap the case id in a learned request. It can live in the URL path, the
  // query string, or the JSON body — check all three rather than assume.
  buildLikeRequest(learned, caseId) {
    const oldId = String(learned.caseId ?? "");
    let url = learned._request.url;

    if (oldId && url.includes(oldId)) {
      url = url.replace(oldId, String(caseId));
    }

    let body = null;
    if (learned.body && typeof learned.body === "object") {
      body = JSON.parse(JSON.stringify(learned.body));
      for (const key of Object.keys(body)) {
        if (String(body[key]) === oldId) body[key] = caseId;
      }
      // Some APIs name it plainly even when the sample id didn't collide.
      for (const key of ["caseId", "case_id", "id", "itemId"]) {
        if (Object.prototype.hasOwnProperty.call(body, key)) body[key] = caseId;
      }
    }

    return { url, method: learned._request.method, body };
  },

  async like(caseInfo) {
    const learned = this.learned();
    const local = () => this.addLocal(caseInfo);

    if (!learned) {
      await local();
      return { synced: false, reason: "saved here only — like one case on the site to teach me its button" };
    }

    const req = this.buildLikeRequest(learned, caseInfo.id);
    const res = await fetch(req.url, {
      method: req.method,
      credentials: "include",
      headers: { "Content-Type": "application/json", "x-version": "v2" },
      ...(req.body ? { body: JSON.stringify(req.body) } : {}),
    });
    if (!res.ok) {
      await local();
      throw new Error(`Skinrave returned ${res.status}`);
    }
    await local();
    return { synced: true };
  },

  async addLocal(caseInfo) {
    const list = await this.likes();
    if (list.some((c) => String(c.id) === String(caseInfo.id))) return list;
    list.push({ id: caseInfo.id, name: caseInfo.name, iconUrl: caseInfo.iconUrl, at: Date.now() });
    await chrome.storage.local.set({ [this.LIKES]: list });
    return list;
  },

  async unlike(id) {
    const list = (await this.likes()).filter((c) => String(c.id) !== String(id));
    await chrome.storage.local.set({ [this.LIKES]: list });
    return list;
  },

  // Match rendered images against the catalogue. Icon URLs often carry cache
  // busters or size suffixes, so compare on the filename stem.
  stem(url) {
    try {
      const path = new URL(url, location.origin).pathname;
      return path.split("/").pop().replace(/\.(png|jpe?g|webp|avif|svg)$/i, "").toLowerCase();
    } catch (e) {
      return "";
    }
  },

  index(catalogue) {
    const byStem = new Map();
    for (const c of Object.values(catalogue)) {
      const s = this.stem(c.iconUrl);
      if (s) byStem.set(s, c);
    }
    return byStem;
  },
};
