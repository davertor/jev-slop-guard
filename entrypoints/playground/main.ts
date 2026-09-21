import '../../lib/badge.css';
import './style.css';
import { applyVerdict, clearStamp, markError } from '../../lib/badge';
import { sendRuntimeMessage } from '../../lib/chrome-msg';
import type { JudgeResult } from '../../lib/messages';
import { DEFAULT_SETTINGS, loadSettings } from '../../lib/settings';
import { listTweetArticles } from '../../lib/tweet';
import type { Verdict } from '../../lib/verdict';

const FIXTURES = [
  {
    id: '1001',
    handle: 'grindset',
    name: 'Rise Daily',
    text: 'Unleash your potential. The only limit is the one you set. Grind now, rest never. 🚀 #Mindset',
  },
  {
    id: '1002',
    handle: 'maya',
    name: 'Maya Chen',
    text: 'The 4 train was stuck under the river for 22 minutes so I ate yesterday’s dumplings on the platform and they were somehow better cold.',
  },
  {
    id: '1003',
    handle: 'threadlord',
    name: 'Growth Threads',
    text: '7 brutal truths about building in public (number 4 will surprise you):\n1. Consistency\n2. Value\n3. Audience\nReply YES if you want the rest.',
  },
  {
    id: '1004',
    handle: 'dev',
    name: 'Ibrahim',
    text: 'We shipped the retry queue last night. If you were seeing duplicate webhooks around 02:10 UTC, that was us; should be clean now.',
  },
  {
    id: '1005',
    handle: 'samu2kdotcom',
    name: 'Samu 2k',
    text: 'si gastas menos de 1200M de tokens mensuales te sale mas a cuenta OpenRouter que nan.builders.',
    repostedBy: 'Joaquin Montesinos',
  },
];

const feed = document.querySelector('#feed')!;
const note = document.querySelector('#note')!;

feed.innerHTML = FIXTURES.map((tweet) => {
  const social =
    'repostedBy' in tweet && tweet.repostedBy
      ? `<div data-testid="socialContext">${escapeHtml(tweet.repostedBy)} repostó</div>`
      : '';
  return `
  <article data-testid="tweet" data-slop-id="${tweet.id}">
    ${social}
    <div data-testid="User-Name">
      <strong>${tweet.name}</strong>
      <a href="/${tweet.handle}">@${tweet.handle}</a>
    </div>
    <a href="/${tweet.handle}/status/${tweet.id}"><time datetime="2026-09-21">${tweet.id}</time></a>
    <div data-testid="tweetText">${escapeHtml(tweet.text)}</div>
  </article>
`;
}).join('');

void run();

async function run(): Promise<void> {
  const extension = hasExtensionApi();
  const settings = extension ? await loadSettings() : { ...DEFAULT_SETTINGS, stampEnabled: true };
  note.textContent = extension
    ? settings.apiKey
      ? 'Posts stay clean, then Jev labels them (same latency as the timeline).'
      : 'No API key — each card should show set API key after the classifier returns NO_KEY.'
    : 'Opened outside the extension. Fixture labels after a short delay, then Show the post on stamped cards.';

  for (const article of listTweetArticles(feed)) {
    const tweet = FIXTURES.find((item) => item.id === article.dataset.slopId);
    if (!tweet) continue;
    if (!extension) {
      window.setTimeout(() => {
        applyVerdict(article, mockVerdict(tweet), settings, {
          onPutBack: (_id, card) => clearStamp(card),
        });
      }, 450);
      continue;
    }
    const result = await sendRuntimeMessage<JudgeResult>({
      type: 'JUDGE_TWEET',
      tweet: { id: tweet.id, text: tweet.text, handle: `@${tweet.handle}` },
    });
    if (result.ok) {
      applyVerdict(article, result.verdict, settings, {
        onPutBack: (_id, card) => clearStamp(card),
      });
      continue;
    }
    markError(article, result.code === 'NO_KEY' ? 'set API key' : 'jev error');
    const badge = article.querySelector<HTMLElement>('.slop-guard-badge');
    if (badge) badge.title = result.error;
  }
}

function mockVerdict(tweet: (typeof FIXTURES)[number]): Verdict {
  const slop = tweet.id === '1001' || tweet.id === '1003';
  return {
    tweetId: tweet.id,
    label: slop ? 'slop' : 'not_slop',
    slopP: slop ? 0.92 : 0.11,
    notP: slop ? 0.08 : 0.89,
    model: 'jev-latest',
  };
}

function hasExtensionApi(): boolean {
  try {
    return typeof browser !== 'undefined' && Boolean(browser.runtime?.id);
  } catch {
    return false;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
