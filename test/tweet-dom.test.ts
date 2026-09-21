import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';
import { applyVerdict, ownSlopRow, reapplyFromDataset } from '../lib/badge';
import { DEFAULT_SETTINGS } from '../lib/settings';
import {
  explainExtract,
  extractTweet,
  findActionBar,
  findTweetTextEl,
  isRetweetCard,
  listTweetArticles,
} from '../lib/tweet';

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

function actionBar(): string {
  return `<div role="group"><div data-testid="reply">1</div><div data-testid="retweet">2</div><div data-testid="like">5</div></div>`;
}

function videoHusk(label: string, datetime: string, inner = ''): string {
  return `
    <div data-testid="videoComponent">
      <div data-testid="tweet">
        <div data-testid="videoPlayer">
          ${inner}
          <time datetime="${datetime}">${label}</time>
        </div>
      </div>
    </div>`;
}

function assertReadyBadge(article: HTMLElement, id: string, text: RegExp): void {
  const item = extractTweet(article);
  assert.ok(item, 'extractTweet returned null');
  assert.equal(item.id, id);
  assert.match(item.text, text);
  assert.ok(
    findTweetTextEl(article) || findActionBar(article),
    'no badge insert target (text el or action bar)',
  );
  applyVerdict(article, notSlop(id), DEFAULT_SETTINGS);
  const row = ownSlopRow(article);
  assert.ok(row, 'badge row missing after applyVerdict');
  assert.equal(
    row.closest(
      '[data-testid="videoPlayer"], [data-testid="videoComponent"], [data-testid="previewInterstitial"], [data-testid="card.wrapper"]',
    ),
    null,
  );
  assert.match(row.textContent ?? '', /Slop \| 2%/);
}

/**
 * miss-quote-video.png — "Mihura reposteó" of Vicent Martí quoting Pedro Sánchez.
 * Real X: outer role=group wraps the whole card; commentary is a lang node (no tweetText);
 * quoted post is a role=link box, not data-testid=tweet; video sits in a nested tweet husk
 * with a duration <time>.
 */
function fixtureMissQuoteVideo(): string {
  return `
    <div data-testid="cellInnerDiv">
      <a href="/vmg/status/10001" aria-label="View post"></a>
      <article data-testid="tweet" id="quote-rt">
        <div role="group" aria-label="Mihura reposteó Vicent Martí This is nothing">
          <div>
            <a data-testid="socialContext" href="/Mihura">Mihura</a>
            <span> reposteó</span>
          </div>
          <div data-testid="User-Name">
            <a href="/vmg"><span>Vicent Martí</span></a>
            <a href="/vmg">@vmg</a>
            <a href="/vmg/status/10001"><time datetime="2026-09-21T10:00:00.000Z">1h</time></a>
          </div>
          <div lang="en">This is nothing. There's no frontier AI development in this country. The very few Spanish engineers working on frontier AI are working for American companies. It is literally impossible to develop competitive AI in the socialist hellscape that this guy has thrust upon us.</div>
          <div role="link" tabindex="0">
            <div data-testid="User-Name">
              <a href="/sanchezcastejon"><span>Pedro Sánchez</span></a>
              <a href="/sanchezcastejon">@sanchezcastejon</a>
              <time>2h</time>
            </div>
            <div lang="es">Hoy presentamos el Plan IA360 para un despliegue responsable de la Inteligencia Artificial.</div>
            ${videoHusk('2:06', 'PT2M6S')}
          </div>
          ${actionBar()}
        </div>
      </article>
    </div>`;
}

/**
 * miss-quote-video.png nesting variant — RT shell around a quote whose nested
 * [data-testid=tweet] is the quoted original, plus a video husk inside it.
 */
function fixtureMissQuoteVideoNestedShell(): string {
  return `
    <article data-testid="tweet" id="rt-shell">
      <div data-testid="socialContext">Mihura reposteó</div>
      <article data-testid="tweet" id="quote-parent">
        <div role="group">
          <div data-testid="User-Name">
            <a href="/vmg"><span>Vicent Martí</span></a>
            <a href="/vmg">@vmg</a>
            <a href="/vmg/status/10001"><time>1h</time></a>
          </div>
          <div lang="en">This is nothing. There's no frontier AI development in this country. The very few Spanish engineers working on frontier AI are working for American companies.</div>
          <article data-testid="tweet" id="quoted">
            <div data-testid="User-Name">
              <a href="/sanchezcastejon">@sanchezcastejon</a>
            </div>
            <a href="/sanchezcastejon/status/10011"><time>2h</time></a>
            <div lang="es">Hoy presentamos el Plan IA360 para un despliegue responsable de la Inteligencia Artificial.</div>
            ${videoHusk('2:06', 'PT2M6S')}
          </article>
          ${actionBar()}
        </div>
      </article>
    </article>`;
}

/**
 * miss-monos-video.png — @monospodcast short caption + native video.
 * Real X: outer role=group; caption in div[lang] (no tweetText); duration <time>
 * and "AI"/"Original" overlays live inside the video husk and must not steal text.
 */
function fixtureMissMonosVideo(): string {
  return `
    <div data-testid="cellInnerDiv">
      <a href="/monospodcast/status/10002" aria-label="View post"></a>
      <article data-testid="tweet" id="monos">
        <div role="group" aria-label="monos estocásticos La IA está ayudando">
          <div data-testid="User-Name">
            <a href="/monospodcast"><span>monos estocásticos</span></a>
            <a href="/monospodcast">@monospodcast</a>
          </div>
          <time>20 sept.</time>
          <div lang="es">La IA está ayudando a los chavales a integrarse y poder ser uno más, menos mal.</div>
          ${videoHusk('0:14', 'PT14S', '<div data-testid="tweetText">Original</div><span>AI</span>')}
          ${actionBar()}
        </div>
      </article>
    </div>`;
}

/**
 * hit-image-mostrar-mas.png — @root_rat text + flowchart image + "Mostrar más".
 * Control: already badges on 0.1.13; must keep working inside X's outer role=group.
 */
function fixtureHitMostrarMas(): string {
  return `
    <article data-testid="tweet" id="root-rat">
      <div role="group" aria-label="Pablo R. Toca desempolvar esto">
        <div data-testid="User-Name">
          <a href="/root_rat"><span>Pablo R. (Root Rat)</span></a>
          <a href="/root_rat">@root_rat</a>
          <a href="/root_rat/status/10003"><time>20 sept.</time></a>
        </div>
        <div>
          <div lang="es">Toca desempolvar esto... es lo malo de la velocidad warp que lleva la IA.. proyectos muy prometedores que tenía se van relegando. Pero lo de Jev me ha hecho darle una pensada y recuperar cosas que tenía muy avanzadas hace un año desde otra perspectiva y para un caso de uso muy</div>
          <div data-testid="tweet-text-show-more-link">Mostrar más</div>
        </div>
        <div data-testid="tweetPhoto"></div>
        ${actionBar()}
      </div>
    </article>`;
}

test('screenshot miss-quote-video: RT of quote+video extracts commentary', () => {
  const root = mount(fixtureMissQuoteVideo());
  const cards = listTweetArticles(root);
  const ready = cards.filter((card) => extractTweet(card));
  assert.ok(ready.length >= 1);
  const parent = ready.find((card) => extractTweet(card)?.id === '10001') ?? ready[0]!;
  assertReadyBadge(parent, '10001', /frontier AI/);
  assert.equal(extractTweet(parent)?.handle, '@vmg');
  assert.equal(isRetweetCard(parent), true);
});

test('screenshot miss-quote-video: nested RT shell + quoted video card', () => {
  const root = mount(fixtureMissQuoteVideoNestedShell());
  const cards = listTweetArticles(root);
  const shell = root.querySelector('#rt-shell') as HTMLElement;
  assert.equal(cards.includes(shell), false);
  const parent = cards.find((card) => card.id === 'quote-parent');
  assert.ok(parent);
  assertReadyBadge(parent, '10001', /frontier AI/);
  const quoted = cards.find((card) => card.id === 'quoted');
  assert.ok(quoted, 'quoted video card was dropped');
  assertReadyBadge(quoted, '10011', /Plan IA360/);
});

test('screenshot miss-monos-video: caption+video extracts and badges outside the player', () => {
  const root = mount(fixtureMissMonosVideo());
  const cards = listTweetArticles(root);
  assert.equal(cards.length, 1);
  const item = extractTweet(cards[0]!);
  assert.ok(item);
  assert.equal(item.text.includes('Original'), false);
  assertReadyBadge(cards[0]!, '10002', /chavales/);
  assert.equal(item.handle, '@monospodcast');
});

test('screenshot hit-image-mostrar-mas: image + Mostrar más still extracts', () => {
  const root = mount(fixtureHitMostrarMas());
  const cards = listTweetArticles(root);
  assert.equal(cards.length, 1);
  const item = extractTweet(cards[0]!);
  assert.ok(item);
  assert.equal(item.text.includes('Mostrar más'), false);
  assertReadyBadge(cards[0]!, '10003', /desempolvar/);
});

/**
 * miss-linus-video.png — @LinusEkenstam native video (2:35, face-cam inset) +
 * caption; NO badge. Same viewport: text RT “Borja Perez reposteó”
 * @G_Programming with green Slop | 19% (control).
 *
 * Live X deltas vs 0.1.14 monos fixture:
 * - Caption is dir=auto (no tweetText, no lang)
 * - Status id is /i/status/:id on the cell overlay; timestamp is unlinked
 * - previewInterstitial + player tweetText (“Original” / “AI”) sit outside
 *   videoPlayer and must not steal extract or the badge insert target
 * - Face-cam is a nested [data-testid=tweet] WITH User-Name inside the player
 * - Outer role=group aria-labelledby + long aria-label (player chrome words)
 */
function fixtureMissLinusVideo(): string {
  return `
    <div data-testid="cellInnerDiv">
      <a href="/i/status/11001" aria-label="View post"></a>
      <article data-testid="tweet" id="linus">
        <div role="group" aria-labelledby="linus-name linus-caption" aria-label="Linus Ekenstam You just created everything LUMIERE Perspective 1920 x 1012 orbit Scroll to zoom 2:35">
          <div id="linus-name" data-testid="User-Name">
            <a href="/LinusEkenstam"><span>Linus Ekenstam</span></a>
            <a href="/LinusEkenstam">@LinusEkenstam</a>
          </div>
          <time>1h</time>
          <div id="linus-caption" dir="auto">You just created everything, inspired by timeline. What a time to be alive</div>
          <div data-testid="previewInterstitial">
            <div data-testid="tweetText">Original</div>
          </div>
          <div data-testid="videoComponent">
            <div data-testid="tweet">
              <div data-testid="videoPlayer">
                <div aria-live="polite" aria-label="Video player LUMIERE Perspective">
                  <time datetime="PT2M35S">2:35</time>
                  <div data-testid="tweetText">AI</div>
                </div>
              </div>
            </div>
            <div data-testid="tweet" id="linus-facecam">
              <div data-testid="User-Name"><a href="/LinusEkenstam">@LinusEkenstam</a></div>
            </div>
          </div>
          ${actionBar()}
        </div>
      </article>
    </div>
    <div data-testid="cellInnerDiv">
      <article data-testid="tweet" id="borja-rt">
        <div>
          <a data-testid="socialContext" href="/BorjaPerez">Borja Perez</a>
          <span> reposteó</span>
        </div>
        ${tweetBody({
          id: '11009',
          handle: 'G_Programming',
          name: 'Gentleman Programming',
          text: 'Lo digo sin asco, Qwen 3.8, GLM 5.3 y DeepSeek 4.1 tambien sus versiones flash cumplen el 90% de las necesidades sobre un buen harness',
        })}
      </article>
    </div>`;
}

/**
 * miss-quote-monos-video.png — @JavierSirvent quote of @monospodcast with
 * video (2:11) in the quoted card; outer has commentary + YouTube link; NO badge.
 *
 * Live X deltas vs 0.1.14 quote+video fixtures:
 * - First-party quote (not an RT shell)
 * - Commentary is dir=auto (no tweetText / lang) plus a YouTube URL
 * - YouTube preview is data-testid=card.wrapper (must not swallow the caption)
 * - Quoted card is role=link (not data-testid=tweet) with dir=auto + video husk
 * - Status id is /i/status/:id on the cell overlay; outer time is unlinked
 * - Outer role=group aria-labelledby includes quote + player chrome
 */
function fixtureMissSirventQuoteVideo(): string {
  return `
    <div data-testid="cellInnerDiv">
      <a href="/i/status/11002" aria-label="View post"></a>
      <article data-testid="tweet" id="sirvent">
        <div role="group" aria-labelledby="js-name js-caption js-quote" aria-label="Javier Sirvent Conte hace 14 anos monospodcast Neuralink 2:11">
          <div id="js-name" data-testid="User-Name">
            <a href="/JavierSirvent"><span>Javier Sirvent</span></a>
            <a href="/JavierSirvent">@JavierSirvent</a>
          </div>
          <time>20 sept.</time>
          <div id="js-caption" dir="auto">Conte hace 14 anos que el presente fue ciencia ficcion; explique lo que ahora es un producto comercial. Para ser mi primera vez hablando en publico, fueron 25000 personas, retransmitido en directo. Companeros y amigos de esta tarde fueron @stevewoz @geochurch youtube.com/watch?v=3688abcd</div>
          <div data-testid="card.wrapper">
            <div data-testid="card.layoutLarge.media">
              <a href="https://youtube.com/watch?v=3688abcd">YouTube</a>
            </div>
          </div>
          <div id="js-quote" role="link" tabindex="0">
            <div data-testid="User-Name">
              <a href="/monospodcast"><span>monos estocasticos</span></a>
              <a href="/monospodcast">@monospodcast</a>
            </div>
            <div dir="auto">Nos ha dejado maravillados este video de paciente con implante cerebral Neuralink: el interfaz cerebro a voz permitio a este enfermo de ELA pensar las palabras y que el ordenador las reprodujera con su propia voz</div>
            ${videoHusk('2:11', 'PT2M11S', '<div data-testid="tweetText">Original</div><span>AI</span>')}
          </div>
          ${actionBar()}
        </div>
      </article>
    </div>`;
}

/**
 * miss-quote-monos-video.png nesting variant — quoted original is a real
 * [data-testid=tweet] (not just role=link), still with video husk + /i/status id.
 */
function fixtureMissSirventQuoteVideoNested(): string {
  return `
    <div data-testid="cellInnerDiv">
      <a href="/i/status/11002" aria-label="View post"></a>
      <article data-testid="tweet" id="sirvent-parent">
        <div role="group" aria-labelledby="sp-name sp-caption">
          <div id="sp-name" data-testid="User-Name">
            <a href="/JavierSirvent"><span>Javier Sirvent</span></a>
            <a href="/JavierSirvent">@JavierSirvent</a>
          </div>
          <time>20 sept.</time>
          <div id="sp-caption" dir="auto">Conte hace 14 anos que el presente fue ciencia ficcion; explique lo que ahora es un producto comercial. youtube.com/watch?v=3688abcd</div>
          <div data-testid="card.wrapper">
            <div data-testid="card.layoutLarge.media"><span>YouTube</span></div>
          </div>
          <article data-testid="tweet" id="sirvent-quoted">
            <div data-testid="User-Name"><a href="/monospodcast">@monospodcast</a></div>
            <a href="/monospodcast/status/11012"><time>20 sept.</time></a>
            <div dir="auto">Nos ha dejado maravillados este video de paciente con implante cerebral Neuralink</div>
            ${videoHusk('2:11', 'PT2M11S')}
          </article>
          ${actionBar()}
        </div>
      </article>
    </div>`;
}

test('screenshot miss-linus-video: native video + dir=auto caption extracts and badges', () => {
  const root = mount(fixtureMissLinusVideo());
  const cards = listTweetArticles(root);
  const linus = cards.find((card) => card.id === 'linus');
  assert.ok(linus, 'Linus video card was not listed');
  const info = explainExtract(linus);
  assert.equal(info.ok, true, info.reason);
  const item = extractTweet(linus);
  assert.ok(item);
  assert.equal(item.text.includes('Original'), false);
  assert.equal(item.text.includes('LUMIERE'), false);
  assertReadyBadge(linus, '11001', /created everything/);
  assert.equal(item.handle, '@LinusEkenstam');
  assert.equal(linus.querySelector('#linus-facecam') && listTweetArticles(root).includes(root.querySelector('#linus-facecam') as HTMLElement), false);
});

test('screenshot miss-linus-video: control text RT in the same viewport still badges', () => {
  const root = mount(fixtureMissLinusVideo());
  const rt = listTweetArticles(root).find((card) => card.id === 'borja-rt');
  assert.ok(rt, 'Borja text RT control was not listed');
  assertReadyBadge(rt, '11009', /DeepSeek/);
  assert.equal(isRetweetCard(rt), true);
});

test('screenshot miss-quote-monos-video: quote + YouTube + quoted video extracts', () => {
  const root = mount(fixtureMissSirventQuoteVideo());
  const cards = listTweetArticles(root);
  const parent = cards.find((card) => card.id === 'sirvent') ?? cards[0];
  assert.ok(parent, 'Sirvent quote card was not listed');
  const info = explainExtract(parent);
  assert.equal(info.ok, true, info.reason);
  const item = extractTweet(parent);
  assert.ok(item);
  assert.equal(item.text.includes('Original'), false);
  assert.equal(item.text.includes('YouTube'), false);
  assertReadyBadge(parent, '11002', /ciencia ficcion/);
  assert.equal(item.handle, '@JavierSirvent');
});

test('screenshot miss-quote-monos-video: nested quoted video card also badges', () => {
  const root = mount(fixtureMissSirventQuoteVideoNested());
  const cards = listTweetArticles(root);
  const parent = cards.find((card) => card.id === 'sirvent-parent');
  assert.ok(parent);
  assertReadyBadge(parent, '11002', /ciencia ficcion/);
  const quoted = cards.find((card) => card.id === 'sirvent-quoted');
  assert.ok(quoted, 'quoted video card was dropped');
  assertReadyBadge(quoted, '11012', /Neuralink/);
});
