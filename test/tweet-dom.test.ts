import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';
import { applyVerdict, ownSlopRow, reapplyFromDataset } from '../lib/badge';
import { DEFAULT_SETTINGS } from '../lib/settings';
import { extractTweet, isRetweetCard, listTweetArticles } from '../lib/tweet';

const { window, document } = parseHTML('<!DOCTYPE html><html><body></body></html>');
Object.assign(globalThis, {
  window,
  document,
  HTMLElement: window.HTMLElement,
  HTMLButtonElement: window.HTMLButtonElement,
  Element: window.Element,
  Document: window.Document,
  Node: window.Node,
});

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body as unknown as HTMLElement;
}

function tweetBody(opts: { id: string; handle: string; name: string; text: string }): string {
  return `
      <div data-testid="User-Name">
        <a href="/${opts.handle}"><span>${opts.name}</span></a>
        <a href="/${opts.handle}">@${opts.handle}</a>
      </div>
      <a href="/${opts.handle}/status/${opts.id}"><time datetime="2026-09-21">3h</time></a>
      <div data-testid="tweetText">${opts.text}</div>
      <div role="group">
        <div data-testid="reply">1</div>
        <div data-testid="retweet">2</div>
        <div data-testid="like">5</div>
      </div>
  `;
}

function tweetCard(opts: {
  id: string;
  handle: string;
  name: string;
  text: string;
  tag?: string;
}): string {
  const tag = opts.tag ?? 'article';
  return `<${tag} data-testid="tweet">${tweetBody(opts)}</${tag}>`;
}

const SAMU = {
  id: '42',
  handle: 'samu2kdotcom',
  name: 'Samu 2k',
  text: 'si gastas menos de 1200M de tokens mensuales te sale mas a cuenta OpenRouter',
};

test('extracts a normal tweet', () => {
  const root = mount(tweetCard(SAMU));
  const cards = listTweetArticles(root);
  assert.equal(cards.length, 1);
  const item = extractTweet(cards[0]!);
  assert.ok(item);
  assert.equal(item.id, '42');
  assert.equal(item.handle, '@samu2kdotcom');
  assert.match(item.text, /OpenRouter/);
});

test('classic retweet: socialContext inside the same article', () => {
  const root = mount(`
    <article data-testid="tweet">
      <div data-testid="socialContext">Joaquin Montesinos reposteó</div>
      ${tweetBody(SAMU)}
    </article>
  `);
  const cards = listTweetArticles(root);
  assert.equal(cards.length, 1);
  assert.equal(isRetweetCard(cards[0]!), true);
  const item = extractTweet(cards[0]!);
  assert.ok(item);
  assert.equal(item.id, '42');
  applyVerdict(cards[0]!, notSlop(item.id), DEFAULT_SETTINGS);
  const row = ownSlopRow(cards[0]!);
  assert.ok(row);
  assert.equal(row.previousElementSibling?.getAttribute('data-testid'), 'tweetText');
  assert.match(row.textContent ?? '', /Slop \| 2%/);
});

test('Spanish socialContext verb sits next to the testid name link', () => {
  const root = mount(`
    <article data-testid="tweet">
      <div>
        <a data-testid="socialContext" href="/victorm">Victor M</a>
        <span> repostó</span>
      </div>
      <div data-testid="User-Name"><a href="/samu2kdotcom">@samu2kdotcom</a></div>
      <a href="/samu2kdotcom/status/42"><time>3h</time></a>
      <div data-testid="tweetText">${SAMU.text}</div>
    </article>
  `);
  const card = listTweetArticles(root)[0]!;
  assert.equal(isRetweetCard(card), true);
  assert.equal(extractTweet(card)?.id, '42');
});

test('socialContext lives on the cell, outside the article', () => {
  const root = mount(`
    <div data-testid="cellInnerDiv">
      <div data-testid="socialContext">Javier López repostó</div>
      ${tweetCard(SAMU)}
    </div>
  `);
  const cards = listTweetArticles(root);
  assert.equal(cards.length, 1);
  assert.equal(isRetweetCard(cards[0]!), true);
  assert.equal(extractTweet(cards[0]!)?.id, '42');
  applyVerdict(cards[0]!, notSlop('42'), DEFAULT_SETTINGS);
  assert.ok(ownSlopRow(cards[0]!));
});

test('nested retweet shell is dropped; inner original gets the badge', () => {
  const root = mount(`
    <article data-testid="tweet" id="shell">
      <div data-testid="socialContext">Joaquin Montesinos reposteó</div>
      ${tweetCard({ ...SAMU, id: '42' })}
      <div role="group"><div data-testid="like">1</div></div>
    </article>
  `);
  const cards = listTweetArticles(root);
  assert.equal(cards.length, 1);
  const shell = root.querySelector('#shell') as HTMLElement;
  assert.notEqual(cards[0], shell);
  assert.equal(extractTweet(cards[0]!)?.id, '42');
  applyVerdict(cards[0]!, notSlop('42'), DEFAULT_SETTINGS);
  assert.ok(ownSlopRow(cards[0]!));
  assert.equal(ownSlopRow(shell), null);
  assert.equal(shell.querySelector('.slop-guard-row'), ownSlopRow(cards[0]!));
});

test('quote tweet keeps parent commentary and nested quoted card', () => {
  const root = mount(`
    <article data-testid="tweet" id="quote">
      <div data-testid="User-Name"><a href="/ada">@ada</a></div>
      <a href="/ada/status/7"><time>1h</time></a>
      <div data-testid="tweetText">this quote commentary is long enough</div>
      ${tweetCard({ id: '8', handle: 'bob', name: 'Bob', text: 'the quoted original tweet text here' })}
    </article>
  `);
  const cards = listTweetArticles(root);
  assert.equal(cards.length, 2);
  const parent = extractTweet(cards.find((c) => c.id === 'quote')!);
  const nested = extractTweet(cards.find((c) => c.id !== 'quote')!);
  assert.equal(parent?.id, '7');
  assert.match(parent?.text ?? '', /commentary/);
  assert.equal(nested?.id, '8');
  assert.match(nested?.text ?? '', /quoted original/);
});

test('cell without article still lists when other tweets exist', () => {
  const root = mount(`
    ${tweetCard({ id: '1', handle: 'ada', name: 'Ada', text: 'a normal original tweet lives here' })}
    <div data-testid="cellInnerDiv">
      <div data-testid="socialContext">Ada repostó</div>
      <div data-testid="User-Name"><a href="/bob">@bob</a></div>
      <a href="/bob/status/99"><time>2h</time></a>
      <div data-testid="tweetText">reposted body that is long enough to extract</div>
    </div>
  `);
  const cards = listTweetArticles(root);
  assert.equal(cards.length, 2);
  const ids = cards.map((card) => extractTweet(card)?.id).sort();
  assert.deepEqual(ids, ['1', '99']);
});

test('div[data-testid=tweet] retweet is listed like article cards', () => {
  const root = mount(`
    <div data-testid="cellInnerDiv">
      <div data-testid="socialContext">Maya ha retwitteado</div>
      ${tweetCard({ ...SAMU, tag: 'div' })}
    </div>
  `);
  const cards = listTweetArticles(root);
  assert.equal(cards.length, 1);
  assert.equal(extractTweet(cards[0]!)?.id, '42');
});

test('React wipe: done card without a row gets the badge put back', () => {
  const root = mount(tweetCard(SAMU));
  const card = listTweetArticles(root)[0]!;
  card.dataset.slopId = '42';
  applyVerdict(card, notSlop('42'), DEFAULT_SETTINGS);
  ownSlopRow(card)?.remove();
  assert.equal(ownSlopRow(card), null);
  reapplyFromDataset(card, DEFAULT_SETTINGS);
  const row = ownSlopRow(card);
  assert.ok(row);
  assert.match(row.textContent ?? '', /Slop \| 2%/);
});

test('under-threshold pill is Slop | slopP, not notP', () => {
  const root = mount(tweetCard(SAMU));
  const card = listTweetArticles(root)[0]!;
  applyVerdict(
    card,
    { tweetId: '42', label: 'slop', slopP: 0.57, notP: 0.43, model: 'jev-latest' },
    DEFAULT_SETTINGS,
  );
  const row = ownSlopRow(card);
  assert.ok(row);
  assert.match(row.textContent ?? '', /Slop \| 57%/);
  assert.equal(row.textContent?.includes('43'), false);
  assert.equal(card.classList.contains('slop-guard-stamped'), false);
});

test('over-threshold pill is Stop | slopP and stamps', () => {
  const root = mount(tweetCard(SAMU));
  const card = listTweetArticles(root)[0]!;
  applyVerdict(
    card,
    { tweetId: '42', label: 'not_slop', slopP: 0.91, notP: 0.09, model: 'jev-latest' },
    DEFAULT_SETTINGS,
  );
  const row = ownSlopRow(card);
  assert.ok(row);
  assert.match(row.textContent ?? '', /Stop \| 91%/);
  assert.equal(card.classList.contains('slop-guard-stamped'), true);
});

function notSlop(tweetId: string) {
  return { tweetId, label: 'not_slop' as const, slopP: 0.02, notP: 0.98, model: 'jev-latest' };
}

function listedIds(root: HTMLElement): string[] {
  return listTweetArticles(root)
    .map((card) => extractTweet(card)?.id)
    .filter((id): id is string => Boolean(id))
    .sort();
}

test('GIF card: photo /status/:id/photo/1 still extracts', () => {
  const root = mount(`
    <article data-testid="tweet">
      <div data-testid="User-Name"><a href="/googlegemma">@googlegemma</a></div>
      <a href="/googlegemma/status/9001"><time>19 sept.</time></a>
      <div data-testid="tweetText">DiffusionGemma as Jev showcases the power of non-autoregressive architectures.</div>
      <a href="/googlegemma/status/9001/photo/1" data-testid="tweetPhoto"><img alt="GIF"></a>
    </article>
  `);
  const cards = listTweetArticles(root);
  assert.equal(cards.length, 1);
  const item = extractTweet(cards[0]!);
  assert.equal(item?.id, '9001');
  assert.match(item?.text ?? '', /DiffusionGemma/);
});

test('video card: time is not a link; status id lives on the cell overlay', () => {
  const root = mount(`
    <div data-testid="cellInnerDiv">
      <a href="/monospodcast/status/9002" aria-label="View post"></a>
      <article data-testid="tweet">
        <div data-testid="User-Name"><a href="/monospodcast">@monospodcast</a></div>
        <time>21h</time>
        <div data-testid="tweetText">Este invento es el fin de beber solo</div>
        <div data-testid="videoPlayer"><time>0:35</time></div>
      </article>
    </div>
  `);
  const cards = listTweetArticles(root);
  assert.equal(cards.length, 1);
  const item = extractTweet(cards[0]!);
  assert.equal(item?.id, '9002');
  assert.match(item?.text ?? '', /beber solo/);
  applyVerdict(cards[0]!, notSlop('9002'), DEFAULT_SETTINGS);
  assert.ok(ownSlopRow(cards[0]!));
});

test('wrapping status <a> supplies the id when the card has none', () => {
  const root = mount(`
    <a href="/atomic_chat_hq/status/9003">
      <article data-testid="tweet">
        <div data-testid="User-Name"><a href="/atomic_chat_hq">@atomic_chat_hq</a></div>
        <time>12 jun.</time>
        <div data-testid="tweetText">Diffusion Gemma is 4x faster, but makes 6x more mistakes!</div>
        <div data-testid="videoPlayer"></div>
      </article>
    </a>
  `);
  const item = extractTweet(listTweetArticles(root)[0]!);
  assert.equal(item?.id, '9003');
});

test('media card caption lives in div[lang], not tweetText', () => {
  const root = mount(`
    <article data-testid="tweet">
      <div data-testid="User-Name"><a href="/monospodcast">@monospodcast</a></div>
      <a href="/monospodcast/status/9004"><time>21h</time></a>
      <div lang="es">Este invento es el fin de beber solo</div>
      <div data-testid="videoPlayer"></div>
    </article>
  `);
  const cards = listTweetArticles(root);
  assert.equal(cards.length, 1);
  const item = extractTweet(cards[0]!);
  assert.equal(item?.id, '9004');
  assert.match(item?.text ?? '', /beber solo/);
  applyVerdict(cards[0]!, notSlop('9004'), DEFAULT_SETTINGS);
  const row = ownSlopRow(cards[0]!);
  assert.ok(row);
  assert.equal(row.previousElementSibling?.getAttribute('lang'), 'es');
});

test('Mostrar más long tweet still extracts the visible caption', () => {
  const root = mount(`
    <article data-testid="tweet">
      <div data-testid="User-Name"><a href="/googlegemma">@googlegemma</a></div>
      <a href="/googlegemma/status/9005"><time>19 sept.</time></a>
      <div>
        <div lang="en">While Jev demonstrated the value of rapid decision models, running DiffusionGemma leverages canvas diffusion.</div>
        <div data-testid="tweet-text-show-more-link">Mostrar más</div>
      </div>
      <div data-testid="tweetPhoto"></div>
    </article>
  `);
  const item = extractTweet(listTweetArticles(root)[0]!);
  assert.equal(item?.id, '9005');
  assert.match(item?.text ?? '', /DiffusionGemma/);
  assert.equal(item?.text.includes('Mostrar más'), false);
});

test('nested media husk is not listed; parent keeps the badge', () => {
  const root = mount(`
    <article data-testid="tweet" id="parent">
      <div data-testid="User-Name"><a href="/atomic_chat_hq">@atomic_chat_hq</a></div>
      <a href="/atomic_chat_hq/status/9006"><time>12 jun.</time></a>
      <div data-testid="tweetText">Diffusion Gemma is 4x faster, but makes 6x more mistakes on a single H100.</div>
      <div data-testid="tweet" id="husk">
        <div data-testid="tweetPhoto"></div>
        <div data-testid="videoPlayer"><time>0:25</time></div>
      </div>
    </article>
  `);
  const cards = listTweetArticles(root);
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.id, 'parent');
  assert.equal(extractTweet(cards[0]!)?.id, '9006');
  applyVerdict(cards[0]!, notSlop('9006'), DEFAULT_SETTINGS);
  assert.ok(ownSlopRow(cards[0]!));
  assert.equal(ownSlopRow(root.querySelector('#husk') as HTMLElement), null);
});

test('caption inside a media husk still belongs to the parent card', () => {
  const root = mount(`
    <article data-testid="tweet" id="parent">
      <div data-testid="User-Name"><a href="/googlegemma">@googlegemma</a></div>
      <a href="/googlegemma/status/9007"><time>19 sept.</time></a>
      <div data-testid="tweet" id="husk">
        <div data-testid="tweetText">DiffusionGemma as Jev showcases non-autoregressive architectures.</div>
        <div data-testid="tweetPhoto"></div>
      </div>
    </article>
  `);
  const cards = listTweetArticles(root);
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.id, 'parent');
  const item = extractTweet(cards[0]!);
  assert.equal(item?.id, '9007');
  assert.match(item?.text ?? '', /DiffusionGemma/);
});

test('cell overlay + lang caption + video husk: listed card is ready', () => {
  const root = mount(`
    <div data-testid="cellInnerDiv">
      <a href="/atomic_chat_hq/status/9008"></a>
      <article data-testid="tweet">
        <div data-testid="User-Name"><a href="/atomic_chat_hq">@atomic_chat_hq</a></div>
        <time>12 jun.</time>
        <div lang="en">We benchmarked the new diffusion LLM against its autoregressive twin on a single H100.</div>
        <div data-testid="tweet-text-show-more-link">Mostrar más</div>
        <div data-testid="tweet">
          <div data-testid="videoPlayer"><time>0:25</time></div>
        </div>
      </article>
    </div>
  `);
  const cards = listTweetArticles(root);
  const ready = cards.filter((card) => extractTweet(card));
  assert.equal(cards.length, 1);
  assert.equal(ready.length, 1);
  assert.deepEqual(listedIds(root), ['9008']);
});

test('quote tweet still lists parent commentary and nested original', () => {
  const root = mount(`
    <article data-testid="tweet" id="quote">
      <div data-testid="User-Name"><a href="/ada">@ada</a></div>
      <a href="/ada/status/77"><time>1h</time></a>
      <div data-testid="tweetText">this quote commentary is long enough</div>
      ${tweetCard({ id: '88', handle: 'bob', name: 'Bob', text: 'the quoted original tweet text here' })}
    </article>
  `);
  assert.deepEqual(listedIds(root), ['77', '88']);
});
