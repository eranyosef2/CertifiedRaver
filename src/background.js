// Background service worker. Owns everything that talks to Discord.
//
// It lives here rather than in the content script for two reasons: the webhook
// URL never enters a page context, and one worker is shared by every open tab,
// so ten skinrave tabs still produce one ping.
//
// MV3 workers are killed when idle, so nothing may be kept in memory across
// events — the cooldown timestamp lives in chrome.storage.

importScripts("/src/core/log.js", "/src/core/settings.js");

// Only real Discord webhook endpoints. Stops a typo'd or hostile URL turning
// this into a general-purpose POST tool.
const WEBHOOK_RE =
  /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/[\w-]+$/;

// Discord snowflakes are 17-20 digits. A role ping with a malformed id is
// silently dropped by Discord, so catch it here and say so instead.
const ROLE_ID_RE = /^\d{17,20}$/;

const GOLD = 0xE8B54A;
const SITE = "https://skinrave.gg/";

// Messages are handled one at a time. Two tabs seeing the same rain arrive
// milliseconds apart, and without this both could pass the cooldown check
// before either writes the new timestamp.
let queue = Promise.resolve();
const serialize = (fn) => (queue = queue.then(fn, fn));

const CR_ = () => globalThis.CR;

function mentionFor(settings) {
  switch (settings.discordMention) {
    case "everyone": return { text: "@everyone", allowed: { parse: ["everyone"] } };
    case "here":     return { text: "@here",     allowed: { parse: ["everyone"] } };
    case "role":
      return { text: `<@&${settings.discordRoleId}>`,
               allowed: { roles: [settings.discordRoleId] } };
    default:         return { text: "", allowed: { parse: [] } };
  }
}

function payload(amount, settings) {
  const mention = mentionFor(settings);
  const pot = amount === null || amount === undefined
    ? "The rain pool is open"
    : `**${Number(amount).toLocaleString("en-US")}** in the pool`;

  return {
    username: "CertifiedRaver",
    content: mention.text,
    allowed_mentions: mention.allowed,
    embeds: [{
      title: "Rain is up",
      description: `${pot}\n[Open Skinrave](${SITE})`,
      color: GOLD,
      timestamp: new Date().toISOString(),
    }],
  };
}

async function post(url, body) {
  // ?wait=true makes Discord validate and return the created message, so a
  // rejected payload surfaces as an error instead of a silent 204.
  const res = await fetch(`${url}?wait=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    const info = await res.json().catch(() => ({}));
    throw new Error(`rate limited by Discord, retry in ${info.retry_after || "?"}s`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Discord returned ${res.status}${detail ? `: ${detail.slice(0, 120)}` : ""}`);
  }
  return res;
}

async function record(ok, message) {
  await chrome.storage.local.set({
    discordLastResult: JSON.stringify({ ok, message, at: Date.now() }),
  });
}

// Returns a short reason when the ping is skipped, or null when it was sent.
async function relayRain(amount, { force = false } = {}) {
  const s = await CR_().settings.load();

  if (!s.discordEnabled && !force) return "relay is off";
  if (!WEBHOOK_RE.test(s.discordWebhook)) {
    await record(false, "That webhook URL doesn't look like a Discord webhook.");
    return "invalid webhook";
  }
  if (s.discordMention === "role" && !ROLE_ID_RE.test(s.discordRoleId)) {
    await record(false, "Add the role ID, or the ping won't reach anyone. " +
                        "Discord → Settings → Advanced → Developer Mode, then " +
                        "right-click the role and Copy Role ID.");
    return "missing role id";
  }

  if (!force) {
    if (amount !== null && amount !== undefined && amount < s.discordMinPot) {
      return `pot ${amount} below the ${s.discordMinPot} threshold`;
    }
    const { lastDiscordPost = 0 } = await chrome.storage.local.get("lastDiscordPost");
    const since = Date.now() - lastDiscordPost;
    if (since < s.discordCooldownMs) {
      return `cooldown, ${Math.ceil((s.discordCooldownMs - since) / 1000)}s left`;
    }
    // Claim the slot before awaiting the network, so a second tab is blocked
    // even while this request is still in flight.
    await chrome.storage.local.set({ lastDiscordPost: Date.now() });
  }

  try {
    await post(s.discordWebhook, payload(amount, s));
    await record(true, force ? "Test message sent." : "Rain ping sent.");
    CR_().log.info("discord: ping sent");
    return null;
  } catch (e) {
    await record(false, e.message);
    CR_().log.error("discord relay failed:", e.message);
    // Let the next rain try again rather than burning the cooldown on a failure.
    if (!force) await chrome.storage.local.set({ lastDiscordPost: 0 });
    return e.message;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (!msg || typeof msg.type !== "string") return;

  if (msg.type === "cr:rain") {
    serialize(async () => {
      const skipped = await relayRain(msg.amount);
      if (skipped) CR_().log.debug("discord skipped:", skipped);
    });
    return; // nothing to respond to
  }

  if (msg.type === "cr:discord-test") {
    serialize(async () => {
      const failure = await relayRain(msg.amount ?? 1234, { force: true });
      respond({ ok: !failure, message: failure || "Test message sent." });
    });
    return true; // respond asynchronously
  }
});
