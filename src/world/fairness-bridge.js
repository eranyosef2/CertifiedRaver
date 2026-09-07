// Runs in the page's MAIN world (manifest "world": "MAIN"), which is the only
// place the site's React-managed fairness modal is reachable.
//
// While a battle is live the API hides serverSeed but the modal renders it, so
// open the modal with everything it adds pushed off-screen, scrape the hex
// strings, press Escape, and hand the result back over window events.
//
// No chrome.* access here by design — keep it side-effect free apart from the
// modal round-trip.

(function () {
  "use strict";

  const REQUEST = "__cr_fairness_request";
  const RESPONSE = "__cr_fairness_response";
  const FAIRNESS_BUTTON = '[data-testid="battle-fairness-button"]';

  const HIDDEN_CSS =
    ";opacity:0!important;pointer-events:none!important;position:fixed!important;" +
    "top:-9999px!important;left:-9999px!important;";

  let busy = false;

  window.addEventListener(REQUEST, async () => {
    // Answer immediately rather than leaving the caller on its timeout.
    if (busy) {
      window.dispatchEvent(new CustomEvent(RESPONSE, { detail: null }));
      return;
    }
    busy = true;
    let result = null;
    const touched = [];

    // Restore exactly what was there — the user should see no flicker.
    const hide = (node) => {
      if (node.nodeType !== 1) return;
      touched.push({ node, css: node.style.cssText });
      node.style.cssText += HIDDEN_CSS;
    };
    const restore = () => {
      for (const { node, css } of touched) {
        try { node.style.cssText = css; } catch (e) { /* node may be gone */ }
      }
      touched.length = 0;
    };

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) for (const node of m.addedNodes) hide(node);
    });

    try {
      const fairnessBtn = document.querySelector(FAIRNESS_BUTTON);
      if (fairnessBtn) {
        observer.observe(document.body, { childList: true, subtree: true });
        fairnessBtn.click();

        for (let attempt = 0; attempt < 10 && !result; attempt++) {
          await new Promise((r) => setTimeout(r, 300));
          result = scrapeSeeds();
        }

        observer.disconnect();
        pressEscape();
        await new Promise((r) => setTimeout(r, 150));
        restore();
      }
    } catch (e) {
      console.error("[CertifiedRaver] fairness bridge:", e);
      observer.disconnect();
      restore();
    } finally {
      busy = false;
      window.dispatchEvent(new CustomEvent(RESPONSE, { detail: result }));
    }
  });

  function pressEscape() {
    const evt = () => new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true });
    document.dispatchEvent(evt());
    window.dispatchEvent(evt());
  }

  // The modal's fields aren't reliably labelled, so sweep for long hex strings
  // and classify by length: server seed 32 chars, EOS block id 64.
  function scrapeSeeds() {
    const hexes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent.trim();
      if (text.length >= 16 && /^[a-f0-9]+$/i.test(text)) hexes.push(text);
    }

    let serverSeed = null;
    let blockId = null;
    for (const hex of hexes) {
      if (hex.length === 32 && !serverSeed) serverSeed = hex;
      else if (hex.length === 64 && !blockId) blockId = hex;
    }

    // Loose pass if those lengths ever change.
    if (!serverSeed || !blockId) {
      for (const hex of hexes) {
        if (hex.length >= 16 && hex.length <= 40 && !serverSeed) serverSeed = hex;
        else if (hex.length > 40 && !blockId) blockId = hex;
      }
    }

    return serverSeed && blockId ? { serverSeed, blockId } : null;
  }
})();
