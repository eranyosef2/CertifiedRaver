# CertifiedRaver

Skinrave.gg quality-of-life extension, rebuilt from a teardown of **Rave+**
(`pnekmabmkpmklbongaonmplgfpapiodp`).

- **Rain alerts** — beeps and notifies when the rain pool opens
- **Ticket predictor** — precomputes every roll of a case battle from its seeds
- **Recreate** — clones a battle before it finishes
- **Affordable filter** — hides battles above your balance
- **Discord ping** — posts to a channel when rain opens
- **Battle templates** — save a battle's setup, edit it, relaunch it
- **Liked cases** — heart any case you see, anywhere
- **Affiliate prompt** — asks users to enter your code

[`docs/ANALYSIS.md`](docs/ANALYSIS.md) covers how each one works and what the
original did.

## Install

`chrome://extensions` → Developer mode → **Load unpacked** → this folder.
Reload the extension after editing, then hard-reload the page.
Full walkthrough: [`docs/INSTALL.md`](docs/INSTALL.md).

Not using git? `scripts/update.ps1` (Windows) or `scripts/update.sh` (macOS,
Linux) updates the folder in place from GitHub — no zip juggling.

## Layout

```
src/core/      log, settings, sound (synth), dom (CR.SEL = all site
               selectors), ui (shadow-DOM dock + panels), router,
               registry (feature lifecycle)
src/api/       skinrave.js (REST), fairness.js (ticket math, seed resolution)
src/features/  one file per feature
src/world/     fairness-bridge.js — MAIN-world seed scraper
src/bootstrap.js
popup/
```

## Liked cases

Skinrave's own like lives in the case adder, so liking something you met
anywhere else means going and finding it again. This puts a heart next to the
sound button on any case view.

The heart anchors to the sound control, found by trying the candidates in
`CR.SEL.caseSoundButton` — `aria-label` matches first, since those exist for
screen readers and tend to outlive styling changes. The case is identified from
the URL, numeric id preferred, slug as a fallback.

## When something doesn't appear

Every feature hangs off selectors inherited from a teardown, and a stale
selector fails silently. Run this in the console on skinrave.gg:

```js
CR.diagnose()
```

Content scripts live in an isolated world, so the console's default context
can't see them. `src/world/console-bridge.js` exposes a main-world shim that
forwards the call, which is why the plain command works. Use **`CRdiagnose()`** — `CR` is a short global the site itself may own, and
its bundle can define `window.CR` after us. `CR.diagnose` is attached as a
convenience and re-attached a few times, but `CRdiagnose` is the reliable name.

It reports each feature (enabled / route matches / running), which selectors in
`CR.SEL` match anything on the current page, what the predictor is doing, and
whether the create and like requests have been captured. Selectors matching
nothing are also logged as a warning.

The like itself is replayed from the site's own request, learned the first time
you use its button — same approach as templates. Until then likes are kept
locally and the panel says so. A like is always recorded locally even if the
API call fails, so nothing is lost.

Hearts are drawn in the shadow layer and positioned over the tiles, so clicking
one never interferes with the site's own click handling.

## Battle templates

Build a battle on the site the normal way, and `src/world/api-recorder.js`
captures the exact request it sends — cases, rounds, mode, wildcard, borrow, and
any setting we never modelled, under the site's own field names. Save that as a
template and create it again whenever, tweaked or not.

The templates button lives in the dock only on the create-a-battle context
(`/case-battles` and `/case-battles/create`), not site-wide. It renders in our
shadow dock rather than inside the site's create form — injecting there is what
used to break the battle toolbar.

Editing exposes name, borrow, rounds, players, mode, wildcard and per-case
counts as fields, plus **All settings**: the raw captured request, so anything
the fields don't cover is still editable. `CR.templates.ALIASES` resolves each
named field against the captured payload, so a key is only written if the site
actually sends it — nothing is invented, and unmodelled settings ride along
untouched.

The recorder stays armed while templates are on, watches only battle-creation
POSTs (not recreate, join, or anything touching your balance), installs no hooks
until armed, and passes every call straight through.

## Discord

Uses a **webhook**, not a hosted bot — same message in the channel, no server to
run. Step-by-step setup: [`docs/DISCORD.md`](docs/DISCORD.md).

`src/background.js` owns the relay. It runs in the service worker rather than
the content script so the webhook URL never enters a page context, and so ten
open tabs still produce one ping. Guards, all configurable in the popup:

| Guard | Default | Why |
|---|---|---|
| Cooldown | 5 min | Rain is frequent; `@everyone` every 20 minutes gets a channel muted |
| Minimum pot | 0 | Skip pings for rains too small to be worth the interruption |
| Mention | a role | Also `@everyone`, `@here`, or no ping |

A failed post is written to storage and shown in the popup, so a bad webhook
or a revoked token doesn't fail silently. Failures don't consume the cooldown.

Only `https://discord.com/api/webhooks/…` URLs are accepted, so a mistyped or
hostile URL can't turn the relay into a general-purpose POST tool.

## UI

Everything renders inside one shadow root attached to `document.body`. Nothing
is inserted into the site's own containers — those are React-managed, and a
variable-width node in the battle toolbar used to overflow the row mid-battle.

Controls live in a dock pinned bottom-right that shows only the actions valid
for the current route. Panels open above it and can be dragged.

Design rule: **colour is reserved for data.** Chrome is neutral graphite, the
single violet accent marks interaction, and the only saturated colour in the
interface is a ticket's rarity tier — so nothing competes with the thing you
are actually reading.

Content scripts share one isolated-world global (`CR`), loaded in the order
listed in `manifest.json`. No build step.

## Adding a feature

```js
CR.feature({
  id: "myThing",
  setting: "myThingEnabled",          // key in CR.DEFAULTS; omit = always on
  routes: (r) => r.isBattlePage(),    // omit = every page
  start(ctx) {
    ctx.interval(() => { ... }, 1000);
    CR.ui.dock.action({
      id: "myThing",
      icon: CR.dom.svg(CR.ui.ICONS.tickets, 17),
      label: "What this does",
      onClick: () => CR.ui.panel.toggle({ id: "myThing", title: "…", body: el }),
    });
    ctx.onCleanup(() => CR.ui.dock.remove("myThing"));
  },
});
```

Add the key to `CR.DEFAULTS`, the file to `manifest.json` before
`src/bootstrap.js`, and (optionally) an `<input data-setting="myThingEnabled">`
to the popup — it binds itself.

Set `CR.DEBUG = true` in `src/core/log.js` for verbose console output.

Alert tones are synthesised in `src/core/sound.js` — struck-bell voices
(inharmonic partials, soft attack, generated reverb tail) playing arpeggios, so
a bigger rain pot simply plays further up the run.

## Notes

Read-only observation of pages you're already logged into, plus
`/case-battles/recreate`, which the site itself calls. The predictor forecasts
rolls already fixed by published seeds; it doesn't influence outcomes.
Automating *actions* — auto-joining rain, timed battle creation — is what gets
accounts banned, and nothing here does it.

## Affiliate prompt

Asks people using the extension to enter your code on Skinrave. Set the code and
how often it appears in the popup; default is `coindrop` every hour.

Add your affiliate token and it checks the public applicant list — once someone
has actually used the code, the prompt retires itself permanently. Without a
token it can't tell, so it relies on the "Already used it" button instead.

It only asks signed-in users (nobody else can act on it), dismisses on Escape or
a backdrop click, and never reappears once retired.
