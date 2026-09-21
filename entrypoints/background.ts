import { callJev } from '../lib/jev';
import { chromeApi } from '../lib/chrome-msg';
import {
  isInjectLiMessage,
  isInjectXMessage,
  isJudgeTweetMessage,
  type ExtensionMessage,
  type InjectXResult,
  type JudgeResult,
  type SettingsResult,
} from '../lib/messages';
import { createLimiter } from '../lib/queue';
import { loadSettings } from '../lib/settings';
import type { Verdict } from '../lib/verdict';
import { ensureLinkedInFeed, watchLinkedInTabs } from '../lib/li-inject';
import { ensureXTimeline, watchXTabs } from '../lib/x-inject';

const CACHE_KEY = 'slopGuard.cache.v2';
const CACHE_LIMIT = 400;
const limit = createLimiter(3);
const memory = new Map<string, Verdict>();
const inflight = new Map<string, Promise<JudgeResult>>();

export default defineBackground(() => {
  void hydrateCache();
  watchXTabs();
  watchLinkedInTabs();

  chromeApi().runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const msg = message as ExtensionMessage;
    if (msg.type === 'PING') {
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === 'GET_SETTINGS') {
      loadSettings()
        .then((settings): SettingsResult => ({ ok: true, settings }))
        .then(sendResponse)
        .catch((err: unknown) => {
          sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
        });
      return true;
    }
    if (isJudgeTweetMessage(msg)) {
      judge(msg.tweet)
        .then(sendResponse)
        .catch((err: unknown) => {
          const error = err instanceof Error ? err.message : 'Jev request failed';
          sendResponse({ ok: false, code: 'JEV', error } satisfies JudgeResult);
        });
      return true;
    }
    if (isInjectXMessage(msg)) {
      ensureXTimeline(msg.tabId)
        .then((result) => {
          const reply: InjectXResult = result.ok ? { ok: true } : { ok: false, error: result.error };
          sendResponse(reply);
        })
        .catch((err: unknown) => {
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          } satisfies InjectXResult);
        });
      return true;
    }
    if (isInjectLiMessage(msg)) {
      ensureLinkedInFeed(msg.tabId)
        .then((result) => {
          const reply: InjectXResult = result.ok ? { ok: true } : { ok: false, error: result.error };
          sendResponse(reply);
        })
        .catch((err: unknown) => {
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          } satisfies InjectXResult);
        });
      return true;
    }
    return undefined;
  });
});

async function hydrateCache(): Promise<void> {
  const bag = await chromeApi().storage.session.get(CACHE_KEY);
  const raw = bag[CACHE_KEY];
  if (!raw || typeof raw !== 'object') return;
  for (const [id, verdict] of Object.entries(raw as Record<string, Verdict>)) {
    if (verdict && typeof verdict.slopP === 'number') memory.set(id, verdict);
  }
}

async function persistCache(): Promise<void> {
  const dump: Record<string, Verdict> = {};
  for (const [id, verdict] of memory) dump[id] = verdict;
  await chromeApi().storage.session.set({ [CACHE_KEY]: dump });
}

function remember(verdict: Verdict): void {
  memory.set(verdict.tweetId, verdict);
  if (memory.size <= CACHE_LIMIT) {
    void persistCache();
    return;
  }
  const extra = memory.size - CACHE_LIMIT;
  const keys = memory.keys();
  for (let i = 0; i < extra; i += 1) {
    const key = keys.next().value;
    if (typeof key === 'string') memory.delete(key);
  }
  void persistCache();
}

async function judge(tweet: { id: string; text: string; handle: string }): Promise<JudgeResult> {
  const cached = memory.get(tweet.id);
  if (cached) return { ok: true, verdict: cached };

  const existing = inflight.get(tweet.id);
  if (existing) return existing;

  const job = limit(async (): Promise<JudgeResult> => {
    const again = memory.get(tweet.id);
    if (again) return { ok: true, verdict: again };

    const settings = await loadSettings();
    if (settings.paused) {
      return { ok: false, code: 'PAUSED', error: 'Jev Slop Guard is paused.' };
    }
    if (!settings.apiKey.trim()) {
      return {
        ok: false,
        code: 'NO_KEY',
        error: 'Add a TypeSafe API key in the extension popup.',
      };
    }

    try {
      const verdict = await callJev(tweet, settings);
      remember(verdict);
      return { ok: true, verdict };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Jev request failed';
      const code = message.includes('timed out') || message.includes('fetch') ? 'NETWORK' : 'JEV';
      return { ok: false, code, error: message };
    }
  });

  inflight.set(tweet.id, job);
  try {
    return await job;
  } finally {
    inflight.delete(tweet.id);
  }
}
