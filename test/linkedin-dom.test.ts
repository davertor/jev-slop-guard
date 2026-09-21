import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';
import { extractLinkedInPost, listLinkedInArticles } from '../lib/linkedin';
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
