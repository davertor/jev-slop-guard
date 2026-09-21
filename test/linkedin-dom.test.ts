import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';
import { applyVerdict, ownSlopRow } from '../lib/badge';
import { extractLinkedInPost, listLinkedInArticles } from '../lib/linkedin';
import { DEFAULT_SETTINGS } from '../lib/settings';
import { isLinkedInUrl } from '../lib/chrome-msg';

const { window, document } = parseHTML('<!DOCTYPE html><html><body></body></html>');
Object.assign(globalThis, {
  window,
  document,
  HTMLElement: window.HTMLElement,
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
