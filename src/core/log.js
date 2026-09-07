// Shared namespace. Every content-script file in the manifest's `js` array runs
// in the same isolated world, so they all see this one object. globalThis (not
// window) so the same file also loads inside the background service worker.
var CR = globalThis.CR || (globalThis.CR = {});

CR.TAG = "[CertifiedRaver]";
CR.DEBUG = false;   // flip while working on a feature

CR.log = {
  info: (...a) => console.log(CR.TAG, ...a),
  error: (...a) => console.error(CR.TAG, ...a),
  debug: (...a) => { if (CR.DEBUG) console.log(CR.TAG, ...a); },
};

// For work we deliberately don't await. Anything touching chrome.* REJECTS
// (rather than throws) once the extension context is invalidated by a reload,
// so a bare call leaves an unhandled rejection in the page console.
CR.fire = function fire(p) {
  if (p && typeof p.catch === "function") {
    p.catch((e) => CR.log.debug("background task failed:", e && e.message));
  }
  return p;
};

// After an extension reload the old content script keeps running but every
// chrome.* call throws. Guard anything touching chrome APIs.
CR.alive = function alive() {
  try { return !!chrome.runtime.id; } catch (e) { return false; }
};
