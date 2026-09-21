/** Chrome-native sendMessage (callback + lastError). Promise wrappers can hang across SW/content. */

type ChromeLastError = { message: string };

type ChromeTab = { id?: number; url?: string };

type ChromeLike = {
  runtime: {
    sendMessage: (message: unknown, responseCallback: (response: unknown) => void) => void;
    lastError?: ChromeLastError;
    onMessage: {
      addListener: (
        callback: (
          message: unknown,
          sender: unknown,
          sendResponse: (response?: unknown) => void,
        ) => boolean | void,
      ) => void;
    };
    onInstalled: { addListener: (callback: () => void) => void };
    onStartup: { addListener: (callback: () => void) => void };
  };
  tabs: {
    sendMessage: (
      tabId: number,
      message: unknown,
      responseCallback: (response: unknown) => void,
    ) => void;
    query: (queryInfo: {
      active?: boolean;
      currentWindow?: boolean;
      url?: string | string[];
    }) => Promise<ChromeTab[]>;
    onUpdated: {
      addListener: (
        callback: (tabId: number, info: { status?: string; url?: string }, tab: ChromeTab) => void,
      ) => void;
    };
  };
  scripting: {
    insertCSS: (injection: { target: { tabId: number }; files: string[] }) => Promise<unknown>;
    executeScript: (injection: { target: { tabId: number }; files: string[] }) => Promise<unknown>;
  };
  storage: {
    session: {
      get: (key: string) => Promise<Record<string, unknown>>;
      set: (items: Record<string, unknown>) => Promise<void>;
    };
    onChanged: {
      addListener: (
        callback: (changes: Record<string, { newValue?: unknown }>, area: string) => void,
      ) => void;
    };
  };
};

export function chromeApi(): ChromeLike {
  const root = globalThis as { chrome?: ChromeLike; browser?: ChromeLike };
  const api = root.chrome?.runtime ? root.chrome : root.browser;
  if (!api?.runtime) throw new Error('chrome extension API unavailable');
  return api;
}

export function isXUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'https:') return false;
    return (
      hostname === 'x.com' ||
      hostname === 'www.x.com' ||
      hostname === 'twitter.com' ||
      hostname === 'www.twitter.com'
    );
  } catch {
    return false;
  }
}

export function sendRuntimeMessage<T>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const api = chromeApi();
    api.runtime.sendMessage(message, (response) => {
      const err = api.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(response as T);
    });
  });
}

export function sendTabMessage<T>(tabId: number, message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const api = chromeApi();
    api.tabs.sendMessage(tabId, message, (response) => {
      const err = api.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(response as T);
    });
  });
}
