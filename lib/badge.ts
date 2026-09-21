import type { Settings } from './settings';
import { belongsToArticle, findActionBar, findTweetTextEl, inMediaChrome, queryDeep } from './tweet';
import { badgeCopy, shouldStamp, type Verdict } from './verdict';

export const BADGE_ATTR = 'data-slop-guard';
export const BADGE_CLASS = 'slop-guard-badge';
export const ROW_CLASS = 'slop-guard-row';
export const OVERLAY_CLASS = 'slop-guard-overlay';

export function markPending(article: HTMLElement): void {
  article.setAttribute(BADGE_ATTR, 'pending');
}

export function markError(article: HTMLElement, message: string): void {
  article.setAttribute(BADGE_ATTR, 'error');
  upsertBadge(article, message, 'error', false);
  clearStamp(article);
}

export function applyVerdict(
  article: HTMLElement,
  verdict: Verdict,
  settings: Settings,
  opts: { undone?: boolean; onPutBack?: (id: string, article: HTMLElement) => void } = {},
): void {
  article.setAttribute(BADGE_ATTR, 'done');
  article.dataset.slopP = String(verdict.slopP);
  article.dataset.slopNotP = String(verdict.notP);
  article.dataset.slopLabel = verdict.label;
  article.dataset.slopModel = verdict.model;
  article.classList.add('slop-guard-card');

  const copy = badgeCopy(verdict, settings.threshold);
  if (copy.tone === 'ok' && !settings.showNotSlop) {
    clearBadge(article);
  } else {
    upsertBadge(article, copy.text, copy.tone, copy.tone === 'stop');
  }

  if (shouldStamp(verdict, settings.threshold, settings.stampEnabled) && !opts.undone) {
    stampArticle(article, () => opts.onPutBack?.(verdict.tweetId, article));
  } else {
    clearStamp(article);
  }
}

export function reapplyFromDataset(
  article: HTMLElement,
  settings: Settings,
  opts: { undone?: boolean; onPutBack?: (id: string, article: HTMLElement) => void } = {},
): void {
  if (article.getAttribute(BADGE_ATTR) !== 'done') return;
  const slopP = Number(article.dataset.slopP);
  const notP = Number(article.dataset.slopNotP);
  if (!Number.isFinite(slopP) || !Number.isFinite(notP)) return;
  applyVerdict(
    article,
    {
      tweetId: article.dataset.slopId ?? '',
      label: article.dataset.slopLabel === 'slop' ? 'slop' : 'not_slop',
      slopP,
      notP,
      model: article.dataset.slopModel ?? 'jev-latest',
    },
    settings,
    opts,
  );
}

export function ownSlopRow(article: HTMLElement): HTMLElement | null {
  // X: row must belong to this tweet article. LinkedIn: no data-testid=tweet —
  // belongsToArticle is always false there, which used to create a new row every
  // reconcile and stack badges under one post.
  for (const row of article.querySelectorAll(`.${ROW_CLASS}`)) {
    if (!(row instanceof HTMLElement)) continue;
    if (belongsToArticle(row, article)) return row;
    const nestedOwner = row.parentElement?.closest('[data-slop-guard]');
    if (nestedOwner && nestedOwner !== article) continue;
    if (article.contains(row) && !row.closest('[data-testid="tweet"]')) return row;
  }
  return null;
}

function ownOverlay(article: HTMLElement): HTMLElement | null {
  for (const overlay of article.querySelectorAll(`.${OVERLAY_CLASS}`)) {
    if (overlay instanceof HTMLElement && belongsToArticle(overlay, article)) return overlay;
  }
  return null;
}

function isLinkedInHost(): boolean {
  try {
    return /(^|\.)linkedin\.com$/i.test(location.hostname);
  } catch {
    return false;
  }
}

function isLinkedInCard(article: HTMLElement): boolean {
  // Content script runs on linkedin.com — always treat cards as LI even when
  // LinkedIn drops data-urn / feed-shared-update-v2 on newer FeedType rows.
  if (isLinkedInHost()) return true;
  const ck = article.getAttribute('componentkey') ?? '';
  return (
    article.hasAttribute('data-urn') ||
    article.hasAttribute('data-id') ||
    article.classList.contains('feed-shared-update-v2') ||
    article.classList.contains('occludable-update') ||
    /FeedType_/i.test(ck) ||
    article.hasAttribute('data-finite-scroll-hotkey-item') ||
    !!article.querySelector(
      '.social-details-social-activity, .feed-shared-social-action-bar, .update-v2-social-activity, button[aria-label*="Recomendar"], button[aria-label*="Like"]',
    )
  );
}

/** Keep LinkedIn badge pinned at the visual top-left of the card. */
export function placeLinkedInBadge(article: HTMLElement, row: HTMLElement): void {
  // Inline styles beat LinkedIn's feed CSS and work when class selectors miss.
  if (article.style.position !== 'absolute' && article.style.position !== 'fixed') {
    article.style.position = 'relative';
  }
  row.style.setProperty('position', 'absolute', 'important');
  row.style.setProperty('top', '8px', 'important');
  row.style.setProperty('left', '12px', 'important');
  row.style.setProperty('right', 'auto', 'important');
  row.style.setProperty('bottom', 'auto', 'important');
  row.style.setProperty('z-index', '2147483000', 'important');
  row.style.setProperty('margin', '0', 'important');
  row.style.setProperty('padding', '0', 'important');
  row.style.setProperty('display', 'flex', 'important');
  row.style.setProperty('pointer-events', 'none', 'important');
  if (article.firstElementChild !== row) article.prepend(row);
  row.dataset.slopLiPlacement = 'top';
}

function insertBadgeRow(article: HTMLElement, row: HTMLElement): void {
  const place = (target: Element | null, where: InsertPosition): boolean => {
    if (!target) return false;
    target.insertAdjacentElement(where, row);
    if (!inMediaChrome(row)) return true;
    row.remove();
    return false;
  };

  // LinkedIn first: never fall through to X anchors or append (looks like bottom-of-post).
  if (isLinkedInCard(article)) {
    placeLinkedInBadge(article, row);
    if (!inMediaChrome(row)) return;
    row.remove();
  }

  const tweetText = findTweetTextEl(article);
  if (tweetText && belongsToArticle(tweetText, article) && !inMediaChrome(tweetText) && place(tweetText, 'afterend')) {
    return;
  }
  if (place(findActionBar(article), 'beforebegin')) return;
  const nested = queryDeep(article, '[data-testid="tweet"]').find(
    (node) => node !== article && !inMediaChrome(node),
  );
  if (place(nested ?? null, 'afterend')) return;
  const media = article.querySelector(
    '[data-testid="tweetPhoto"], [data-testid="videoPlayer"], [data-testid="videoComponent"], [data-testid="previewInterstitial"], [data-testid="card.wrapper"]',
  );
  if (place(media, 'beforebegin')) return;

  article.append(row);
}

function upsertBadge(article: HTMLElement, text: string, tone: string, dot: boolean): void {
  let row = ownSlopRow(article);
  if (!row) {
    row = document.createElement('div');
    row.className = ROW_CLASS;
    insertBadgeRow(article, row);
  } else if (isLinkedInCard(article)) {
    // Re-home leftover rows from older builds that sat under the action bar.
    placeLinkedInBadge(article, row);
  }
  let badge = row.querySelector<HTMLElement>(`.${BADGE_CLASS}`);
  if (!badge) {
    badge = document.createElement('span');
    badge.className = BADGE_CLASS;
    row.append(badge);
  }
  badge.dataset.tone = tone;
  badge.replaceChildren();
  if (tone === 'ok') {
    const check = document.createElement('span');
    check.className = 'slop-guard-check';
    check.textContent = '✓';
    badge.append(check);
  } else if (dot) {
    const mark = document.createElement('span');
    mark.className = 'slop-guard-dot';
    badge.append(mark);
  }
  badge.append(document.createTextNode(text));
  const preview = article.dataset.slopTextPreview?.trim();
  badge.title = preview ? `${text}\n——\n${preview}` : text;
  const badgeEl = row.querySelector<HTMLElement>(`.${BADGE_CLASS}`);
  if (badgeEl) badgeEl.style.pointerEvents = 'auto';
}

function stampArticle(article: HTMLElement, onPutBack: () => void): void {
  article.classList.add('slop-guard-stamped');
  let overlay = ownOverlay(article);
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = OVERLAY_CLASS;
    const stamp = document.createElement('div');
    stamp.className = 'slop-guard-stamp';
    stamp.textContent = 'SLOP';
    const putBack = document.createElement('button');
    putBack.type = 'button';
    putBack.className = 'slop-guard-putback';
    putBack.textContent = 'Show the post';
    overlay.append(stamp, putBack);
    article.append(overlay);
  }
  const button = overlay.querySelector('.slop-guard-putback');
  if (button instanceof HTMLButtonElement) {
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      onPutBack();
    };
  }
}

export function clearBadge(article: HTMLElement): void {
  ownSlopRow(article)?.remove();
}

export function clearStamp(article: HTMLElement): void {
  article.classList.remove('slop-guard-stamped');
  ownOverlay(article)?.remove();
}
