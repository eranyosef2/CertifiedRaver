// Makes the diagnostic callable from the ordinary page console.
//
// Content scripts run in an isolated world, so the `CR` namespace isn't
// reachable from the console's default (main world) context — typing
// CR.diagnose() there fails even with everything working.
//
// The primary name is CRdiagnose(), because `CR` is a short global the site
// itself may own. We still attach CR.diagnose as a convenience, but the page's
// own bundle can define `window.CR` after we run and wipe it out, so that
// attachment is retried a few times and is never the only route in.

(function () {
  "use strict";

  const REQ = "__cr_diagnose_request";
  const RES = "__cr_diagnose_response";

  function diagnose() {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        window.removeEventListener(RES, done);
        console.warn("[CertifiedRaver] no reply from the extension on this page. " +
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

  // Non-writable so a later page script can't quietly replace it.
  try {
    Object.defineProperty(window, "CRdiagnose", {
      value: diagnose, writable: false, configurable: true, enumerable: false,
    });
  } catch (e) {
    window.CRdiagnose = diagnose;
  }

  // Convenience only. Never clobber a CR the page owns, and re-attach a few
  // times in case the site defines its own after us.
  function attach() {
    try {
      if (typeof window.CR === "undefined") {
        window.CR = { diagnose };
      } else if (window.CR && typeof window.CR === "object" && !window.CR.diagnose) {
        window.CR.diagnose = diagnose;
      }
    } catch (e) { /* frozen or a getter — CRdiagnose() still works */ }
  }
  attach();
  for (const delay of [500, 2000, 5000]) setTimeout(attach, delay);
})();
