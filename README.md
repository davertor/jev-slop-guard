# Slop Guard

Chrome MV3 extension that labels AI-generated slop on [X](https://x.com) and [LinkedIn](https://www.linkedin.com/feed/) as you scroll, matching Robin Bilgil’s real-time detector: a pill under the post, then (if slop) a blur + giant **SLOP** stamp.

Classification is a single TypeSafe Jev **Choice** `{ not_slop, slop }` via `@typesafe-ai/sdk` → `POST https://api.typesafe.ai/v1/systemone`. The UI only shows **slopP** (same metric as the threshold slider). No free-form LLM text.

## Install unpacked

```bash
pnpm install
pnpm build
```

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → `.output/chrome-mv3`
4. Pin **Slop Guard**, paste your TypeSafe API key, **Save**
5. Reload `https://x.com` and scroll. Posts stay clean until Jev returns; then a badge appears.

```bash
pnpm dev       # loads the extension in a browser
pnpm compile
pnpm test
```

## Sites

- **X / Twitter** — home timeline (`x.com`, `twitter.com`)
- **LinkedIn** — feed (`linkedin.com/feed`); skips Promoted/Sponsored when detectable

## Settings (popup / options)

Stored only in `chrome.storage.local` (BYOK, never committed).

| Control | Default | Effect |
| --- | --- | --- |
| Pause / Start | running | Amber **Pause** stops new classifications; green **Start** resumes. Same `settings.paused` boolean. |
| API key | empty | TypeSafe Jev key |
| Slop threshold | 70% | `slopP` at or above this → red **Stop \| NN%**, blur, stamp |
| Blur + SLOP stamp | on | Turn off to keep badges without covering the post |
| Show badge when under threshold | on | Green **Slop \| NN%** pill when `slopP` is below the slider; off = only mark Stop |
| Provider / model | TypeSafe / `jev-latest` | OpenRouter is an optional fallback |

Below threshold: green **Slop \| NN%** (`slopP`) + check. The post is left intact.
At or above threshold: red **Stop \| NN%** (`slopP`).

**Show the post** on a stamped post clears blur + stamp for that post id (session).

## Timeline behavior

- Observes `article[data-testid="tweet"]` (`MutationObserver` + `IntersectionObserver`)
- Debounced scan, concurrency 2, cache by `/status/:id`
- Never blocks scroll; latency is visible on purpose (clean post → then badge)
- Skips Promoted / `placementTracking` ads
- Optional corner chip shows the resolved model (`Jev-latest`)
- Home timeline probe chip (inline styles, next to Para ti / Siguiendo): `X script live · N cards · M ready`
- Background service worker injects the X content script into matching tabs (not manifest-only)
- X / Twitter only

## Fixture playground

Popup → **Open fixture playground** (`playground.html`). Same tweet DOM testids as X. No key → **set API key**. Key present → live Choice call + badge / stamp / Show the post.

## Permissions

- `storage`
- `https://x.com/*`, `https://twitter.com/*`
- `https://api.typesafe.ai/*`
- `https://openrouter.ai/*` (fallback only)
