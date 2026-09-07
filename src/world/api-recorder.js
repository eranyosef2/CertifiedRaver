// MAIN-world tap that captures two of the site's own requests — creating a
// battle and liking a case — so we can replay them rather than guess at them.
//
// It stays armed while battle templates are on, because every battle you build
// is a template you might want to keep. It is disarmed until the isolated world
// asks, installs nothing until then, and only ever observes: every wrapped call
// passes straight through, and every hook is wrapped in try/catch so a bug here
// can never stop the site from working.

(function () {
  "use strict";

  const ARM = "__cr_record_arm";
  const HIT = "__cr_record_hit";

  let armed = false;
  let installed = false;

  // Two things only: creating a battle, and liking a case. Everything else the
  // site does — balances, withdrawals, account calls — is out of scope.
  function classify(method, url) {
    const m = String(method).toUpperCase();

    if (m === "POST" && /\/case-battles\b/.test(url) &&
        !/\/(recreate|join|leave|call-bot)\b/.test(url)) {
      return "create";
    }

    if (["POST", "PUT", "DELETE"].includes(m) && /(like|favou?rite)/i.test(url)) {
      return "like";
    }

    return null;
  }

  // The id in a like request is the case being liked: take it from the last
  // numeric path segment, falling back to an obvious body field.
  function caseIdFrom(url, body) {
    try {
      const segments = new URL(url, location.origin).pathname.split("/").filter(Boolean);
      for (let i = segments.length - 1; i >= 0; i--) {
        if (/^\d+$/.test(segments[i])) return segments[i];
      }
    } catch (e) { /* fall through to the body */ }
    if (body && typeof body === "object") {
      for (const key of ["caseId", "case_id", "id", "itemId"]) {
        if (body[key] != null) return String(body[key]);
      }
    }
    return null;
  }

  function emit(kind, method, url, body) {
    try {
      let parsed = null;
      if (typeof body === "string") {
        try { parsed = JSON.parse(body); } catch (e) { parsed = null; }
      } else if (body && typeof body === "object" && !(body instanceof FormData)) {
        parsed = body;
      }
      // A create request without a readable body tells us nothing. A like is
      // often a bodyless POST to a URL that already names the case, so keep it.
      if (kind === "create" && !parsed) return;

      window.dispatchEvent(new CustomEvent(HIT, {
        detail: {
          kind,
          url: String(url),
          method: String(method).toUpperCase(),
          body: parsed,
          caseId: kind === "like" ? caseIdFrom(url, parsed) : null,
        },
      }));
    } catch (e) {
      console.warn("[CertifiedRaver] recorder could not read a request", e);
    }
  }

  function install() {
    if (installed) return;
    installed = true;

    const realFetch = window.fetch;
    if (typeof realFetch === "function") {
      window.fetch = function (input, init) {
        try {
          if (armed) {
            const url = typeof input === "string" ? input : (input && input.url) || "";
            const method = (init && init.method) || (input && input.method) || "GET";
            const kind = classify(method, url);
            if (kind) emit(kind, method, url, init && init.body);
          }
        } catch (e) { /* never let the tap break a request */ }
        return realFetch.apply(this, arguments);
      };
    }

    // Axios and friends still go through XHR in the browser.
    const open = XMLHttpRequest.prototype.open;
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      try { this.__cr = { method, url }; } catch (e) { /* frozen instance */ }
      return open.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (body) {
      try {
        if (armed && this.__cr) {
          const kind = classify(this.__cr.method, this.__cr.url);
          if (kind) emit(kind, this.__cr.method, this.__cr.url, body);
        }
      } catch (e) { /* never let the tap break a request */ }
      return send.apply(this, arguments);
    };
  }

  window.addEventListener(ARM, (e) => {
    armed = !!(e.detail && e.detail.on);
    if (armed) install();
  });

  // The isolated world may have armed us before this script ran. Tell it we
  // are listening so it can re-send.
  window.dispatchEvent(new Event("__cr_record_ready"));
})();
