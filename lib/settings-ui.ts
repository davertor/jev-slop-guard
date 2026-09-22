import { chromeApi, isLinkedInUrl, isXUrl, sendRuntimeMessage, sendTabMessage } from './chrome-msg';
import type { InjectXResult, JudgeResult, XStatusResult } from './messages';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from './settings';

export const SETTINGS_FORM_HTML = `
  <header>
    <div>
      <p class="eyebrow">Jev Slop Guard</p>
      <h1>Real-time slop detector</h1>
    </div>
    <button id="pause-toggle" type="button" class="pause-toggle">Pause</button>
  </header>

  <p id="x-script-status" class="x-live" hidden></p>

  <p id="key-warning" class="banner" hidden>No API key yet. Posts stay clean until you save one.</p>

  <label class="field">
    <span id="apiKey-label">API key (BYOK → chrome.storage.local)</span>
    <input id="apiKey" type="password" autocomplete="off" placeholder="sk-… TypeSafe or OpenRouter" />
    <span id="apiKey-hint" class="hint">TypeSafe: console.typesafe.ai · OpenRouter: same OPENROUTER_API_KEY as other Jev tools (enable TypeSafe in OpenRouter Privacy).</span>
  </label>

  <label class="field">
    <span>Slop threshold <strong id="threshold-readout">70%</strong></span>
    <input id="threshold" type="range" min="0.40" max="0.95" step="0.01" />
  </label>

  <label class="switch wide">
    <input id="stampEnabled" type="checkbox" />
    <span>Blur + SLOP stamp when over threshold</span>
  </label>

  <label class="switch wide">
    <input id="showNotSlop" type="checkbox" />
    <span>Show badge when under threshold</span>
  </label>

  <div class="row">
    <label class="field">
      <span>Provider</span>
      <select id="provider">
        <option value="typesafe">TypeSafe Jev</option>
        <option value="openrouter">OpenRouter (OPENROUTER_API_KEY)</option>
      </select>
    </label>
    <label class="field">
      <span>Model</span>
      <select id="model">
        <option value="jev-latest">jev-latest</option>
        <option value="jev-1.13.0">jev-1.13.0</option>
      </select>
    </label>
  </div>

  <div class="actions">
    <button id="save" type="button">Save</button>
    <p id="status" class="status" role="status"></p>
  </div>

  <section class="try">
    <h2>Try a tweet</h2>
    <textarea id="sample" rows="4" placeholder="Paste tweet text. Same Choice {not_slop, slop} path as the timeline."></textarea>
    <input id="sample-handle" type="text" placeholder="@handle (optional)" />
    <button id="judge" type="button">Judge with Jev</button>
    <pre id="sample-out" class="out" hidden></pre>
  </section>
`;

export async function mountSettingsPage(root: HTMLElement): Promise<void> {
  root.innerHTML = SETTINGS_FORM_HTML;
  const settings = await loadSettings();
  bind(root, settings);
}

function bind(root: HTMLElement, initial: Settings): void {
  const apiKey = must<HTMLInputElement>(root, '#apiKey');
  const provider = must<HTMLSelectElement>(root, '#provider');
  const model = must<HTMLSelectElement>(root, '#model');
  const pauseToggle = must<HTMLButtonElement>(root, '#pause-toggle');
  const stampEnabled = must<HTMLInputElement>(root, '#stampEnabled');
  const showNotSlop = must<HTMLInputElement>(root, '#showNotSlop');
  const threshold = must<HTMLInputElement>(root, '#threshold');
  const thresholdReadout = must(root, '#threshold-readout');
  const warning = must(root, '#key-warning');
  const status = must(root, '#status');
  const sample = must<HTMLTextAreaElement>(root, '#sample');
  const sampleHandle = must<HTMLInputElement>(root, '#sample-handle');
  const sampleOut = must<HTMLPreElement>(root, '#sample-out');
  const xStatusEl = must(root, '#x-script-status');

  const apiKeyLabel = must(root, '#apiKey-label');
  const apiKeyHint = must(root, '#apiKey-hint');

  let paused = initial.paused;

  const paintPause = (): void => {
    pauseToggle.dataset.paused = paused ? 'true' : 'false';
    pauseToggle.textContent = paused ? 'Start' : 'Pause';
  };

  // "X script live" means the feed script is judging. Paused it is attached but idle,
  // so hide it rather than let it read as running. Re-check after the async paint in
  // case the toggle flipped while the ping was in flight.
  const refreshStatus = (): void => {
    if (paused) {
      xStatusEl.hidden = true;
      return;
    }
    void refreshXStatus(xStatusEl).then(() => {
      if (paused) xStatusEl.hidden = true;
    });
  };

  const syncKeyCopy = (prov: Settings['provider']): void => {
    if (prov === 'openrouter') {
      apiKeyLabel.textContent = 'OpenRouter API key (BYOK → chrome.storage.local)';
      apiKey.placeholder = 'OPENROUTER_API_KEY (sk-or-…)';
      apiKeyHint.textContent =
        'Paste your OpenRouter key. Decisions endpoint needs TypeSafe allowed in OpenRouter Settings → Privacy.';
    } else {
      apiKeyLabel.textContent = 'TypeSafe API key (BYOK → chrome.storage.local)';
      apiKey.placeholder = 'TypeSafe Jev key (console.typesafe.ai)';
      apiKeyHint.textContent =
        'Or switch Provider to OpenRouter and paste OPENROUTER_API_KEY instead.';
    }
  };

  const paint = (s: Settings): void => {
    apiKey.value = s.apiKey;
    provider.value = s.provider;
    model.value = s.model;
    paused = s.paused;
    paintPause();
    stampEnabled.checked = s.stampEnabled;
    showNotSlop.checked = s.showNotSlop;
    threshold.value = String(s.threshold);
    thresholdReadout.textContent = `${Math.round(s.threshold * 100)}%`;
    warning.hidden = Boolean(s.apiKey.trim());
    syncKeyCopy(s.provider);
  };

  paint(initial);

  provider.addEventListener('change', () => {
    syncKeyCopy(provider.value === 'openrouter' ? 'openrouter' : 'typesafe');
  });

  threshold.addEventListener('input', () => {
    thresholdReadout.textContent = `${Math.round(Number(threshold.value) * 100)}%`;
  });

  const read = (): Settings => ({
    ...DEFAULT_SETTINGS,
    apiKey: apiKey.value.trim(),
    provider: provider.value === 'openrouter' ? 'openrouter' : 'typesafe',
    paused,
    stampEnabled: stampEnabled.checked,
    showNotSlop: showNotSlop.checked,
    threshold: Number(threshold.value),
    model: model.value === 'jev-1.13.0' ? 'jev-1.13.0' : 'jev-latest',
  });

  must(root, '#save').addEventListener('click', () => {
    void saveSettings(read()).then(() => {
      warning.hidden = Boolean(apiKey.value.trim());
      status.textContent = 'Saved.';
    });
  });

  pauseToggle.addEventListener('click', () => {
    paused = !paused;
    paintPause();
    refreshStatus();
    void saveSettings(read()).then(() => {
      status.textContent = paused ? 'Paused.' : 'Running.';
    });
  });

  stampEnabled.addEventListener('change', () => {
    void saveSettings(read());
  });

  showNotSlop.addEventListener('change', () => {
    void saveSettings(read());
  });

  must(root, '#judge').addEventListener('click', () => {
    const text = sample.value.trim();
    if (!text) {
      sampleOut.hidden = false;
      sampleOut.textContent = 'Paste tweet text first.';
      return;
    }
    sampleOut.hidden = false;
    sampleOut.textContent = 'Calling Jev…';
    void sendRuntimeMessage<JudgeResult>({
      type: 'JUDGE_TWEET',
      tweet: {
        id: `sample-${hash(text)}`,
        text,
        handle: sampleHandle.value.trim(),
      },
    })
      .then((result) => {
        sampleOut.textContent = JSON.stringify(result, null, 2);
      })
      .catch((err: unknown) => {
        sampleOut.textContent = err instanceof Error ? err.message : 'Message failed';
      });
  });

  refreshStatus();
}

function must<T extends HTMLElement = HTMLElement>(root: HTMLElement, sel: string): T {
  const node = root.querySelector<T>(sel);
  if (!node) throw new Error(`Missing ${sel}`);
  return node;
}

function hash(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) | 0;
  return String(Math.abs(h));
}

function paintXStatus(
  el: HTMLElement,
  state: 'live' | 'missing' | 'idle',
  text: string,
): void {
  el.hidden = false;
  el.dataset.state = state;
  el.textContent = text;
}

async function refreshXStatus(el: HTMLElement): Promise<void> {
  let tabs: Array<{ id?: number; url?: string }>;
  try {
    tabs = await chromeApi().tabs.query({ active: true, currentWindow: true });
  } catch {
    return;
  }
  const [tab] = tabs;
  if (!tab?.id) {
    paintXStatus(el, 'idle', 'Open x.com or linkedin.com to attach the feed script.');
    return;
  }

  const tabId = tab.id;
  if (isLinkedInUrl(tab.url)) {
    const pingLi = async () => {
      try {
        const result = await sendTabMessage<{ ok?: boolean; live?: boolean; cards?: number; ready?: number }>(
          tabId,
          { type: 'LI_STATUS' },
        );
        return result?.ok && result.live ? result : null;
      } catch {
        return null;
      }
    };
    let status = await pingLi();
    if (!status) {
      try {
        await sendRuntimeMessage<InjectXResult>({ type: 'INJECT_LI', tabId });
      } catch {
        // ignore
      }
      status = await pingLi();
    }
    if (status) {
      paintXStatus(
        el,
        'live',
        `LI script live · ${status.cards ?? 0} cards · ${status.ready ?? 0} ready`,
      );
      return;
    }
    paintXStatus(el, 'missing', 'LI script missing — Reload the extension, then reload LinkedIn.');
    return;
  }

  if (!isXUrl(tab.url)) {
    paintXStatus(el, 'idle', 'Open x.com or linkedin.com to attach the feed script.');
    return;
  }

  const ping = async (): Promise<XStatusResult | null> => {
    try {
      const result = await sendTabMessage<XStatusResult>(tabId, { type: 'X_STATUS' });
      return result?.ok && result.live ? result : null;
    } catch {
      return null;
    }
  };

  let status = await ping();
  if (!status) {
    try {
      await sendRuntimeMessage<InjectXResult>({ type: 'INJECT_X', tabId });
    } catch {
      // inject message failed; ping once more anyway
    }
    status = await ping();
  }

  if (status) {
    paintXStatus(el, 'live', `X script live · ${status.cards} cards · ${status.ready} ready`);
    return;
  }
  paintXStatus(
    el,
    'missing',
    'X script missing — Reload the extension, then reload x.com.',
  );
}
