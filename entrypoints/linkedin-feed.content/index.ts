import '../../lib/badge.css';
import { extractLinkedInPost, listLinkedInArticles } from '../../lib/linkedin';
import { runTimelineGuard } from '../../lib/timeline-guard';

export default defineContentScript({
  matches: ['https://www.linkedin.com/*', 'https://linkedin.com/*'],
  runAt: 'document_idle',
  main(ctx) {
    showLiProbe();
    const tick = window.setInterval(() => showLiProbe(), 2000);
    ctx.onInvalidated(() => window.clearInterval(tick));

    runTimelineGuard(ctx, {
      listArticles: listLinkedInArticles,
      extract: extractLinkedInPost,
      undoKey: 'slopGuard.undone.linkedin.v1',
      missingKeyMessage:
        'Slop Guard (LinkedIn): add your TypeSafe or OpenRouter API key in the extension popup.',
    });
  },
});

function showLiProbe(): void {
  const cards = listLinkedInArticles();
  let extractable = 0;
  for (const c of cards) if (extractLinkedInPost(c)) extractable += 1;
  let bar = document.querySelector<HTMLElement>('.slop-guard-liprobe');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'slop-guard-liprobe slop-guard-modelbar';
    bar.style.left = '12px';
    bar.style.bottom = '40px';
    bar.style.background = '#553011';
    document.body.append(bar);
  }
  bar.textContent = `Slop Guard LI · cards ${cards.length} · ready ${extractable}`;
}
