import '../../lib/badge.css';
import { chromeApi } from '../../lib/chrome-msg';
import { extractLinkedInPost, listLinkedInArticles } from '../../lib/linkedin';
import type { LiStatusResult } from '../../lib/messages';
import { runTimelineGuard } from '../../lib/timeline-guard';

export default defineContentScript({
  matches: ['https://www.linkedin.com/*', 'https://linkedin.com/*'],
  runAt: 'document_idle',
  main(ctx) {
    chromeApi().runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const type = (message as { type?: string } | null)?.type;
      if (type === 'PING' || type === 'LI_STATUS') {
        sendResponse(liStatus());
      }
    });

    showLiProbe();
    const tick = window.setInterval(() => showLiProbe(), 2000);
    ctx.onInvalidated(() => window.clearInterval(tick));

    runTimelineGuard(ctx, {
      listArticles: listLinkedInArticles,
      extract: extractLinkedInPost,
      undoKey: 'slopGuard.undone.linkedin.v1',
      missingKeyMessage:
        'Jev Slop Guard (LinkedIn): add your TypeSafe or OpenRouter API key in the extension popup.',
    });
  },
});

function liStatus(): LiStatusResult {
  const cards = listLinkedInArticles();
  let ready = 0;
  for (const c of cards) if (extractLinkedInPost(c)) ready += 1;
  return { ok: true, live: true, cards: cards.length, ready };
}

function showLiProbe(): void {
  const { cards, ready } = liStatus();
  let bar = document.querySelector<HTMLElement>('.slop-guard-liprobe');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'slop-guard-liprobe slop-guard-modelbar';
    bar.style.cssText =
      'position:fixed;left:12px;bottom:40px;z-index:2147483646;padding:6px 10px;border-radius:999px;background:#553011;color:#fff;font:12px/1.3 system-ui,sans-serif;pointer-events:none;';
    document.body.append(bar);
  }
  bar.textContent = `Jev Slop Guard LI · cards ${cards} · ready ${ready}`;
}
