import { callJev } from '../lib/jev';
import {
  isJudgeTweetMessage,
  type ExtensionMessage,
  type JudgeResult,
  type SettingsResult,
} from '../lib/messages';
import { createLimiter } from '../lib/queue';
import { loadSettings } from '../lib/settings';
import type { Verdict } from '../lib/verdict';

const CACHE_KEY = 'slopGuard.cache.v2';
const CACHE_LIMIT = 400;
const limit = createLimiter(3);
const memory = new Map<string, Verdict>();
const inflight = new Map<string, Promise<JudgeResult>>();

export default defineBackground(() => {
  void hydrateCache();

  browser.runtime.onMessage.addListener((message: ExtensionMessage) => {
    if (message.type === 'PING') return Promise.resolve({ ok: true });
    if (message.type === 'GET_SETTINGS') {
      return loadSettings().then((settings): SettingsResult => ({ ok: true, settings }));
    }
    if (isJudgeTweetMessage(message)) {
      return judge(message.tweet);
    }
    return undefined;
  });
});

async function hydrateCache(): Promise<void> {
  const bag = await browser.storage.session.get(CACHE_KEY);
  const raw = bag[CACHE_KEY];
  if (!raw || typeof raw !== 'object') return;
  for (const [id, verdict] of Object.entries(raw as Record<string, Verdict>)) {
    if (verdict && typeof verdict.slopP === 'number') memory.set(id, verdict);
  }
}

async function persistCache(): Promise<void> {
  const dump: Record<string, Verdict> = {};
  for (const [id, verdict] of memory) dump[id] = verdict;
  await browser.storage.session.set({ [CACHE_KEY]: dump });
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
      return { ok: false, code: 'PAUSED', error: 'Slop Guard is paused.' };
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
