<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/hero-dark.png">
    <img src="docs/hero-light.png" width="900" alt="jev-slop-guard: stands between you and the slop on X and LinkedIn. Chrome extension, judged by Jev.">
  </picture>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.25-ab2f19?style=flat-square&labelColor=191511" alt="Version 0.1.25">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-57503f?style=flat-square&labelColor=191511" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/chrome-manifest%20v3-57503f?style=flat-square&labelColor=191511" alt="Chrome Manifest V3">
  <img src="https://img.shields.io/badge/sites-x.com%20%C2%B7%20linkedin.com-57503f?style=flat-square&labelColor=191511" alt="Works on x.com and linkedin.com">
</p>

**A Chrome extension that stands between you and the slop on X and LinkedIn.**

Every post gets a small pill with a slop probability. Posts over your threshold
get blurred and stamped **SLOP**, with a button to show them anyway. The verdict
comes from [Jev](https://typesafe.ai), TypeSafe's System One model: one typed
`{ slop, not_slop }` choice per post, no free-form LLM text, and you bring your
own API key.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/badges-dark.png">
    <img src="docs/badges-light.png" width="900" alt="Three sample posts: a green Slop 8% pill under a substantive post, a red Stop 74% pill under an empty announcement, and a blurred post stamped SLOP with a Show the post button.">
  </picture>
  <br><sub>Under the threshold, over it, and stamped. Sample posts, threshold at 70%.</sub>
</p>

<p align="center">
  <a href="#what-it-does">What it does</a> ·
  <a href="#requirements">Requirements</a> ·
  <a href="#try-it-in-your-chrome">Try it in your Chrome</a> ·
  <a href="#settings">Settings</a> ·
  <a href="#privacy">Privacy</a> ·
  <a href="#references">References</a>
</p>

---

## What it does

Works on **[x.com](https://x.com)** (home timeline, also `twitter.com`) and
**[linkedin.com](https://www.linkedin.com/feed/)** (feed).

- A post loads clean. When Jev answers, a pill appears under it:
  green **Slop | NN%** below your threshold, red **Stop | NN%** at or above it.
- At or above the threshold the post is also blurred and stamped **SLOP**.
  **Show the post** clears that for the current session.
- Scrolling is never blocked. Classification runs in the background with a
  small concurrency limit and a per-post cache, so a post is scored once.
- Promoted and sponsored posts and "Who to follow" widgets are skipped.

## Requirements

- **Chrome**, or any browser that loads Manifest V3 extensions.
- **An API key** for one of the two providers. Every post is classified by
  Jev on that account, so usage is billed to you.
  - [TypeSafe AI](https://console.typesafe.ai), the default provider.
  - [OpenRouter](https://openrouter.ai/keys). Allow TypeSafe under
    OpenRouter Settings → Privacy, or the decisions endpoint refuses the call.
- **pnpm**, only if you build from source.

## Try it in your Chrome

**Option A — prebuilt, no toolchain.** The repo ships the built extension in
[`chrome-mv3/`](chrome-mv3/). Clone or download the repo and skip to step 3.

**Option B — build from source.**

```sh
pnpm install
pnpm build          # writes .output/chrome-mv3
```

Then load it:

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and pick the folder: `chrome-mv3/` for Option A,
   `.output/chrome-mv3/` for Option B.
4. Pin **Jev Slop Guard** in the toolbar, open the popup, paste your API key, click **Save**.
5. Open [x.com](https://x.com) or [linkedin.com/feed](https://www.linkedin.com/feed/)
   and scroll. Pills appear as verdicts come back.

After you rebuild, click the reload icon on the extension card in
`chrome://extensions` and refresh the tab.

No key yet? The popup links to a **fixture playground** with sample posts in the
same DOM shape as X, so you can see the badges before you spend anything.

## Settings

Stored in `chrome.storage.local` only. Nothing leaves your browser except the
classification request described below.

| Control | Default | Effect |
| --- | --- | --- |
| Pause / Start | running | Pause stops new classifications. Existing badges stay. |
| API key | empty | Your TypeSafe or OpenRouter key |
| Provider | TypeSafe | Switch to OpenRouter to use an OpenRouter key instead |
| Model | `jev-latest` | `jev-1.13.0` pins a version |
| Slop threshold | 70% | Slop probability at or above this gets **Stop**, blur and stamp |
| Blur + SLOP stamp | on | Off keeps the pills but never covers a post |
| Show badge when under threshold | on | Off hides the green pill and marks only **Stop** |

## Privacy

For each post the extension sends the post text and the author handle to the
provider you picked, and nothing else. Your key and settings stay in
`chrome.storage.local`. The extension asks for access to `x.com`,
`twitter.com` and `linkedin.com` to read posts and draw badges, and to
`api.typesafe.ai` and `openrouter.ai` to send the classification requests.

## References

- [Robin Bilgil's real-time slop detector demo](https://x.com/RBilgil/status/2100976648552169805),
  the idea this extension copies: a pill under the post, then blur and a **SLOP** stamp.

## License

[MIT](LICENSE)
