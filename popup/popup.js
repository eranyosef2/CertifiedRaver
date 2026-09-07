// Controls declare their storage key with data-setting, so adding a setting
// means adding one element here and one key in CR.DEFAULTS — no code change.

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const volume = $("#volume");
const volumeValue = $("#volume-value");
const rainCount = $("#rain-count");
const status = $("#status");

$("#version").textContent = chrome.runtime.getManifest().version;

// Selects whose options are numeric (an interval, say) must round-trip as
// numbers, or a comparison against a stored default silently fails.
const NUMERIC = new Set(["supportIntervalMs"]);

function readControl(el) {
  if (el.type === "checkbox") return el.checked;
  if (el.type === "number" || NUMERIC.has(el.dataset.setting)) return parseInt(el.value, 10) || 0;
  return el.value;
}

function writeControl(el, value) {
  if (el.type === "checkbox") el.checked = !!value;
  else el.value = value ?? "";
}

function showStatus(ok, message) {
  if (!message) { status.hidden = true; return; }
  status.hidden = false;
  status.textContent = message;
  status.className = `status ${ok ? "is-ok" : "is-bad"}`;
}

(async function init() {
  const settings = await CR.settings.load();

  for (const el of $$("[data-setting]")) {
    writeControl(el, settings[el.dataset.setting]);
    // "change" not "input": commit text fields when the user leaves them,
    // not on every keystroke.
    el.addEventListener("change", () => {
      CR.settings.set({ [el.dataset.setting]: readControl(el) });
      revealDiscord();
    });
  }

  function revealDiscord() {
    const on = $('[data-setting="discordEnabled"]').checked;
    $("#discord-config").hidden = !on;
    $("#role-field").hidden = $('[data-setting="discordMention"]').value !== "role";
  }
  revealDiscord();

  // Surface whatever the worker last reported, so a failed ping isn't silent.
  if (settings.discordLastResult) {
    try {
      const last = JSON.parse(settings.discordLastResult);
      showStatus(last.ok, last.message);
    } catch (e) { /* nothing worth showing */ }
  }

  $("#test").addEventListener("click", async () => {
    const btn = $("#test");
    btn.disabled = true;
    btn.textContent = "Sending…";
    showStatus(true, "");
    try {
      const reply = await chrome.runtime.sendMessage({ type: "cr:discord-test", amount: 1234 });
      showStatus(!!(reply && reply.ok), (reply && reply.message) || "No reply from the extension.");
    } catch (e) {
      showStatus(false, e.message);
    }
    btn.disabled = false;
    btn.textContent = "Send a test message";
  });

  volume.value = settings.volume;
  volumeValue.textContent = `${settings.volume}%`;
  volume.addEventListener("input", () => {
    volumeValue.textContent = `${volume.value}%`;
    CR.settings.set({ volume: parseInt(volume.value, 10) });
  });

  const current = CR.sound.resolve(settings.soundPattern);
  for (const btn of $$(".sound")) {
    btn.classList.toggle("is-on", btn.dataset.sound === current);
    btn.addEventListener("click", () => {
      $$(".sound").forEach((b) => b.classList.toggle("is-on", b === btn));
      CR.settings.set({ soundPattern: btn.dataset.sound });
      CR.sound.play(btn.dataset.sound, { volume: volume.value / 100, beeps: 3 });
    });
  }

  rainCount.textContent = settings.rainCount;
  $("#reset").addEventListener("click", async () => {
    await CR.settings.set({ rainCount: 0 });
    rainCount.textContent = "0";
  });

  // A rain can land while the popup is open.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.rainCount) rainCount.textContent = changes.rainCount.newValue || 0;
    if (changes.discordLastResult) {
      try {
        const last = JSON.parse(changes.discordLastResult.newValue);
        showStatus(last.ok, last.message);
      } catch (e) { /* nothing worth showing */ }
    }
  });
})();
