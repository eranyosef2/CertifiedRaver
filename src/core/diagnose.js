// Run CR.diagnose() in the console on skinrave.gg.
//
// Every feature here depends on selectors we inherited from a teardown, and a
// stale selector fails silently — the feature simply never appears. This prints
// what matched, what didn't, and what each feature is doing, so a missing
// button can be traced in one step instead of guessed at.

CR.diagnose = function diagnose() {
  const seen = (sel) => {
    try { return document.querySelectorAll(sel).length; } catch (e) { return "bad selector"; }
  };

  const selectors = {};
  for (const [name, value] of Object.entries(CR.SEL)) {
    if (typeof value === "string") {
      selectors[name] = seen(value);
    } else if (Array.isArray(value) && typeof value[0] === "string") {
      // A candidate list: report the first that matches, if any.
      const hit = value.find((s) => seen(s) > 0);
      selectors[name] = hit ? `matched: ${hit}` : 0;
    }
  }

  const features = CR.features.map((f) => ({
    id: f.id,
    enabled: f.setting ? !!CR.settings.get(f.setting) : true,
    routeMatches: typeof f.routes === "function" ? !!f.routes(CR.router) : true,
    running: !!f._running,
  }));

  const report = {
    version: chrome.runtime.getManifest().version,
    path: location.pathname,
    route: {
      battlePage: CR.router.isBattlePage(),
      battleId: CR.router.battleId(),
      battleList: CR.router.isBattleListPage(),
      createContext: CR.router.isCreateContext(),
    },
    features,
    selectors,
    predictor: CR.predictor?.state
      ? { status: CR.predictor.state.status, tries: CR.predictor.state.tries,
          hasResults: !!CR.predictor.state.results }
      : "not running",
    likes: {
      heartShowing: !!CR.likes?._heart,
      caseDetected: CR.likes?.current ? CR.likes.current() : null,
      likeRequestLearned: !!CR.cases?.learned(),
      saved: CR.settings.get("likedCases")?.length || 0,
    },
    templates: {
      saved: CR.settings.get("battleTemplates")?.length || 0,
      createRequestCaptured: !!CR.settings.get("lastCreated"),
    },
    signedInAs: CR.currentUser()?.username || null,
    // Labelled buttons on the page, to spot a renamed control quickly.
    pageButtons: Array.from(document.querySelectorAll("button[aria-label],button[data-testid]"))
      .slice(0, 40)
      .map((b) => b.getAttribute("data-testid") || b.getAttribute("aria-label")),
  };

  console.log("%c[CertifiedRaver] diagnose", "font-weight:bold", report);
  const dead = Object.entries(selectors).filter(([, v]) => v === 0).map(([k]) => k);
  if (dead.length) {
    console.warn("[CertifiedRaver] selectors matching nothing on this page:", dead);
  }
  return report;
};
