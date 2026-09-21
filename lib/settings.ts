export type Provider = 'typesafe' | 'openrouter';

export type Settings = {
  apiKey: string;
  provider: Provider;
  paused: boolean;
  stampEnabled: boolean;
  showNotSlop: boolean;
  threshold: number;
  model: string;
};

export const SETTINGS_KEY = 'slopGuard.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  provider: 'typesafe',
  paused: false,
  stampEnabled: true,
  showNotSlop: true,
  threshold: 0.7,
  model: 'jev-latest',
};

export function mergeSettings(raw: unknown): Settings {
  const src = raw && typeof raw === 'object' ? (raw as Partial<Settings> & { noulThreshold?: number }) : {};
  const fromLegacy = typeof src.noulThreshold === 'number' ? src.noulThreshold : undefined;
  const thresholdRaw =
    typeof src.threshold === 'number' && Number.isFinite(src.threshold)
      ? src.threshold
      : (fromLegacy ?? DEFAULT_SETTINGS.threshold);
  return {
    apiKey: typeof src.apiKey === 'string' ? src.apiKey : DEFAULT_SETTINGS.apiKey,
    provider: src.provider === 'openrouter' ? 'openrouter' : 'typesafe',
    paused: src.paused === true,
    stampEnabled: src.stampEnabled !== false,
    showNotSlop: src.showNotSlop !== false,
    threshold: Math.min(0.99, Math.max(0.4, thresholdRaw)),
    model: src.model === 'jev-1.13.0' ? 'jev-1.13.0' : 'jev-latest',
  };
}

export async function loadSettings(): Promise<Settings> {
  const bag = await browser.storage.local.get(SETTINGS_KEY);
  return mergeSettings(bag[SETTINGS_KEY]);
}

export async function saveSettings(next: Settings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_KEY]: mergeSettings(next) });
}
