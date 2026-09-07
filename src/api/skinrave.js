// Skinrave's public REST API. host_permissions in the manifest is what lets a
// content script on skinrave.gg reach the api.skinrave.gg origin.
CR.api = {
  BASE: "https://api.skinrave.gg",

  async getJSON(path, init = {}) {
    const res = await fetch(this.BASE + path, { credentials: "include", ...init });
    if (!res.ok) {
      const err = new Error(`${init.method || "GET"} ${path} -> ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  },

  // { status, serverSeed, blockId, totalRounds,
  //   rounds: [{ openings: [...] }],
  //   teams: [{ users: [{ id, slot, username }] }],
  //   cases: [{ index, amount, case: { name, items: [
  //       { marketHashName, price: { amount }, chance, iconUrl } ] } }] }
  //
  // serverSeed is null while the battle is running — hence the modal scraper.
  battle(battleId) {
    return this.getJSON(`/case-battles/${battleId}`);
  },

  // Paginated public applicant list for one affiliate token. Used to check
  // whether someone has already applied your code, so the prompt can stop.
  affiliateApplicants(token, { skip = 0, take = 30 } = {}) {
    const q = new URLSearchParams({
      token, order: "DESC",
      from: "2020-01-01T00:00:00.000Z",
      to: "2030-01-01T00:00:00.000Z",
      skip: String(skip), take: String(take),
    });
    return this.getJSON(`/affiliates/public/applicants?${q}`);
  },

  // Clones a battle's cases and settings into a new one. Returns { id }.
  recreateBattle(battleId, { borrow = 0 } = {}) {
    return this.getJSON("/case-battles/recreate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-version": "v2" },
      body: JSON.stringify({ id: parseInt(battleId, 10), borrow }),
    });
  },
};

// The site keeps the signed-in profile in localStorage.
CR.currentUser = function currentUser() {
  try {
    const raw = localStorage.getItem("profileData");
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};
