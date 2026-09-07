// Every selector that couples us to Skinrave. When the site redesigns, this is
// the only file that should need editing.
CR.SEL = {
  joinRainButton: 'button[aria-label="join-rain-button"]',
  rainPot: '[data-testid="rain-pot"]',

  fairnessButton: '[data-testid="battle-fairness-button"]',
  nativeRecreateButton: '[data-testid="battle-recreate-button"]',
  roundCount: '[data-testid="battle-round-count"]',
  battleSlot: '[data-testid="battle-slot"]',

  battlesList: '[data-testid="battles-list"]',
  createForm: '[data-testid="create-battle-form"], [data-testid="battle-create"], ' +
              '[data-testid="create-battle-modal"]',
  sortButtons: '[data-testid="battle-sort-buttons"]',
  userBalance: '[data-testid="user-balance"]',

  seedPairs: [
    ['[data-testid="battle-server-seed"]', '[data-testid="battle-eos-block-id"]'],
    ['[data-testid="server-seed"]', '[data-testid="eos-block-id"]'],
    ['[data-test="server-seed"]', '[data-test="eos-block-id"]'],
  ],
};


CR.dom = {
  $: (sel, root = document) => root.querySelector(sel),
  $$: (sel, root = document) => Array.from(root.querySelectorAll(sel)),

  visible(el) {
    return !!el && el.getBoundingClientRect().width > 0;
  },

  // First numeric text among descendant spans, commas stripped.
  numberIn(root, selector = "span") {
    if (!root) return null;
    for (const el of root.querySelectorAll(selector)) {
      const text = el.textContent.trim().replace(/,/g, "");
      if (/^\d+(\.\d+)?$/.test(text)) return parseFloat(text);
    }
    return null;
  },

  svg(paths, size = 20) {
    return (
      `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
      `stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
    );
  },
};

CR.ICONS = {
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  refresh:
    '<path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>' +
    '<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
};
