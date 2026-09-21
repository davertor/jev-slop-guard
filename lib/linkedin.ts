export type ExtractedLinkedInPost = {
  id: string;
  text: string;
  handle: string;
  article: HTMLElement;
};

/** Prefer concrete activity cards; fall back to newer FeedType rows. */
const PRIMARY_CARD_SELECTORS = [
  'div.feed-shared-update-v2[data-urn]',
  'div.feed-shared-update-v2[data-id]',
  'div[data-id^="urn:li:activity"]',
  'div[data-urn^="urn:li:activity"]',
  'div[data-urn^="urn:li:ugcPost"]',
  'div[data-urn^="urn:li:share"]',
  'div[data-urn^="urn:li:aggregatedShare"]',
  'div.feed-shared-update-v2',
  'div.occludable-update',
];

const FEED_ROW_SELECTORS = [
  'div[componentkey*="FeedType_MAIN_FEED"]',
  'div[componentkey*="FeedType_"]',
  'div[data-finite-scroll-hotkey-item]',
];

const TEXT_SELECTORS = [
  '.update-components-text',
  '.feed-shared-update-v2__commentary',
  '.feed-shared-update-v2__description',
  '.feed-shared-text',
  '.feed-shared-inline-show-more-text',
  '.update-components-update-v2__commentary',
  '[data-test-id="main-feed-activity-card__commentary"]',
  '.break-words span[dir="ltr"]',
  '.break-words',
];

const ACTOR_SELECTORS = [
  'a[href*="/in/"] span[aria-hidden="true"]',
  'a[href*="/company/"] span[aria-hidden="true"]',
  '.update-components-actor__title span[aria-hidden="true"]',
  '.update-components-actor__title',
  '.update-components-actor__name',
];

export function listLinkedInArticles(root: ParentNode = document): HTMLElement[] {
  const primary = queryAll(root, PRIMARY_CARD_SELECTORS);
  const cards = primary.length > 0 ? primary : queryAll(root, FEED_ROW_SELECTORS);
  const outer = dropNested(cards).filter((el) => {
    // One visual post: skip carousel tiles / nested update wrappers without their own urn.
    if (el.closest('.feed-shared-update-v2[data-urn], div[data-urn^="urn:li:activity"]') &&
        el.closest('.feed-shared-update-v2[data-urn], div[data-urn^="urn:li:activity"]') !== el) {
      return false;
    }
    return true;
  });
  return outer.filter((el) => {
    const rectH = el.getBoundingClientRect().height;
    const h = rectH > 0 ? rectH : (el as HTMLElement).offsetHeight || 0;
    if (h === 0) return true;
    return h > 80 && h < Math.max(window.innerHeight, 600) * 2.5;
  });
}

export function extractLinkedInPost(article: HTMLElement): ExtractedLinkedInPost | null {
  if (isLinkedInPromoted(article)) return null;

  const text = pickText(article);
  if (text.length < 12) return null;

  const id = linkedInId(article, text);
  if (!id) return null;

  return {
    id,
    text: text.slice(0, 4000),
    handle: pickActor(article),
    article,
  };
}

export function isLinkedInPromoted(article: HTMLElement): boolean {
  // Only exact short labels in likely header nodes — not body text mentioning "sponsored".
  for (const el of article.querySelectorAll(
    '.update-components-actor__description, .update-components-actor__sub-description, span, div',
  )) {
    const t = el.textContent?.trim() ?? '';
    if (t.length > 24) continue;
    if (/^(Promoted|Sponsored|Promocionado|Patrocinado)(\s+by)?$/i.test(t)) return true;
  }
  const urn = article.getAttribute('data-urn') ?? article.getAttribute('data-id') ?? '';
  return /sponsored|promoted/i.test(urn);
}

function queryAll(root: ParentNode, selectors: string[]): HTMLElement[] {
  const out: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();
  for (const sel of selectors) {
    for (const node of root.querySelectorAll(sel)) {
      if (!(node instanceof HTMLElement) || seen.has(node)) continue;
      seen.add(node);
      out.push(node);
    }
  }
  return out;
}

function dropNested(els: HTMLElement[]): HTMLElement[] {
  return els.filter((el) => !els.some((other) => other !== el && other.contains(el)));
}

function pickText(article: HTMLElement): string {
  for (const sel of TEXT_SELECTORS) {
    const node = article.querySelector(sel);
    const t = clean(node?.textContent ?? '');
    if (t.length >= 12) return t;
  }

  // Prefer spans under commentary-like containers if class names are hashed.
  const candidates: string[] = [];
  for (const el of article.querySelectorAll('span[dir="ltr"], p, span')) {
    if (el.closest('button, nav, footer, .social-details-social-counts, [role="button"]')) continue;
    const t = clean(el.textContent ?? '');
    if (t.length >= 40 && t.length < 4000) candidates.push(t);
  }
  candidates.sort((a, b) => b.length - a.length);
  if (candidates[0]) return candidates[0];

  let best = '';
  for (const el of article.querySelectorAll('span, p, div')) {
    if (el.closest('button, a[href*="comment"], .social-details-social-counts, [role="button"]')) {
      continue;
    }
    const t = clean(el.textContent ?? '');
    if (t.length > best.length && t.length < 4000 && t.length >= 12) best = t;
  }
  return best;
}

function pickActor(article: HTMLElement): string {
  for (const sel of ACTOR_SELECTORS) {
    const t = clean(article.querySelector(sel)?.textContent ?? '');
    if (t) return t.split('•')[0]?.trim() || t;
  }
  const href =
    article.querySelector('a[href*="/in/"]')?.getAttribute('href') ??
    article.querySelector('a[href*="/company/"]')?.getAttribute('href') ??
    '';
  const m = href.match(/\/(in|company)\/([^/?#]+)/);
  const slug = m?.[2];
  return slug ? `@${decodeURIComponent(slug)}` : '';
}

function linkedInId(article: HTMLElement, text: string): string {
  const urn =
    article.getAttribute('data-id') ||
    article.getAttribute('data-urn') ||
    article.querySelector('[data-id*="urn:li:"]')?.getAttribute('data-id') ||
    article.querySelector('[data-urn*="urn:li:"]')?.getAttribute('data-urn') ||
    '';
  const activity = urn.match(/urn:li:(?:activity|ugcPost|share|aggregatedShare):(\d+)/);
  if (activity?.[1]) return `li-${activity[0].includes('ugcPost') ? 'ugc' : 'activity'}-${activity[1]}`;

  const updateHref =
    article.querySelector('a[href*="/feed/update/"]')?.getAttribute('href') ??
    article.querySelector('a[href*="activity:"]')?.getAttribute('href') ??
    '';
  const fromHref = updateHref.match(/activity[:%](\d+)/) ?? updateHref.match(/(\d{10,})/);
  if (fromHref?.[1]) return `li-href-${fromHref[1]}`;

  const ck = article.getAttribute('componentkey') ?? '';
  if (ck) return `li-ck-${hash(ck).slice(0, 16)}`;

  return `li-h-${hash(text)}`;
}

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function hash(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) | 0;
  return String(Math.abs(h));
}
