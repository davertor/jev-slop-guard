import { applyVerdict, clearStamp, markError, markPending, reapplyFromDataset } from './badge';
import type { JudgeResult } from './messages';
import { debounce } from './queue';
import { DEFAULT_SETTINGS, loadSettings, SETTINGS_KEY, type Settings } from './settings';

export type FeedItem = {
  id: string;
  text: string;
  handle: string;
  article: HTMLElement;
};

export type FeedAdapter = {
  listArticles: (root?: ParentNode) => HTMLElement[];
  extract: (article: HTMLElement) => FeedItem | null;
  undoKey: string;
  missingKeyMessage?: string;
};

const PENDING_MS = 12_000;

export function runTimelineGuard(
  ctx: { isInvalid: boolean; onInvalidated: (cb: () => void) => void },
  adapter: FeedAdapter,
): void {
  let settings: Settings = DEFAULT_SETTINGS;
  const missingKeyState = { shown: false };
  const undoneIds = new Set<string>();
  const observedArticles = new WeakSet<HTMLElement>();
  const inFlightArticles = new WeakSet<HTMLElement>();

  const slopFeed = {
    reset(article: HTMLElement): void {
      article.removeAttribute('data-slop-guard');
      delete article.dataset.slopId;
      delete article.dataset.slopPendingAt;
      article.querySelector('.slop-guard-row')?.remove();
      clearStamp(article);
    },

    shouldJudge(article: HTMLElement): boolean {
      if (settings.paused) return false;
      if (inFlightArticles.has(article)) return false;
      if (article.getAttribute('data-slop-guard')) return false;
      return Boolean(adapter.extract(article));
    },

    reconcile(article: HTMLElement): void {
      const state = article.getAttribute('data-slop-guard');
      if (!state) return;
      const item = adapter.extract(article);
      if (!item) return;
      if (article.dataset.slopId && article.dataset.slopId !== item.id) {
        slopFeed.reset(article);
        return;
      }
      if (state === 'pending') {
        const started = Number(article.dataset.slopPendingAt ?? 0);
        if (started && Date.now() - started > PENDING_MS && !inFlightArticles.has(article)) {
          slopFeed.reset(article);
        }
      }
    },

    putBack(id: string, article: HTMLElement): void {
      undoneIds.add(id);
      void browser.storage.session.set({ [adapter.undoKey]: [...undoneIds] });
      clearStamp(article);
    },

    async judge(article: HTMLElement): Promise<void> {
      slopFeed.reconcile(article);
      if (!slopFeed.shouldJudge(article)) return;
      const item = adapter.extract(article);
      if (!item) return;

      inFlightArticles.add(article);
      article.dataset.slopId = item.id;
      article.dataset.slopPendingAt = String(Date.now());
      markPending(article);

      try {
        const result = (await browser.runtime.sendMessage({
          type: 'JUDGE_TWEET',
          tweet: { id: item.id, text: item.text, handle: item.handle },
        })) as JudgeResult | undefined;

        if (ctx.isInvalid) return;

        const current = adapter.extract(article);
        if (!current || current.id !== item.id) {
          slopFeed.reset(article);
          return;
        }

        if (!result) {
          slopFeed.reset(article);
          return;
        }

        if (result.ok) {
          applyVerdict(article, result.verdict, settings, {
            undone: undoneIds.has(item.id),
            onPutBack: slopFeed.putBack,
          });
          delete article.dataset.slopPendingAt;
          showModelBar(result.verdict.model);
          return;
        }

        if (result.code === 'NO_KEY') {
          markError(article, 'set API key');
          showMissingKeyBanner(missingKeyState, adapter.missingKeyMessage);
          return;
        }

        if (result.code === 'PAUSED') {
          slopFeed.reset(article);
          return;
        }

        markError(article, 'jev error');
        const badge = article.querySelector('.slop-guard-badge');
        if (badge instanceof HTMLElement) badge.title = result.error;
      } catch (err) {
        if (ctx.isInvalid) return;
        slopFeed.reset(article);
        markError(article, 'retry');
        const badge = article.querySelector('.slop-guard-badge');
        if (badge instanceof HTMLElement) {
          badge.title = err instanceof Error ? err.message : 'Message failed';
        }
        window.setTimeout(() => {
          if (article.getAttribute('data-slop-guard') === 'error') {
            article.removeAttribute('data-slop-guard');
            article.querySelector('.slop-guard-row')?.remove();
          }
        }, 2500);
      } finally {
        inFlightArticles.delete(article);
      }
    },

    scan(): void {
      for (const article of adapter.listArticles()) {
        slopFeed.reconcile(article);
        if (!observedArticles.has(article)) {
          observedArticles.add(article);
          intersectionObserver.observe(article);
        }
        if (slopFeed.shouldJudge(article) && isInViewport(article)) {
          void slopFeed.judge(article);
        }
      }
    },
  };

  const scheduleScan = debounce(() => slopFeed.scan(), 120);

  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) continue;
        void slopFeed.judge(entry.target);
      }
    },
    { root: null, threshold: 0.05, rootMargin: '220px 0px' },
  );

  const mutationObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const target = mutation.target;
      if (
        target instanceof Element &&
        target.closest?.(
          '.slop-guard-row, .slop-guard-overlay, .slop-guard-modelbar, .slop-guard-banner, .slop-guard-liprobe',
        )
      ) {
        continue;
      }
      scheduleScan();
      return;
    }
  });
  mutationObserver.observe(document.documentElement, { childList: true, subtree: true });

  const sweepTimer = window.setInterval(() => slopFeed.scan(), 2000);
  ctx.onInvalidated(() => {
    mutationObserver.disconnect();
    intersectionObserver.disconnect();
    window.clearInterval(sweepTimer);
  });

  void Promise.all([loadSettings(), loadUndoneIds(adapter.undoKey)]).then(([loaded, ids]) => {
    settings = loaded;
    for (const id of ids) undoneIds.add(id);
    slopFeed.scan();
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[SETTINGS_KEY]) return;
    void loadSettings().then((loaded) => {
      settings = loaded;
      for (const article of adapter.listArticles()) {
        if (article.getAttribute('data-slop-guard') === 'error' && loaded.apiKey.trim()) {
          slopFeed.reset(article);
          if (isInViewport(article)) void slopFeed.judge(article);
          continue;
        }
        reapplyFromDataset(article, settings, {
          undone: undoneIds.has(article.dataset.slopId ?? ''),
          onPutBack: slopFeed.putBack,
        });
      }
      document.querySelector('.slop-guard-banner')?.remove();
      if (!settings.paused) slopFeed.scan();
    });
  });
}

async function loadUndoneIds(key: string): Promise<string[]> {
  const bag = await browser.storage.session.get(key);
  return Array.isArray(bag[key]) ? bag[key].filter((id): id is string => typeof id === 'string') : [];
}

function isInViewport(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < window.innerHeight + 220;
}

function showModelBar(model: string): void {
  let bar = document.querySelector<HTMLElement>('.slop-guard-modelbar');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'slop-guard-modelbar';
    document.body.append(bar);
  }
  bar.textContent = model.replace(/^jev/i, 'Jev');
}

function showMissingKeyBanner(state: { shown: boolean }, message?: string): void {
  if (state.shown) return;
  state.shown = true;
  if (document.querySelector('.slop-guard-banner')) return;
  const banner = document.createElement('div');
  banner.className = 'slop-guard-banner';
  banner.textContent =
    message ?? 'Slop Guard: add your TypeSafe or OpenRouter API key in the extension popup.';
  document.body.append(banner);
}
