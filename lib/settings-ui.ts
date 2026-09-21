import type { JudgeResult } from './messages';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from './settings';

export const SETTINGS_FORM_HTML = `
  <header>
    <div>
      <p class="eyebrow">Slop Guard</p>
      <h1>Real-time slop detector</h1>
    </div>
    <label class="switch">
      <input id="paused" type="checkbox" />
      <span>Pause</span>
    </label>
  </header>

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
    <span>Show green “Not slop” badge on clean posts</span>
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
  const paused = must<HTMLInputElement>(root, '#paused');
  const stampEnabled = must<HTMLInputElement>(root, '#stampEnabled');
  const showNotSlop = must<HTMLInputElement>(root, '#showNotSlop');
  const threshold = must<HTMLInputElement>(root, '#threshold');
  const thresholdReadout = must(root, '#threshold-readout');
  const warning = must(root, '#key-warning');
  const status = must(root, '#status');
  const sample = must<HTMLTextAreaElement>(root, '#sample');
  const sampleHandle = must<HTMLInputElement>(root, '#sample-handle');
  const sampleOut = must(root, '#sample-out');

  const apiKeyLabel = must(root, '#apiKey-label');
  const apiKeyHint = must(root, '#apiKey-hint');

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
    paused.checked = s.paused;
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
    paused: paused.checked,
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

  paused.addEventListener('change', () => {
    void saveSettings(read()).then(() => {
      status.textContent = paused.checked ? 'Paused.' : 'Running.';
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
    void browser.runtime
      .sendMessage({
        type: 'JUDGE_TWEET',
        tweet: {
          id: `sample-${hash(text)}`,
          text,
          handle: sampleHandle.value.trim(),
        },
      })
      .then((result: JudgeResult) => {
        sampleOut.textContent = JSON.stringify(result, null, 2);
      })
      .catch((err: unknown) => {
        sampleOut.textContent = err instanceof Error ? err.message : 'Message failed';
      });
  });
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
