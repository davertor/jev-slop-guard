export type ExtractedTweet = {
  id: string;
  text: string;
  handle: string;
  article: HTMLElement;
};

const STATUS_RE = /\/status\/(\d+)/;
const REPOST_RE =
  /reposted|retweeted|repost[oó]|reposte[oó]|reposti[oó]|retwitte[oó]|ha\s+retwitteado|ha\s+reposteado|retuite[oó]/i;
const SHOW_MORE_RE = /^(Show more|Mostrar más|Mostrar mas)$/i;
const SHOW_MORE_TAIL = /\s*(Show more|Mostrar más|Mostrar mas)\s*$/i;
const MIN_TEXT = 4;
const MEDIA_CHROME =
  '[data-testid="videoPlayer"], [data-testid="videoComponent"], [data-testid="tweetPhoto"], [data-testid="card.wrapper"], [data-testid="previewInterstitial"], [data-testid="card.layoutLarge.media"], [data-testid="card.layoutSmall.media"]';
const PLAYER_OVERLAY_RE = /^(Original|AI|GIF|Play|Pause|Video|Live)$/i;
const CAPTION_SEL = 'div[lang], span[lang], div[dir="auto"], span[dir="auto"]';

export function tweetIdFromHref(href: string): string | null {
  const match = href.match(STATUS_RE);
  return match?.[1] ?? null;
}

export function extractTweet(article: HTMLElement): ExtractedTweet | null {
  return explainExtract(article).item;
}

/** Why extract failed — probe / console.debug. Reasons stay short. */
export function explainExtract(article: HTMLElement): {
  ok: boolean;
  reason: string;
  item: ExtractedTweet | null;
} {
  if (isPromoted(article)) return { ok: false, reason: 'promoted', item: null };

  const text = ownTweetText(article);
  if (text.length < MIN_TEXT) return { ok: false, reason: 'no-text', item: null };

  const handle = ownHandle(article);
  const id = ownTweetId(article) ?? syntheticId(handle, text);
  return {
    ok: true,
    reason: 'ok',
    item: { id, text: text.slice(0, 4000), handle, article },
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
    if (isMediaHusk(article)) return false;
    const nested = nestedTweetCards(article).filter((card) => !isMediaHusk(card));
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

/** Own tweetText first; then lang/dir=auto caption; retweet shells fall back to nested. Never a node inside the player. */
export function findTweetTextEl(article: HTMLElement): HTMLElement | null {
  for (const node of queryDeep(article, '[data-testid="tweetText"]')) {
    if (belongsToArticle(node, article) && usableText(node.textContent) && !inMediaChrome(node)) return node;
  }
  for (const node of langCaptionNodes(article, false)) {
    if (!inMediaChrome(node)) return node;
  }
  for (const node of queryDeep(article, '[data-testid="tweetText"]')) {
    if (usableText(node.textContent) && !inMediaChrome(node)) return node;
  }
  for (const node of langCaptionNodes(article, true)) {
    if (!inMediaChrome(node)) return node;
  }
  return labelledByNode(article, true);
}

export function findActionBar(article: HTMLElement): HTMLElement | null {
  for (const testid of ['reply', 'retweet', 'like']) {
    for (const el of queryDeep(article, `[data-testid="${testid}"]`)) {
      if (!belongsToArticle(el, article)) continue;
      const group = el.closest('[role="group"]');
      // Card-level role=group also wraps User-Name + media; only the inner action cluster.
      if (
        group instanceof HTMLElement &&
        belongsToArticle(group, article) &&
        !group.querySelector('[data-testid="User-Name"]')
      ) {
        return group;
      }
      return el;
    }
  }
  return null;
}

function hasOwnTweetBody(article: HTMLElement): boolean {
  return collectTweetText(article, false).length >= MIN_TEXT || collectFallbackText(article, false).length >= MIN_TEXT;
}

function ownTweetText(article: HTMLElement): string {
  const own = collectTweetText(article, false);
  if (own.length >= MIN_TEXT) return own;
  const ownFallback = collectFallbackText(article, false);
  if (ownFallback.length >= MIN_TEXT) return ownFallback;
  if (isRetweetCard(article) || nestedTweetCards(article).length > 0) {
    const nested = collectTweetText(article, true);
    if (nested.length >= MIN_TEXT) return nested;
    const nestedFallback = collectFallbackText(article, true);
    if (nestedFallback.length >= MIN_TEXT) return nestedFallback;
  }
  return own || ownFallback;
}

function collectTweetText(article: HTMLElement, allowNested: boolean): string {
  const parts: string[] = [];
  for (const node of queryDeep(article, '[data-testid="tweetText"]')) {
    if (!allowNested && !belongsToArticle(node, article)) continue;
    if (inMediaChrome(node)) continue;
    const t = cleanText(node.textContent);
    if (SHOW_MORE_RE.test(t) || PLAYER_OVERLAY_RE.test(t)) continue;
    if (allowNested) {
      if (t.length >= MIN_TEXT) return t;
      continue;
    }
    if (t) parts.push(t);
  }
  return parts.join('\n').trim();
}

function collectFallbackText(article: HTMLElement, allowNested: boolean): string {
  for (const link of queryDeep(article, '[data-testid="tweet-text-show-more-link"]')) {
    if (!allowNested && !belongsToArticle(link, article)) continue;
    const host = link.parentElement ?? link;
    const t = cleanText(host.textContent).replace(SHOW_MORE_TAIL, '').trim();
    if (t.length >= MIN_TEXT) return t;
  }
  const parts: string[] = [];
  for (const node of langCaptionNodes(article, allowNested)) {
    parts.push(cleanText(node.textContent));
  }
  parts.sort((a, b) => b.length - a.length);
  return parts[0] || labelledByText(article, allowNested);
}

function langCaptionNodes(article: HTMLElement, allowNested: boolean): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const node of queryDeep(article, CAPTION_SEL)) {
    if (!allowNested && !belongsToArticle(node, article)) continue;
    // X wraps the whole card in role=group (plus a nested action bar). Only skip chrome.
    if (node.closest('[data-testid="User-Name"], [data-testid="socialContext"]')) continue;
    if (inMediaChrome(node)) continue;
    if (node.getAttribute('data-testid') === 'tweetText') continue;
    const t = cleanText(node.textContent);
    if (!t || SHOW_MORE_RE.test(t) || PLAYER_OVERLAY_RE.test(t) || t.length < MIN_TEXT) continue;
    out.push(node);
  }
  return out;
}

function labelledByNode(article: HTMLElement, allowNested: boolean): HTMLElement | null {
  const ids = new Set<string>();
  const labelled = [article, ...queryDeep(article, '[aria-labelledby]')];
  for (const el of labelled) {
    if (!allowNested && el !== article && !belongsToArticle(el, article)) continue;
    for (const id of (el.getAttribute('aria-labelledby') ?? '').split(/\s+/)) {
      if (id) ids.add(id);
    }
  }
  let best: HTMLElement | null = null;
  let bestLen = 0;
  for (const id of ids) {
    const node = article.querySelector(`[id="${id}"]`) ?? document.getElementById(id);
    if (!(node instanceof HTMLElement)) continue;
    if (!allowNested && !belongsToArticle(node, article)) continue;
    if (node.closest('[data-testid="User-Name"], [data-testid="socialContext"]')) continue;
    if (inMediaChrome(node)) continue;
    const t = cleanText(node.textContent);
    if (!usableText(t)) continue;
    if (t.length > bestLen) {
      best = node;
      bestLen = t.length;
    }
  }
  return best;
}

function labelledByText(article: HTMLElement, allowNested: boolean): string {
  return cleanText(labelledByNode(article, allowNested)?.textContent);
}

function ownTweetId(article: HTMLElement): string | null {
  return (
    collectTweetId(article, false) ??
    collectIdAround(article) ??
    collectTweetId(article, true)
  );
}

function collectTweetId(article: HTMLElement, allowNested: boolean): string | null {
  for (const time of queryDeep(article, 'time')) {
    if (isDurationTime(time)) continue;
    const timeLink = time.closest('a');
    if (timeLink && (allowNested || belongsToArticle(timeLink, article))) {
      const id = tweetIdFromHref(timeLink.getAttribute('href') ?? '');
      if (id) return id;
    }
  }
  for (const a of queryDeep(article, 'a[href*="/status/"]')) {
    if (!allowNested && !belongsToArticle(a, article)) continue;
    const id = tweetIdFromHref(a.getAttribute('href') ?? '');
    if (id) return id;
  }
  return null;
}

/** Media cards often move /status/:id to a cell overlay or a wrapping <a>. */
function collectIdAround(article: HTMLElement): string | null {
  const wrap = article.closest('a[href*="/status/"]');
  if (wrap instanceof HTMLElement) {
    const id = tweetIdFromHref(wrap.getAttribute('href') ?? '');
    if (id) return id;
  }
  const scope = article.closest('[data-testid="cellInnerDiv"]') ?? article.parentElement;
  if (!scope) return null;
  const ownLink = (a: HTMLElement): boolean => {
    const owner = tweetCardOwner(a);
    return !owner || owner === article || owner === scope;
  };
  for (const time of queryDeep(scope, 'time')) {
    if (isDurationTime(time)) continue;
    const timeLink = time.closest('a');
    if (!timeLink || !ownLink(timeLink)) continue;
    const id = tweetIdFromHref(timeLink.getAttribute('href') ?? '');
    if (id) return id;
  }
  for (const a of queryDeep(scope, 'a[href*="/status/"]')) {
    if (!ownLink(a)) continue;
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
  for (const a of queryDeep(article, '[data-testid="User-Name"] a[href^="/"], a[href^="/"]')) {
    const href = a.getAttribute('href') ?? '';
    if (href.includes('/status/')) continue;
    const handle = href.replace(/^\//, '').split('/')[0];
    if (handle && !['home', 'explore', 'search', 'i'].includes(handle)) return `@${handle}`;
  }
  return '';
}

export function belongsToArticle(node: Element, article: HTMLElement): boolean {
  return tweetCardOwner(node) === article;
}

export function tweetCardOwner(node: Element): HTMLElement | null {
  let scope: HTMLElement | null =
    node.closest('[data-testid="tweet"]') ?? node.closest('[data-testid="cellInnerDiv"]');
  while (scope) {
    if (scope.getAttribute('data-testid') === 'tweet' && !isMediaHusk(scope)) return scope;
    if (scope.getAttribute('data-testid') === 'cellInnerDiv' && realTweetCards(scope).length === 0) {
      return scope;
    }
    const parent = scope.parentElement;
    scope = parent
      ? (parent.closest('[data-testid="tweet"]') ?? parent.closest('[data-testid="cellInnerDiv"]'))
      : null;
  }
  const fallback = node.closest('[data-testid="tweet"]') ?? node.closest('[data-testid="cellInnerDiv"]');
  return fallback instanceof HTMLElement ? fallback : null;
}

function hasOwnAuthor(article: HTMLElement): boolean {
  for (const node of article.querySelectorAll('[data-testid="User-Name"]')) {
    if (!(node instanceof HTMLElement)) continue;
    const owner = node.closest('[data-testid="tweet"]');
    if (owner === article) return true;
    if (!owner && article.getAttribute('data-testid') === 'cellInnerDiv') return true;
  }
  return false;
}

/** Inner [data-testid=tweet] wrappers around GIF/video — not a quoted post. Face-cam overlays sit inside the player and may carry User-Name. */
function isMediaHusk(el: HTMLElement): boolean {
  if (el.getAttribute('data-testid') !== 'tweet') return false;
  if (el.parentElement && el.closest(MEDIA_CHROME)) return true;
  return !hasOwnAuthor(el);
}

function cleanText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function usableText(value: string | null | undefined): boolean {
  const t = cleanText(value);
  return t.length >= MIN_TEXT && !SHOW_MORE_RE.test(t) && !PLAYER_OVERLAY_RE.test(t);
}

export function inMediaChrome(node: Element): boolean {
  if (node.closest(MEDIA_CHROME)) return true;
  // Walk out of video player shadow roots (linkedom has no ShadowRoot).
  let root: { host?: Element } = node.getRootNode() as { host?: Element };
  while (root.host instanceof Element) {
    if (root.host.matches(MEDIA_CHROME) || root.host.closest(MEDIA_CHROME)) return true;
    root = root.host.getRootNode() as { host?: Element };
  }
  return false;
}

function isDurationTime(el: HTMLElement): boolean {
  const dt = el.getAttribute('datetime') ?? '';
  if (/^PT/i.test(dt)) return true;
  return /^\d+:\d{2}(:\d{2})?$/.test(cleanText(el.textContent));
}

function syntheticId(handle: string, text: string): string {
  const who = handle.replace(/^@/, '') || 'anon';
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) | 0;
  return `x-${who}-${Math.abs(h)}`;
}

function nestedTweetCards(article: HTMLElement): HTMLElement[] {
  return queryDeep(article, '[data-testid="tweet"]').filter((node) => node !== article);
}

function realTweetCards(root: ParentNode): HTMLElement[] {
  return queryDeep(root, '[data-testid="tweet"]').filter((node) => !isMediaHusk(node));
}

function articlesFromCells(root: ParentNode): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const cell of queryDeep(root, '[data-testid="cellInnerDiv"]')) {
    const real = realTweetCards(cell);
    if (real.length > 0) {
      out.push(...real);
      if (hasOwnTweetBody(cell) && !real.includes(cell)) out.push(cell);
      continue;
    }
    if (
      queryDeep(cell, '[data-testid="tweetText"]').length > 0 ||
      queryDeep(cell, '[data-testid="User-Name"]').length > 0 ||
      langCaptionNodes(cell, true).length > 0
    ) {
      out.push(cell);
    }
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
