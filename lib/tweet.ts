export type ExtractedTweet = {
  id: string;
  text: string;
  handle: string;
  article: HTMLElement;
};

const STATUS_RE = /\/status\/(\d+)/;

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
  const all = [...root.querySelectorAll('article[data-testid="tweet"]')].filter(
    (node): node is HTMLElement => node instanceof HTMLElement,
  );
  return all.filter((article) => {
    const nested = article.querySelector('article[data-testid="tweet"]');
    if (!nested) return true;
    // Quote tweet with commentary: parent still has its own tweetText.
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

export function isRetweetCard(article: HTMLElement): boolean {
  const social = article.querySelector('[data-testid="socialContext"]');
  if (!social) return false;
  const blob = (social.textContent ?? '').toLowerCase();
  return /reposteó|reposted|retweeted|repostió|ha retwitteado/.test(blob);
}

/** Text for this card (not nested quoted tweets). Falls back for retweet shells. */
function ownTweetText(article: HTMLElement): string {
  const parts: string[] = [];
  for (const node of article.querySelectorAll('[data-testid="tweetText"]')) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.closest('article[data-testid="tweet"]') !== article) continue;
    const t = node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (t) parts.push(t);
  }
  if (parts.length > 0) return parts.join('\n').trim();

  // Retweet / odd shells: take first tweetText under this card even if nesting is weird.
  if (isRetweetCard(article)) {
    for (const node of article.querySelectorAll('[data-testid="tweetText"]')) {
      const t = node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      if (t.length >= 8) return t;
    }
  }
  return '';
}

function ownTweetId(article: HTMLElement): string | null {
  const time = article.querySelector('time');
  const timeLink = time?.closest('a');
  if (timeLink && belongsToArticle(timeLink, article)) {
    const id = tweetIdFromHref(timeLink.getAttribute('href') ?? '');
    if (id) return id;
  }

  for (const a of article.querySelectorAll('a[href*="/status/"]')) {
    if (!(a instanceof HTMLElement)) continue;
    if (!belongsToArticle(a, article)) continue;
    // Skip analytics / photo status deep links when a cleaner status exists — still OK as id.
    const id = tweetIdFromHref(a.getAttribute('href') ?? '');
    if (id) return id;
  }

  // Retweet fallback: any /status/ id under the card.
  if (isRetweetCard(article)) {
    for (const a of article.querySelectorAll('a[href*="/status/"]')) {
      const id = tweetIdFromHref(a.getAttribute('href') ?? '');
      if (id) return id;
    }
  }
  return null;
}

function ownHandle(article: HTMLElement): string {
  for (const a of article.querySelectorAll('[data-testid="User-Name"] a[href^="/"]')) {
    if (!(a instanceof HTMLElement)) continue;
    if (!belongsToArticle(a, article)) continue;
    const handle = (a.getAttribute('href') ?? '').replace(/^\//, '').split('/')[0];
    // Skip empty or "i" interstitial paths
    if (handle && handle !== 'i') return `@${handle}`;
  }
  if (isRetweetCard(article)) {
    for (const a of article.querySelectorAll('a[href^="/"]')) {
      const href = a.getAttribute('href') ?? '';
      if (href.includes('/status/')) continue;
      const handle = href.replace(/^\//, '').split('/')[0];
      if (handle && !['home', 'explore', 'search', 'i'].includes(handle)) return `@${handle}`;
    }
  }
  return '';
}

function belongsToArticle(node: Element, article: HTMLElement): boolean {
  const owner = node.closest('article[data-testid="tweet"]');
  return owner === article;
}
