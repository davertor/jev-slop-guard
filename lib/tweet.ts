export type ExtractedTweet = {
  id: string;
  text: string;
  handle: string;
  article: HTMLElement;
};

const STATUS_RE = /\/status\/(\d+)/;
const REPOST_RE =
  /reposted|retweeted|repost[oó]|reposte[oó]|reposti[oó]|retwitte[oó]|ha\s+retwitteado|ha\s+reposteado|retuite[oó]/i;

export function tweetIdFromHref(href: string): string | null {
  const match = href.match(STATUS_RE);
  return match?.[1] ?? null;
}

export function extractTweet(article: HTMLElement): ExtractedTweet | null {
  if (isPromoted(article)) return null;

  const text = ownTweetText(article);
  if (text.length < 8) return null;

  const id = ownTweetId(article);
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
    const text = el.textContent?.trim();
    if (text === 'Promoted' || text === 'Promoted by' || text === 'Promocionado') return true;
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
    const t = node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (allowNested) {
      if (t.length >= 8) return t;
      continue;
    }
    if (t) parts.push(t);
  }
  return parts.join('\n').trim();
}

function ownTweetId(article: HTMLElement): string | null {
  const own = collectTweetId(article, false);
  if (own) return own;
  if (isRetweetCard(article) || nestedTweetCards(article).length > 0) {
    return collectTweetId(article, true);
  }
  return null;
}

function collectTweetId(article: HTMLElement, allowNested: boolean): string | null {
  const time = queryDeep(article, 'time')[0];
  const timeLink = time?.closest('a');
  if (timeLink && (allowNested || belongsToArticle(timeLink, article))) {
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
    if (handle && handle !== 'i') return `@${handle}`;
  }
  if (isRetweetCard(article) || nestedTweetCards(article).length > 0) {
    for (const a of queryDeep(article, 'a[href^="/"]')) {
      const href = a.getAttribute('href') ?? '';
      if (href.includes('/status/')) continue;
      const handle = href.replace(/^\//, '').split('/')[0];
      if (handle && !['home', 'explore', 'search', 'i'].includes(handle)) return `@${handle}`;
    }
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
    if (queryDeep(cell, '[data-testid="tweetText"]').length > 0) out.push(cell);
  }
  return out;
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
