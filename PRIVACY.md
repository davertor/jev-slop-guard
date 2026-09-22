# Privacy Policy — Jev Slop Guard

Last updated: 22 September 2026

Jev Slop Guard is a browser extension that scores posts on X and LinkedIn.
This policy describes exactly what it handles. There is no separate service
behind it: the extension runs in your browser and talks only to the
classification provider you choose.

## What leaves your browser

For each post the extension scores, it sends two values to the provider you
selected in the extension's settings:

- the text of the post
- the author's handle

Nothing else is transmitted. The extension does not send your browsing
history, cookies, session tokens, IP-derived identifiers, the URLs you visit,
your own account details, or any post you do not scroll past.

Requests go over HTTPS to whichever provider you configured:

- **TypeSafe AI** (default) — `https://api.typesafe.ai`
- **OpenRouter** (optional) — `https://openrouter.ai`

Your use of those services is governed by their own privacy policies. The
author of this extension operates no server, receives no copy of the data, and
cannot see what you scroll past.

## What stays on your device

Stored in `chrome.storage.local`, which persists until you remove the
extension or clear it:

- your API key
- your settings: provider, model, slop threshold, and the blur, badge and
  pause toggles

Stored in `chrome.storage.session`, which your browser clears when it closes:

- a cache of scores already returned, so a post is not charged twice
- the ids of posts you chose to reveal with **Show the post**

## What is never collected

There is no analytics, no telemetry, no crash reporting and no tracking of any
kind. No data is collected by the author, sold, rented, or shared with anyone
beyond the provider you configured. The extension contains no remote code.

## Your control

Remove the extension to delete everything it stored. Clearing your API key in
the popup stops all outbound requests, as does **Pause**.

## Source

The extension is open source under the MIT licence. Every claim above can be
checked against the code: <https://github.com/davertor/jev-slop-guard>

## Contact

Open an issue at <https://github.com/davertor/jev-slop-guard/issues>
