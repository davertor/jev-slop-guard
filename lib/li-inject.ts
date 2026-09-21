import { chromeApi, isLinkedInUrl, sendTabMessage } from './chrome-msg';
import type { LiStatusResult } from './messages';

const LI_JS = 'content-scripts/linkedin-feed.js';
const LI_CSS = 'content-scripts/linkedin-feed.css';
const LI_QUERY = ['https://www.linkedin.com/*', 'https://linkedin.com/*'];

export async function pingLiStatus(tabId: number): Promise<LiStatusResult | null> {
  try {
    const result = await sendTabMessage<LiStatusResult>(tabId, { type: 'LI_STATUS' });
    return result?.ok && result.live ? result : null;
  } catch {
    return null;
  }
}

export async function injectLinkedInFeed(tabId: number): Promise<void> {
  const api = chromeApi();
  try {
    await api.scripting.insertCSS({ target: { tabId }, files: [LI_CSS] });
  } catch {
    // already present
  }
  await api.scripting.executeScript({ target: { tabId }, files: [LI_JS] });
}

export async function ensureLinkedInFeed(
  tabId: number,
): Promise<LiStatusResult | { ok: false; error: string }> {
  const existing = await pingLiStatus(tabId);
  if (existing) return existing;
  try {
    await injectLinkedInFeed(tabId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const again = await pingLiStatus(tabId);
  return again ?? { ok: false, error: 'Injected, but LinkedIn script did not answer.' };
}

export async function injectAllLinkedInTabs(): Promise<void> {
  const tabs = await chromeApi().tabs.query({ url: LI_QUERY });
  for (const tab of tabs) {
    if (typeof tab.id === 'number' && isLinkedInUrl(tab.url)) void ensureLinkedInFeed(tab.id);
  }
}

export function watchLinkedInTabs(): void {
  const api = chromeApi();
  api.tabs.onUpdated.addListener((tabId, info, tab) => {
    if (info.status !== 'complete') return;
    if (!isLinkedInUrl(tab.url)) return;
    void ensureLinkedInFeed(tabId);
  });
  api.runtime.onInstalled.addListener(() => {
    void injectAllLinkedInTabs();
  });
  api.runtime.onStartup.addListener(() => {
    void injectAllLinkedInTabs();
  });
}
