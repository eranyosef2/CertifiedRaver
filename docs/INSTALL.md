# Installing CertifiedRaver

Load the extension first — nothing else can be configured until it's in Chrome.
Takes about a minute.

## 1. Load it

1. Open `chrome://extensions`
2. Turn on **Developer mode** (toggle, top right)
3. Click **Load unpacked**
4. Select the folder `CertifiedRaver` — the one containing `manifest.json`,
   not a subfolder

CertifiedRaver appears in the list. Pin it: click the puzzle-piece icon in the
toolbar, then the pin next to CertifiedRaver, so the popup is one click away.

## 2. Check it's alive

Open `https://skinrave.gg`. The dock — a small capsule with a green status dot —
appears bottom-right. Open the console (⌥⌘J) and you should see:

```
[CertifiedRaver] loaded — n/5 feature(s) active
```

If nothing appears, see Troubleshooting below.

## 3. Configure

Click the extension icon for the popup: feature toggles, alert sound, and the
Discord section. Discord setup is [`DISCORD.md`](DISCORD.md) — you can do that
now that there's somewhere to paste the webhook.

## After you edit any file

Extension code doesn't hot-reload:

1. `chrome://extensions` → the **↻** refresh icon on the CertifiedRaver card
2. Hard-reload the Skinrave tab (⇧⌘R)

Both steps. Refreshing the extension alone leaves the old content script running
in already-open tabs.

## Troubleshooting

**Nothing loads, red "Errors" button on the card** — click it. A missing file or
malformed `manifest.json` shows up there.

**Dock doesn't appear** — check you're on `skinrave.gg` (the content scripts only
match that host), then hard-reload. If the console shows
`Extension context invalidated`, you refreshed the extension without reloading
the tab.

**Service worker shows "inactive"** — normal. MV3 workers sleep when idle and
wake on demand. Click **service worker** on the card to open its console; that's
where Discord relay logging goes.

**Discord test says nothing happens** — the worker logs there, not in the page
console. Open it via the card.

## Verified

Chrome accepts the manifest (`--pack-extension` builds a valid `.crx`), all 20
JS files parse as classic scripts, every file the manifest references exists,
and the background worker is a classic service worker — required, since it uses
`importScripts`. MAIN-world content scripts need Chrome 111+; you're on 152.

Not verified: anything that needs a logged-in Skinrave session — seed scraping,
the create-request capture, and the live API shape.
