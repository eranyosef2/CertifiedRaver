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

## Updating without git

Download the zip by hand once, load it unpacked, then never download one again —
run the updater inside the folder instead. It fetches the latest, replaces the
folder's contents in place, and leaves Chrome's "Load unpacked" pointer valid.

**Windows** — right-click `scripts\update.ps1` → *Run with PowerShell*. Or:

```
powershell -ExecutionPolicy Bypass -File scripts\update.ps1
```

**macOS / Linux**

```bash
bash scripts/update.sh
```

Either way it prints the version before and after. Then click the reload arrow in
`chrome://extensions` and hard-reload the tab — Chrome does not watch the
filesystem, so that click is still needed.

Files that aren't part of the extension are left alone, and if the download
looks wrong the script aborts rather than emptying your folder.

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

**Which build am I running?** The load banner prints it:
`[CertifiedRaver] v2.0.1 loaded — 6/6 feature(s) active`. Compare against
`git log --oneline -1` in the folder. If the version is older than you expect,
the ↻ on the extension card didn't take, or the tab wasn't hard-reloaded.

**Getting the diagnostic without the console command** — set `CR.DEBUG = true`
in `src/core/log.js`. The full report prints itself a few seconds after load,
which works even when `CRdiagnose()` isn't reachable.

**`CR is not defined` or `CR.diagnose is not a function`** — use `CRdiagnose()`
instead. Content scripts run in an isolated world the console can't see, and
`CR` may belong to Skinrave's own bundle. If neither name works you're on an
older build: pull, refresh the extension, hard-reload the tab. Failing that, use
the context dropdown at the top of the Console panel (it says `top`) and pick
**CertifiedRaver**.

**Discord test says nothing happens** — the worker logs there, not in the page
console. Open it via the card.

## Verified

Chrome accepts the manifest (`--pack-extension` builds a valid `.crx`), all 20
JS files parse as classic scripts, every file the manifest references exists,
and the background worker is a classic service worker — required, since it uses
`importScripts`. MAIN-world content scripts need Chrome 111+; you're on 152.

Not verified: anything that needs a logged-in Skinrave session — seed scraping,
the create-request capture, and the live API shape.
