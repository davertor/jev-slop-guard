export type ExtractedTweet = {
  id: string;
  text: string;
  handle: string;
  article: HTMLElement;
};

const STATUS_RE = /\/status\/(\d+)/;
const REPOST_RE =
  /reposted|retweeted|repost[oó]|reposte[oó]|reposti[oó]|retwitte[oó]|ha\s+retwitteado|ha\s+reposteado|retuite[oó]/i;
const HANDLE_SKIP = new Set([
  'home',
  'explore',
  'search',
  'i',
  'hashtag',
  'intent',
  'compose',
  'notifications',
  'messages',
  'settings',
]);
const CHROME_SEL =
  '[data-testid="User-Name"], [data-testid="socialContext"], [role="group"], [data-testid="card.wrapper"], [data-testid="tweetPhoto"], [data-testid="videoPlayer"], [data-testid="videoComponent"], time';
const MEDIA_SEL =
  '[data-testid="tweetText"], [data-testid="tweetPhoto"], [data-testid="videoPlayer"], [data-testid="videoComponent"], [data-testid="card.wrapper"]';

export function tweetIdFromHref(href: string): string | null {
  const match = href.match(STATUS_RE);
  return match?.[1] ?? null;
}

export function extractTweet(article: HTMLElement): ExtractedTweet | null {
  if (isPromoted(article)) return null;

  const text = ownTweetText(article);
  if (text.length < 8) return null;

  const id = ownTweetId(article) ?? fallbackTextId(text);
  if (!id) return null;

  return {
    id,
    text: text.slice(0, 4000),
    handle: ownHandle(article),
    article,
  };
}

/**
 * Timeline cards, including retweets. Quote tweets keep the parent (own commentary)
 * plus the nested quoted card. Retweet shells are dropped when the nested original
 * is extractable — otherwise the shell's querySelector('.slop-guard-row') steals
 * or deletes the inner badge.
 */
export function listTweetArticles(root: ParentNode = document): HTMLElement[] {
  const all = uniqueElements([...queryDeep(root, '[data-testid="tweet"]'), ...articlesFromCells(root)]);
  return all.filter((article) => {
    const nested = nestedTweetCards(article);
    if (nested.length === 0) return true;
    if (hasOwnTweetBody(article)) return true;
    return !nested.some((card) => extractTweet(card));
  });
}

export function isPromoted(article: HTMLElement): boolean {
  if (article.querySelector('[data-testid="placementTracking"], [data-testid="promotedIndicator"]')) {
    return true;
  }
  for (const el of article.querySelectorAll('span')) {
    const text = el.textContent?.trim() ?? '';
    if (!looksPromotedLabel(text)) continue;
    // Media/body spans can say "Promoted" (card copy, video chrome) without being an ad.
    if (el.closest(MEDIA_SEL)) continue;
    return true;
  }
  return false;
}

export function looksPromotedLabel(text: string): boolean {
  return text === 'Promoted' || text === 'Promoted by' || text === 'Promocionado';
}

/** Match X socialContext blobs: "Name reposted" / Spanish "repostó" / "reposteó". */
export function isRetweetContext(blob: string): boolean {
  return REPOST_RE.test(blob);
}

export function isRetweetCard(article: HTMLElement): boolean {
  const cell = article.closest('[data-testid="cellInnerDiv"]');
  const scope: ParentNode = cell ?? article;
  for (const social of queryDeep(scope, '[data-testid="socialContext"]')) {
    const owner = social.closest('[data-testid="tweet"]');
    if (owner && owner !== article) continue;
    const blob = [
      social.getAttribute('aria-label') ?? '',
      social.textContent ?? '',
      social.parentElement?.textContent ?? '',
    ].join(' ');
    if (isRetweetContext(blob)) return true;
  }
  return false;
}

/** Own tweetText first; retweet shells fall back to the nested original. */
export function findTweetTextEl(article: HTMLElement): HTMLElement | null {
  for (const node of queryDeep(article, '[data-testid="tweetText"]')) {
    if (belongsToArticle(node, article)) return node;
  }
  for (const node of queryDeep(article, '[data-testid="tweetText"]')) {
    return node;
  }
  for (const node of queryDeep(article, '[lang]')) {
    if (!belongsToArticle(node, article) || isChrome(node)) continue;
    if (nodeText(node).length >= 8) return node;
  }
  const more = queryDeep(article, '[data-testid="tweet-text-show-more-link"]')[0];
  if (more?.previousElementSibling instanceof HTMLElement) return more.previousElementSibling;
  return null;
}

export function findActionBar(article: HTMLElement): HTMLElement | null {
  for (const testid of ['reply', 'retweet', 'like']) {
    for (const el of queryDeep(article, `[data-testid="${testid}"]`)) {
      if (!belongsToArticle(el, article)) continue;
      const group = el.closest('[role="group"]');
      if (group instanceof HTMLElement && belongsToArticle(group, article)) return group;
      return el;
    }
  }
  return null;
}

function hasOwnTweetBody(article: HTMLElement): boolean {
  return collectTweetText(article, false).length >= 8;
}

function ownTweetText(article: HTMLElement): string {
  const own = collectTweetText(article, false);
  if (own) return own;
  if (isRetweetCard(article) || nestedTweetCards(article).length > 0) {
    return collectTweetText(article, true);
  }
  return '';
}

function collectTweetText(article: HTMLElement, allowNested: boolean): string {
  const parts: string[] = [];
  for (const node of queryDeep(article, '[data-testid="tweetText"]')) {
    if (!allowNested && !belongsToArticle(node, article)) continue;
    const t = nodeText(node);
    if (allowNested) {
      if (t.length >= 8) return t;
      continue;
    }
    if (t) parts.push(t);
  }
  const joined = parts.join('\n').trim();
  if (joined.length >= 8) return joined;
  return fallbackCardText(article, allowNested) || joined;
}

function fallbackCardText(article: HTMLElement, allowNested: boolean): string {
  for (const more of queryDeep(article, '[data-testid="tweet-text-show-more-link"]')) {
    if (!allowNested && !belongsToArticle(more, article)) continue;
    const sibling = more.previousElementSibling;
    if (sibling instanceof HTMLElement) {
      const t = nodeText(sibling);
      if (t.length >= 8) return t;
    }
    const parent = more.parentElement;
    if (parent instanceof HTMLElement) {
      const t = nodeText(parent);
      if (t.length >= 8) return t;
    }
  }

  let best = '';
  for (const node of queryDeep(article, '[lang]')) {
    if (!allowNested && !belongsToArticle(node, article)) continue;
    if (isChrome(node)) continue;
    const t = nodeText(node);
    if (t.length > best.length) best = t;
  }
  if (best.length >= 8) return best;

  const labelled = labelledByText(article);
  return labelled.length >= 8 ? labelled : '';
}

function labelledByText(article: HTMLElement): string {
  const ids = (article.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean);
  const parts: string[] = [];
  for (const id of ids) {
    const el = article.ownerDocument?.getElementById(id);
    if (!(el instanceof HTMLElement) || (el !== article && !article.contains(el))) continue;
    if (el !== article && !belongsToArticle(el, article)) continue;
    if (isChrome(el)) continue;
    const t = nodeText(el);
    if (t.length >= 8) parts.push(t);
  }
  return parts.join('\n').trim();
}

function ownTweetId(article: HTMLElement): string | null {
  const own = collectTweetId(article, false);
  if (own) return own;
  const nested = collectTweetId(article, true);
  if (nested) return nested;
  const cell = article.closest('[data-testid="cellInnerDiv"]');
  if (cell instanceof HTMLElement && cell !== article) {
    const fromCell = collectTweetId(cell, true);
    if (fromCell) return fromCell;
  }
  const parentCard = article.parentElement?.closest('[data-testid="tweet"]');
  if (parentCard instanceof HTMLElement) {
    return collectTweetId(parentCard, false);
  }
  return null;
}

function collectTweetId(article: HTMLElement, allowNested: boolean): string | null {
  for (const time of queryDeep(article, 'time')) {
    const timeLink = time.closest('a');
    if (!timeLink || (!allowNested && !belongsToArticle(timeLink, article))) continue;
    const id = tweetIdFromHref(timeLink.getAttribute('href') ?? '');
    if (id) return id;
  }
  for (const a of queryDeep(article, 'a[href*="/status/"]')) {
    if (!allowNested && !belongsToArticle(a, article)) continue;
    const id = tweetIdFromHref(a.getAttribute('href') ?? '');
    if (id) return id;
  }
  return null;
}

function ownHandle(article: HTMLElement): string {
  for (const a of queryDeep(article, '[data-testid="User-Name"] a[href^="/"]')) {
    if (!belongsToArticle(a, article)) continue;
    const handle = (a.getAttribute('href') ?? '').replace(/^\//, '').split('/')[0];
    if (handle && !HANDLE_SKIP.has(handle)) return `@${handle}`;
  }
  for (const a of queryDeep(article, 'a[href^="/"]')) {
    const href = a.getAttribute('href') ?? '';
    if (href.includes('/status/')) continue;
    const handle = href.replace(/^\//, '').split('/')[0];
    if (handle && !HANDLE_SKIP.has(handle)) return `@${handle}`;
  }
  return '';
}

export function belongsToArticle(node: Element, article: HTMLElement): boolean {
  return tweetCardOwner(node) === article;
}

export function tweetCardOwner(node: Element): HTMLElement | null {
  const owner = node.closest('[data-testid="tweet"]') ?? node.closest('[data-testid="cellInnerDiv"]');
  return owner instanceof HTMLElement ? owner : null;
}

function nestedTweetCards(article: HTMLElement): HTMLElement[] {
  return queryDeep(article, '[data-testid="tweet"]').filter((node) => node !== article);
}

function articlesFromCells(root: ParentNode): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const cell of queryDeep(root, '[data-testid="cellInnerDiv"]')) {
    const nested = queryDeep(cell, '[data-testid="tweet"]');
    if (nested.length > 0) {
      out.push(...nested);
      continue;
    }
    if (cellLooksLikeTweet(cell)) out.push(cell);
  }
  return out;
}

function cellLooksLikeTweet(cell: HTMLElement): boolean {
  if (queryDeep(cell, '[data-testid="tweetText"]').length > 0) return true;
  if (queryDeep(cell, '[data-testid="tweet-text-show-more-link"]').length > 0) return true;
  for (const a of queryDeep(cell, 'a[href*="/status/"]')) {
    if (tweetIdFromHref(a.getAttribute('href') ?? '')) return true;
  }
  for (const node of queryDeep(cell, '[lang]')) {
    if (!isChrome(node) && nodeText(node).length >= 8) return true;
  }
  return false;
}

function uniqueElements(els: HTMLElement[]): HTMLElement[] {
  const seen = new Set<HTMLElement>();
  const out: HTMLElement[] = [];
  for (const el of els) {
    if (seen.has(el)) continue;
    seen.add(el);
    out.push(el);
  }
  return out;
}

function isChrome(node: Element): boolean {
  return Boolean(node.closest(CHROME_SEL));
}

function nodeText(node: HTMLElement): string {
  const light = usableText(node.textContent ?? '');
  if (light.length >= 8) return light;
  const shadow = usableText(node.shadowRoot?.textContent ?? '');
  return shadow.length > light.length ? shadow : light;
}

function usableText(raw: string): string {
  return raw.replace(/\b(Mostrar más|Show more|Show More)\b/gi, '').replace(/\s+/g, ' ').trim();
}

function fallbackTextId(text: string): string {
  // ponytail: stable id when X hid /status/ links; real id wins once the time link hydrates
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) | 0;
  return `x-t-${Math.abs(h).toString(16)}`;
}

/** querySelectorAll plus shadow roots (X sometimes wraps cells). */
export function queryDeep(root: ParentNode, selector: string): HTMLElement[] {
  const out: HTMLElement[] = [];
  const visit = (node: ParentNode): void => {
    for (const el of node.querySelectorAll(selector)) {
      if (el instanceof HTMLElement) out.push(el);
    }
    for (const el of node.querySelectorAll('*')) {
      if (el instanceof HTMLElement && el.shadowRoot) visit(el.shadowRoot);
    }
  };
  visit(root);
  return out;
}
