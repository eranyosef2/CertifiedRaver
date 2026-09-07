# How Rave+ works (teardown of `pnekmabmkpmklbongaonmplgfpapiodp`)

Notes from unpacking the published CRX (v2.7). This is what CertifiedRaver is
rebuilt from. Source layout of the original:

```
manifest.json     MV3, no service worker
content.js        1336 lines — everything, one IIFE
main-world.js       82 lines — fairness-modal scraper, MAIN world
popup.html/js     settings UI
```

Permissions are modest: `storage`, `notifications`, and
`host_permissions: ["*://api.skinrave.gg/*"]`. That last one is the interesting
part — it is what lets a content script running on `skinrave.gg` call the
`api.skinrave.gg` origin directly, with cookies, without CORS getting in the way.

---

## 1. Rain detection — no API involved

The headline feature never touches the API. It watches the DOM:

```js
document.querySelector('button[aria-label="join-rain-button"]')
```

A rain is "available" when that button exists, has non-zero width, and its text
does **not** contain `JOINED`. The script keeps a `joinButtonFound` flag and
fires on the rising edge, so one alert per rain rather than one per poll.

Two detectors run together — a 2s `setInterval` and a `MutationObserver` on
`document.body`. That redundancy is deliberate: on a React SPA the observer can
miss re-renders that only swap attributes, and the timer alone is too coarse.

Supporting details:

- Pot size comes from `[data-testid="rain-pot"]`, first numeric `<span>` inside.
- Pot size scales the beep count: `<=100 -> 2`, `<=500 -> 3`, `<=1000 -> 4`, else 5.
- A 2-minute cooldown is stored in `chrome.storage.local.lastSoundTime`, which
  also de-duplicates across multiple open tabs.
- Alert tones are synthesised with WebAudio oscillators — the extension ships no
  audio files. Three patterns (`classic` / `soft` / `urgent`) differing in
  waveform, frequency pair, spacing, and decay.
- The desktop notification uses the **page's** `Notification` API, not
  `chrome.notifications`, despite the `notifications` permission being declared.

## 2. Battle ticket predictor — the actual clever bit

Skinrave is provably fair: a roll is derived from a server seed, an EOS block
id, and a nonce. Once you hold all three, every future spin of a battle is
computable. The formula:

```
key     = "<serverSeed>-<eosBlockId>-<round>-<slot>"
digest  = HMAC-SHA256(key, "")        // empty message; the seed is the KEY
ticket  = parseInt(digest[0..8], 16) % 10000
```

Note the unusual construction: the combined seed string is the HMAC *key* and
the message is empty. Reproducing it exactly matters — swap the two and every
number changes.

**The seed problem.** `GET /case-battles/{id}` returns `blockId` immediately but
withholds `serverSeed` until the battle finishes — otherwise anyone could see
the outcome in advance. The site's own "provably fair" modal, however, renders
the seed while the battle is live.

**The workaround** (`main-world.js`) is the sharpest piece of the extension:

1. Start a `MutationObserver` on `document.body`.
2. Click `[data-testid="battle-fairness-button"]`.
3. Every node the modal appends gets `opacity:0; position:fixed; top:-9999px`
   pushed onto its inline style, so the modal opens completely unseen.
4. Poll up to 10 times at 300ms, walking all text nodes for hex strings.
   Classify by length: **32 chars = server seed, 64 chars = EOS block id**.
5. Dispatch `Escape` at both `document` and `window` to close it.
6. Restore the inline styles.

Result is handed back to the isolated world over a pair of `window` events
(`__rain_alert_request` / `__rain_alert_response`). It has to live in the MAIN
world because clicking a React-managed button from an isolated world works, but
the modal's own state and the SSR payload are only reachable from the page's
realm.

**Turning tickets into items.** `GET /case-battles/{id}` also returns the case
contents. Each item's `chance` is a percentage, so `round(chance * 100)` is its
slice of the 10000-ticket space. Items are laid out in order and the ticket
falls into one range.

The ordering rule is the easiest thing to get wrong, and the original author
left a comment about it: ranges are assigned by **ascending chance** (rarest
first), tie-broken by **descending price** — *not* by price. On "reverse" cases
that hold expensive-but-common items, sorting by price alone mispredicts every
row.

A second earned detail: an item is flagged as a "rave" (the rare-pull animation)
only if it is under 5% **and** the case contains at least two such items,
because the rave animation cycles between rare items and a case with a single
rare one never triggers it.

Rounds map to cases by sorting `cases` on `index` and repeating each one
`amount` times. Slots come from `rounds[0].openings.length`. Ticket colours:
`<50` gold, `<250` red, `<1000` blue, else grey.

## 3. Recreate — a UI restriction, not an API one

```
POST https://api.skinrave.gg/case-battles/recreate
     headers: x-version: v2, credentials: include
     body:    { id: <battleId>, borrow: 0 }
  -> { id: <newBattleId> }
```

The site only surfaces its recreate button once a battle has ended; the endpoint
has no such condition. The extension injects its own button next to the fairness
button and removes it as soon as `[data-testid="battle-recreate-button"]`
appears, then navigates to `/en/cs2/case-battles/<newId>`.

## 4. Affordable filter — pure DOM

Balance is read from an attribute (`[data-testid="user-balance"]`,
`data-user-balance`). Card prices are not exposed as data, so the code finds the
currency icon (`img[src*="currencies/"]`) and walks up to three ancestors
looking for a sibling whose text is numeric. Over-budget cards get
`display: none`. State lives in storage so it survives SPA navigation.

## 5. Things deliberately not carried over

- **The affiliate nag.** The original pages
  `/affiliates/public/applicants?token=<the author's token>` 30 at a time,
  compares every applicant username against `localStorage.profileData.username`,
  and if you are not in the list throws up a full-screen modal every 10 minutes
  pushing the author's referral code. The API client here keeps the endpoint
  wrapper (`CR.api.affiliateApplicants`) since it is genuinely useful for
  affiliate tooling, but nothing calls it and there is no popup.
- **Dead code.** `extractFromPageScripts` logged full seeds to the console and
  `getCaseOpeningWinnerNumber`/`ticketToItem` were partly duplicated; the
  `live` mode of the results panel and `showTicketStats`'s `completedRounds`
  argument were never reachable.

## 6. Fragility to expect

Everything except the fairness math is bound to `data-testid` attributes and
Tailwind class strings. A Skinrave redesign breaks detection silently — the
extension simply stops alerting. In this rebuild every selector is consolidated
in `src/core/dom.js` (`CR.SEL`) so there is exactly one place to fix.
