export type ExtractedTweet = {
  id: string;
  text: string;
  handle: string;
  article: HTMLElement;
};

const STATUS_RE = /\/status\/(\d+)/;
const REPOST_RE =
  /reposted|retweeted|repost[oó]|reposte[oó]|reposti[oó]|retwitte[oó]|ha\s+retwitteado/i;

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
 * Timeline cards, including retweets. If a card nests another tweet (quote),
 * keep the parent when it has its own text; always keep leaves.
 */
export function listTweetArticles(root: ParentNode = document): HTMLElement[] {
  let all = [...root.querySelectorAll('article[data-testid="tweet"]')].filter(
    (node): node is HTMLElement => node instanceof HTMLElement,
  );
  if (all.length === 0) {
    all = uniqueElements([...queryDeep(root, 'article[data-testid="tweet"]'), ...articlesFromCells(root)]);
  }
  return all.filter((article) => {
    const nested = article.querySelector('article[data-testid="tweet"]');
    if (!nested) return true;
    return ownTweetText(article).length >= 8;
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
  const social = queryDeep(article, '[data-testid="socialContext"]')[0];
  if (!social) return false;
  return isRetweetContext(social.textContent ?? '');
}

/** Text for this card (not nested quoted tweets). Falls back for retweet shells. */
function ownTweetText(article: HTMLElement): string {
  const parts: string[] = [];
  for (const node of queryDeep(article, '[data-testid="tweetText"]')) {
    if (!belongsToArticle(node, article)) continue;
    const t = node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (t) parts.push(t);
  }
  if (parts.length > 0) return parts.join('\n').trim();

  if (isRetweetCard(article)) {
    for (const node of queryDeep(article, '[data-testid="tweetText"]')) {
      const t = node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      if (t.length >= 8) return t;
    }
  }
  return '';
}

function ownTweetId(article: HTMLElement): string | null {
  const time = queryDeep(article, 'time')[0];
  const timeLink = time?.closest('a');
  if (timeLink && belongsToArticle(timeLink, article)) {
    const id = tweetIdFromHref(timeLink.getAttribute('href') ?? '');
    if (id) return id;
  }

  for (const a of queryDeep(article, 'a[href*="/status/"]')) {
    if (!belongsToArticle(a, article)) continue;
    const id = tweetIdFromHref(a.getAttribute('href') ?? '');
    if (id) return id;
  }

  if (isRetweetCard(article)) {
    for (const a of queryDeep(article, 'a[href*="/status/"]')) {
      const id = tweetIdFromHref(a.getAttribute('href') ?? '');
      if (id) return id;
    }
  }
  return null;
}

function ownHandle(article: HTMLElement): string {
  for (const a of queryDeep(article, '[data-testid="User-Name"] a[href^="/"]')) {
    if (!belongsToArticle(a, article)) continue;
    const handle = (a.getAttribute('href') ?? '').replace(/^\//, '').split('/')[0];
    if (handle && handle !== 'i') return `@${handle}`;
  }
  if (isRetweetCard(article)) {
    for (const a of queryDeep(article, 'a[href^="/"]')) {
      const href = a.getAttribute('href') ?? '';
      if (href.includes('/status/')) continue;
      const handle = href.replace(/^\//, '').split('/')[0];
      if (handle && !['home', 'explore', 'search', 'i'].includes(handle)) return `@${handle}`;
    }
  }
  return '';
}

function belongsToArticle(node: Element, article: HTMLElement): boolean {
  const owner =
    node.closest('article[data-testid="tweet"]') ?? node.closest('[data-testid="cellInnerDiv"]');
  return owner === article;
}

function articlesFromCells(root: ParentNode): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const cell of queryDeep(root, '[data-testid="cellInnerDiv"]')) {
    const nested = queryDeep(cell, 'article[data-testid="tweet"]');
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

/** querySelectorAll plus one-level-or-deeper shadow roots (X sometimes wraps cells). */
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
