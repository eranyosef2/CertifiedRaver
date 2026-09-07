# Setting up the Discord ping

About two minutes. You need to do this yourself — it's your account, and the
webhook URL is a credential.

## 1. Server

Discord → **+** in the left sidebar → *Create My Own* → *For me and my friends*.
Name it whatever. Skip if you already have a server.

## 2. Role to ping

Server name → **Server Settings** → **Roles** → *Create Role*.

Call it something like `rain`. Leave the permissions alone — this role exists
only to be mentioned.

Then turn on **Allow anyone to @mention this role** in that role's settings. If
you skip this, only people who can already mention roles will trigger a ping for
everyone else.

To let people opt in themselves, add the role to a *Channels & Roles* onboarding
prompt. Otherwise assign it manually: right-click a member → *Roles* → `rain`.

## 3. Role ID

Discord → **Settings** (gear, bottom left) → **Advanced** → turn on
**Developer Mode**.

Then Server Settings → Roles → right-click your `rain` role → **Copy Role ID**.
It's a long number, 17–20 digits.

## 4. Webhook

Server Settings → **Integrations** → **Webhooks** → *New Webhook*.

Pick the channel it should post in, then **Copy Webhook URL**.

> Anyone holding this URL can post to that channel. Keep it out of chats,
> screenshots, and commits. It goes straight into the extension.

## 5. Extension

Open the CertifiedRaver popup:

1. Turn on **Discord ping**
2. Paste the **Webhook URL**
3. **Ping** → *A role*, paste the **Role ID**
4. **Only above** → a pot size worth interrupting people for (try 500)
5. **Send a test message**

The test posts immediately, ignoring the cooldown and threshold. If it fails,
the popup says why.

## Inviting people

Right-click the server → *Invite People* → copy the link. Anyone who joins and
takes the `rain` role gets pinged.

## If it doesn't work

| Popup says | Fix |
|---|---|
| Doesn't look like a Discord webhook | Must start `https://discord.com/api/webhooks/` — you may have copied the channel link |
| Add the role ID | Developer Mode is off, or you copied the role *name* |
| Discord returned 401 | Webhook was deleted or regenerated — make a new one |
| Discord returned 404 | Same — the webhook no longer exists |
| Rate limited | Too many posts; raise the cooldown |

No message and no error means a guard stopped it: the pot was under your
threshold, or the cooldown hadn't elapsed. Both are in the popup.
