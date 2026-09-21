import '../../lib/badge.css';
import { runTimelineGuard } from '../../lib/timeline-guard';
import { extractTweet, listTweetArticles } from '../../lib/tweet';

export default defineContentScript({
  matches: ['https://x.com/*', 'https://twitter.com/*'],
  runAt: 'document_idle',
  main(ctx) {
    runTimelineGuard(ctx, {
      listArticles: listTweetArticles,
      extract: extractTweet,
      undoKey: 'slopGuard.undone.v1',
    });
  },
});
