// Makes CR.diagnose() work from the ordinary page console.
//
// Content scripts run in an isolated world, so the `CR` namespace isn't
// reachable from the console's default (main world) context. Typing
// CR.diagnose() there gives "CR is not defined" even though everything is
// working fine. This exposes a main-world shim that asks the isolated world to
// run the real thing and hands back the result.

(function () {
  "use strict";

  const REQ = "__cr_diagnose_request";
  const RES = "__cr_diagnose_response";

  function diagnose() {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        window.removeEventListener(RES, done);
        console.warn("[CertifiedRaver] no reply — the extension isn't running on this page. " +
                     "Check it's enabled at chrome://extensions, then hard-reload.");
        resolve(null);
      }, 3000);

      function done(e) {
        clearTimeout(timer);
        window.removeEventListener(RES, done);
        console.log("%c[CertifiedRaver] diagnose", "font-weight:bold", e.detail);
        resolve(e.detail);
      }

      window.addEventListener(RES, done);
      window.dispatchEvent(new Event(REQ));
    });
  }

  window.CRdiagnose = diagnose;

  // Also answer to `CR.diagnose()`, since that's the name in the docs — but
  // never clobber a `CR` the page already owns.
  if (typeof window.CR === "undefined") {
    window.CR = { diagnose };
  } else if (window.CR && typeof window.CR === "object" && !window.CR.diagnose) {
    try { window.CR.diagnose = diagnose; } catch (e) { /* frozen; CRdiagnose still works */ }
  }
})();
