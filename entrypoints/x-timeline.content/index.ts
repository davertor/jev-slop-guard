import '../../lib/badge.css';
import { runTimelineGuard } from '../../lib/timeline-guard';
import { extractTweet, listTweetArticles } from '../../lib/tweet';
import { chromeApi } from '../../lib/chrome-msg';
import type { XStatusResult } from '../../lib/messages';

export default defineContentScript({
  matches: ['https://x.com/*', 'https://twitter.com/*', 'https://www.x.com/*', 'https://www.twitter.com/*'],
  runAt: 'document_idle',
  main(ctx) {
    chromeApi().runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const type = (message as { type?: string } | null)?.type;
      if (type === 'PING' || type === 'X_STATUS') {
        sendResponse(xStatus());
      }
    });

    showXProbe();
    const tick = window.setInterval(() => showXProbe(), 2000);
    ctx.onInvalidated(() => window.clearInterval(tick));

    runTimelineGuard(ctx, {
      listArticles: listTweetArticles,
      extract: extractTweet,
      undoKey: 'slopGuard.undone.v1',
    });
  },
});

function xStatus(): XStatusResult {
  const cards = listTweetArticles();
  let ready = 0;
  for (const card of cards) if (extractTweet(card)) ready += 1;
  return { ok: true, live: true, cards: cards.length, ready };
}

const PROBE_STYLE: Partial<CSSStyleDeclaration> = {
  display: 'inline-flex',
  alignItems: 'center',
  margin: '6px 16px 8px',
  padding: '4px 10px',
  borderRadius: '999px',
  background: '#1d9bf0',
  color: '#fff',
  font: '650 12px/16px ui-sans-serif, system-ui, sans-serif',
  letterSpacing: '0.01em',
  zIndex: '2147483647',
  position: 'relative',
  opacity: '1',
  visibility: 'visible',
  pointerEvents: 'none',
  boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
};

function showXProbe(): void {
  const { cards, ready } = xStatus();
  const text = `X script live · ${cards} cards · ${ready} ready`;
  let chip = document.getElementById('slop-guard-xprobe');
  if (!(chip instanceof HTMLElement)) {
    chip = document.createElement('div');
    chip.id = 'slop-guard-xprobe';
    chip.className = 'slop-guard-xprobe';
    Object.assign(chip.style, PROBE_STYLE);
  }
  chip.textContent = text;
  const host = findHomeTabsHost();
  if (host) {
    if (chip.parentElement !== host) host.append(chip);
    return;
  }
  if (!chip.isConnected) {
    Object.assign(chip.style, {
      position: 'fixed',
      top: '12px',
      right: '12px',
      margin: '0',
    });
    document.documentElement.append(chip);
  }
}

function findHomeTabsHost(): HTMLElement | null {
  for (const tab of document.querySelectorAll('[role="tab"]')) {
    const label = (tab.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (/^(Para ti|For you|Siguiendo|Following)$/i.test(label)) {
      const list = tab.closest('[role="tablist"]');
      if (list instanceof HTMLElement && list.parentElement instanceof HTMLElement) {
        return list.parentElement;
      }
      return tab.parentElement instanceof HTMLElement ? tab.parentElement : null;
    }
  }
  return null;
}
