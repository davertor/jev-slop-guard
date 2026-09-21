import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';
import { applyVerdict, clearStamp, ownSlopRow } from '../lib/badge';
import { extractLinkedInPost, listLinkedInArticles } from '../lib/linkedin';
import { DEFAULT_SETTINGS } from '../lib/settings';
import { isLinkedInUrl } from '../lib/chrome-msg';

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

/**
 * miss-linkedin-feed.png — celebrate header + Javi Santana commentary + link card.
 */
function fixtureJaviCelebrate(): string {
  return `
    <div class="feed-shared-update-v2" data-urn="urn:li:activity:7001111111" id="javi-post">
      <div class="update-components-header">Pelayo Arbues, Ph.D. celebra esto</div>
      <div class="update-components-actor__title"><a href="/in/javisantana"><span aria-hidden="true">Javi Santana</span></a></div>
      <div class="feed-shared-update-v2__commentary update-components-text">
        <span dir="ltr">He escrito un articulo sobre Forward Deployed Engineers a pie de calle. Merece la pena.</span>
      </div>
      <a href="https://javisantana.com/forward">Forward Deployed Engineer a pie de calle</a>
    </div>`;
}

/**
 * miss-linkedin-feed.png — suggestions row + Abhishek post about Jev with image.
 */
function fixtureAbhishekJev(): string {
  return `
    <div class="feed-shared-update-v2" data-urn="urn:li:activity:7002222222" id="abhi-post">
      <div>Sugerencias</div>
      <div class="update-components-actor__title"><a href="/in/abhishek"><span aria-hidden="true">Abhishek Sharma</span></a></div>
      <div class="feed-shared-update-v2__commentary update-components-text">
        <span dir="ltr">Jev is getting a lot of hype right now, mostly due to non-techno influencers going crazy about it. Here is a clear diagram of the decision layer.</span>
      </div>
      <img alt="Jev: A Fast Decision Layer for Coding Agents" />
    </div>`;
}

function fixtureSponsored(): string {
  return `
    <div class="feed-shared-update-v2" data-urn="urn:li:sponsoredContent:1" id="ad-post">
      <div class="update-components-actor__sub-description"><span>Promocionado</span></div>
      <div class="feed-shared-update-v2__commentary"><span dir="ltr">Buy our cloud platform with this limited offer today now.</span></div>
    </div>`;
}

test('isLinkedInUrl matches linkedin hosts only', () => {
  assert.equal(isLinkedInUrl('https://www.linkedin.com/feed/'), true);
  assert.equal(isLinkedInUrl('https://linkedin.com/in/x'), true);
  assert.equal(isLinkedInUrl('https://x.com/home'), false);
});

test('screenshot miss-linkedin: celebrate + commentary extracts', () => {
  const root = mount(fixtureJaviCelebrate());
  const cards = listLinkedInArticles(root);
  assert.ok(cards.some((c) => c.id === 'javi-post'));
  const item = extractLinkedInPost(root.querySelector('#javi-post') as HTMLElement);
  assert.ok(item);
  assert.match(item.text, /Forward Deployed/);
  assert.match(item.id, /7001111111|activity/);
});

test('screenshot miss-linkedin: suggestions Jev post extracts', () => {
  const root = mount(fixtureAbhishekJev());
  const item = extractLinkedInPost(root.querySelector('#abhi-post') as HTMLElement);
  assert.ok(item);
  assert.match(item.text, /Jev is getting a lot of hype/i);
});

test('LinkedIn sponsored label is skipped', () => {
  const root = mount(fixtureSponsored());
  assert.equal(extractLinkedInPost(root.querySelector('#ad-post') as HTMLElement), null);
});

test('regression stacked badges: one urn post gets a single badge row', () => {
  const root = mount(`
    <div class="feed-shared-update-v2" data-urn="urn:li:activity:7003333333" id="gallery-post">
      <div class="update-components-actor__title"><a href="/in/x"><span aria-hidden="true">Author</span></a></div>
      <div class="feed-shared-update-v2__commentary update-components-text">
        <span dir="ltr">Check out this gallery of Jev use cases across seven projects in one shot.</span>
      </div>
      <div class="feed-shared-update-v2" id="nested-a"><span dir="ltr">nested tile a with enough text to look like a post body here</span></div>
      <div class="feed-shared-update-v2" id="nested-b"><span dir="ltr">nested tile b with enough text to look like a post body here</span></div>
      <div class="feed-shared-update-v2" id="nested-c"><span dir="ltr">nested tile c with enough text to look like a post body here</span></div>
      <div class="social-details-social-activity">
        <button>Recomendar</button><button>Comentar</button>
      </div>
    </div>`);
  const cards = listLinkedInArticles(root);
  assert.equal(cards.length, 1, `expected 1 card, got ${cards.map((c) => c.id).join(',')}`);
  assert.equal(cards[0]?.id, 'gallery-post');
});

test('regression stacked badges: repeated applyVerdict keeps one row', () => {
  const root = mount(`
    <div class="feed-shared-update-v2" data-urn="urn:li:activity:7004444444" id="one-post">
      <div class="feed-shared-update-v2__commentary update-components-text">
        <span dir="ltr">A single LinkedIn update that must only ever show one Slop badge row.</span>
      </div>
      <div class="social-details-social-activity"><button>Recomendar</button></div>
    </div>`);
  const article = root.querySelector('#one-post') as HTMLElement;
  const verdict = {
    tweetId: 'li-activity-7004444444',
    label: 'not_slop' as const,
    slopP: 0.02,
    notP: 0.98,
    model: 'jev-latest',
  };
  applyVerdict(article, verdict, { ...DEFAULT_SETTINGS, showNotSlop: true });
  applyVerdict(article, verdict, { ...DEFAULT_SETTINGS, showNotSlop: true });
  applyVerdict(article, verdict, { ...DEFAULT_SETTINGS, showNotSlop: true });
  assert.equal(article.querySelectorAll('.slop-guard-row').length, 1);
  assert.ok(ownSlopRow(article));
  assert.match(ownSlopRow(article)?.textContent ?? '', /Slop \| 2%/);
});

test('regression LI badge placement: row is first child of the card', () => {
  const root = mount(`
    <div class="feed-shared-update-v2" data-urn="urn:li:activity:7005555555" id="top-post">
      <div class="update-components-actor__title"><a href="/in/x"><span aria-hidden="true">Author</span></a></div>
      <div class="feed-shared-update-v2__commentary update-components-text">
        <span dir="ltr">Badge must sit above this LinkedIn post body and not under the actions.</span>
      </div>
      <div class="social-details-social-activity"><button>Recomendar</button><button>Comentar</button></div>
    </div>`);
  const article = root.querySelector('#top-post') as HTMLElement;
  applyVerdict(
    article,
    {
      tweetId: 'li-activity-7005555555',
      label: 'not_slop' as const,
      slopP: 0.02,
      notP: 0.98,
      model: 'jev-latest',
    },
    { ...DEFAULT_SETTINGS, showNotSlop: true },
  );
  const rows = article.querySelectorAll('.slop-guard-row');
  assert.equal(rows.length, 1);
  assert.equal(article.firstElementChild, rows[0], 'badge row must be the first child of the LI card');
  const action = article.querySelector('.social-details-social-activity');
  assert.ok(action);
  const kids = [...article.children];
  assert.ok(
    kids.indexOf(rows[0]!) < kids.indexOf(action!),
    'badge must appear before Recomendar/Comentar',
  );
});

test('regression LI badge: re-homes row from bottom to top on applyVerdict', () => {
  const root = mount(`
    <div class="feed-shared-update-v2" data-urn="urn:li:activity:7006666666" id="rehome-post">
      <div class="update-components-actor__title"><a href="/in/x"><span aria-hidden="true">Author</span></a></div>
      <div class="feed-shared-update-v2__commentary update-components-text">
        <span dir="ltr">Body text long enough for extract so the badge must stay at the top of this card.</span>
      </div>
      <div class="social-details-social-activity"><button>Recomendar</button></div>
    </div>`);
  const article = root.querySelector('#rehome-post') as HTMLElement;
  const stray = document.createElement('div');
  stray.className = 'slop-guard-row';
  stray.innerHTML = '<span class="slop-guard-badge">old</span>';
  article.append(stray);
  assert.equal(article.lastElementChild, stray);
  applyVerdict(
    article,
    {
      tweetId: 'li-activity-7006666666',
      label: 'not_slop' as const,
      slopP: 0.0,
      notP: 1,
      model: 'jev-latest',
    },
    { ...DEFAULT_SETTINGS, showNotSlop: true },
  );
  assert.equal(article.querySelectorAll('.slop-guard-row').length, 1);
  assert.equal(article.firstElementChild?.className, 'slop-guard-row');
});

test('collapsed LI show-more: extracts full commentary, not only truncated teaser', () => {
  const full =
    'La Casa Real cuesta 8,4 millones al año. Eso es lo que pone en el papel oficial. Pero el coste real es mucho mayor cuando sumas seguridad, viajes y estructura mediática alrededor de la monarquía en España hoy.';
  const root = mount(`
    <div class="feed-shared-update-v2" data-urn="urn:li:activity:7007777777" id="collapse-post">
      <div class="update-components-actor__title"><a href="/in/yonatan"><span aria-hidden="true">Yonatan</span></a></div>
      <div class="feed-shared-inline-show-more-text feed-shared-update-v2__commentary update-components-text">
        <span dir="ltr">${full}</span>
        <button type="button">… más</button>
      </div>
      <div class="social-details-social-activity"><button>Recomendar</button></div>
    </div>`);
  const item = extractLinkedInPost(root.querySelector('#collapse-post') as HTMLElement);
  assert.ok(item);
  assert.ok(item!.text.includes('coste real'), `expected full body, got: ${item!.text}`);
  assert.ok(item!.text.length > 80);
  assert.equal(/más$/i.test(item!.text), false);
});

test('Sugerencias rail is not listed as a LinkedIn post card', () => {
  const root = mount(`
    <div class="feed-shared-update-v2" id="suggestions-rail">
      <h2>Sugerencias</h2>
      <div class="discovery-ocean-actor-item">Person 1</div>
    </div>
    <div class="feed-shared-update-v2" data-urn="urn:li:activity:7008888888" id="real-post">
      <div class="feed-shared-update-v2__commentary"><span dir="ltr">A real LinkedIn update with enough text to be judged as a post body here.</span></div>
    </div>`);
  const cards = listLinkedInArticles(root);
  assert.equal(cards.some((c) => c.id === 'suggestions-rail'), false);
  assert.equal(cards.some((c) => c.id === 'real-post'), true);
});

test('regression FeedType card without data-urn: badge still pins as first child', () => {
  const root = mount(`
    <div componentkey="urn:li:feedType:MAIN_FEED:abc" data-finite-scroll-hotkey-item="1" id="feedtype-post">
      <div class="update-components-actor__title"><a href="/in/x"><span aria-hidden="true">Author</span></a></div>
      <div class="feed-shared-update-v2__commentary update-components-text">
        <span dir="ltr">Hace poco me compré un Garmin. Tras un par de semanas usándolo, me di cuenta de que estaba acumulando muchísimos datos que apenas sabía interpretar.</span>
      </div>
      <div><button aria-label="Recomendar">Recomendar</button><button>Comentar</button></div>
    </div>`);
  const article = root.querySelector('#feedtype-post') as HTMLElement;
  applyVerdict(
    article,
    {
      tweetId: 'li-feedtype-1',
      label: 'not_slop' as const,
      slopP: 0,
      notP: 1,
      model: 'jev-latest',
    },
    { ...DEFAULT_SETTINGS, showNotSlop: true },
  );
  assert.equal(article.firstElementChild?.className, 'slop-guard-row');
  assert.equal(article.querySelectorAll('.slop-guard-row').length, 1);
  assert.equal((article.firstElementChild as HTMLElement).style.position, 'absolute');
  assert.equal((article.firstElementChild as HTMLElement).style.top, '8px');
});

test('extract LinkedIn FeedType collapsed Garmin-like post yields long body', () => {
  const body =
    'Hace poco me compré un Garmin. Tras un par de semanas usándolo, me di cuenta de que estaba acumulando muchísimos datos que apenas sabía interpretar: ratio vertical medio, potencias, carga aguda, y acabé construyendo un private trainer conectado con Strava.';
  const root = mount(`
    <div componentkey="FeedType_MAIN_FEED:g1" id="garmin-post">
      <div class="update-components-text">
        <span dir="ltr">${body}</span>
        <button type="button">… más</button>
      </div>
      <a href="https://github.com/AgustinG-git/private-trainer">GitHub - private-trainer</a>
    </div>`);
  const item = extractLinkedInPost(root.querySelector('#garmin-post') as HTMLElement);
  assert.ok(item);
  assert.ok(item!.text.includes('private trainer') || item!.text.includes('Strava'), item!.text);
  assert.ok(item!.text.length > 100, `too short: ${item!.text.length}`);
});

test('regression LI Show the post: clearStamp removes overlay on LinkedIn cards', () => {
  const root = mount(`
    <div class="feed-shared-update-v2" data-urn="urn:li:activity:7009999999" id="stamp-post">
      <div class="feed-shared-update-v2__commentary update-components-text">
        <span dir="ltr">A clearly empty personal-brand flex post that should stamp as slop for this regression.</span>
      </div>
    </div>`);
  const article = root.querySelector('#stamp-post') as HTMLElement;
  let putBackCalls = 0;
  applyVerdict(
    article,
    {
      tweetId: 'li-activity-7009999999',
      label: 'slop' as const,
      slopP: 0.95,
      notP: 0.05,
      model: 'jev-latest',
    },
    { ...DEFAULT_SETTINGS, showNotSlop: true, stampEnabled: true, threshold: 0.7 },
    {
      onPutBack: () => {
        putBackCalls += 1;
        clearStamp(article);
      },
    },
  );
  assert.equal(article.querySelectorAll('.slop-guard-overlay').length, 1);
  assert.ok(article.classList.contains('slop-guard-stamped'));
  const btn = article.querySelector('.slop-guard-putback') as HTMLButtonElement;
  assert.ok(btn);
  btn.click();
  assert.equal(putBackCalls, 1);
  assert.equal(article.querySelectorAll('.slop-guard-overlay').length, 0, 'overlay must be gone after Show the post');
  assert.equal(article.classList.contains('slop-guard-stamped'), false);
});
