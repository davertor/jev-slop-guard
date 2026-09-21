import { chromeApi, isXUrl, sendTabMessage } from './chrome-msg';
import type { XStatusResult } from './messages';

const X_JS = 'content-scripts/x-timeline.js';
const X_CSS = 'content-scripts/x-timeline.css';
const X_QUERY = ['https://x.com/*', 'https://www.x.com/*', 'https://twitter.com/*', 'https://www.twitter.com/*'];

export async function pingXStatus(tabId: number): Promise<XStatusResult | null> {
  try {
    const result = await sendTabMessage<XStatusResult>(tabId, { type: 'X_STATUS' });
    return result?.ok && result.live ? result : null;
  } catch {
    return null;
  }
}

export async function injectXTimeline(tabId: number): Promise<void> {
  const api = chromeApi();
  try {
    await api.scripting.insertCSS({ target: { tabId }, files: [X_CSS] });
  } catch {
    // Already present or CSS insert not allowed; JS still needed.
  }
  await api.scripting.executeScript({ target: { tabId }, files: [X_JS] });
}

/** Ping the content script; inject the bundled X file if the tab has no receiver. */
export async function ensureXTimeline(tabId: number): Promise<XStatusResult | { ok: false; error: string }> {
  const existing = await pingXStatus(tabId);
  if (existing) return existing;
  try {
    await injectXTimeline(tabId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const again = await pingXStatus(tabId);
  return again ?? { ok: false, error: 'Injected, but X script did not answer.' };
}

export async function injectAllXTabs(): Promise<void> {
  const tabs = await chromeApi().tabs.query({ url: X_QUERY });
  for (const tab of tabs) {
    if (typeof tab.id === 'number' && isXUrl(tab.url)) void ensureXTimeline(tab.id);
  }
}

export function watchXTabs(): void {
  const api = chromeApi();
  api.tabs.onUpdated.addListener((tabId, info, tab) => {
    if (info.status !== 'complete') return;
    if (!isXUrl(tab.url)) return;
    void ensureXTimeline(tabId);
  });
  api.runtime.onInstalled.addListener(() => {
    void injectAllXTabs();
  });
  api.runtime.onStartup.addListener(() => {
    void injectAllXTabs();
  });
}
