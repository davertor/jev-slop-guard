import { a as chromeApi, c as sendTabMessage, n as loadSettings, o as isXUrl, r as saveSettings, s as sendRuntimeMessage, t as DEFAULT_SETTINGS } from "./settings-Ct9jgRFA.js";
//#region lib/settings-ui.ts
var SETTINGS_FORM_HTML = `
  <header>
    <div>
      <p class="eyebrow">Slop Guard</p>
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
async function mountSettingsPage(root) {
	root.innerHTML = SETTINGS_FORM_HTML;
	bind(root, await loadSettings());
}
function bind(root, initial) {
	const apiKey = must(root, "#apiKey");
	const provider = must(root, "#provider");
	const model = must(root, "#model");
	const pauseToggle = must(root, "#pause-toggle");
	const stampEnabled = must(root, "#stampEnabled");
	const showNotSlop = must(root, "#showNotSlop");
	const threshold = must(root, "#threshold");
	const thresholdReadout = must(root, "#threshold-readout");
	const warning = must(root, "#key-warning");
	const status = must(root, "#status");
	const sample = must(root, "#sample");
	const sampleHandle = must(root, "#sample-handle");
	const sampleOut = must(root, "#sample-out");
	const xStatusEl = must(root, "#x-script-status");
	const apiKeyLabel = must(root, "#apiKey-label");
	const apiKeyHint = must(root, "#apiKey-hint");
	let paused = initial.paused;
	const paintPause = () => {
		pauseToggle.dataset.paused = paused ? "true" : "false";
		pauseToggle.textContent = paused ? "Start" : "Pause";
	};
	const syncKeyCopy = (prov) => {
		if (prov === "openrouter") {
			apiKeyLabel.textContent = "OpenRouter API key (BYOK → chrome.storage.local)";
			apiKey.placeholder = "OPENROUTER_API_KEY (sk-or-…)";
			apiKeyHint.textContent = "Paste your OpenRouter key. Decisions endpoint needs TypeSafe allowed in OpenRouter Settings → Privacy.";
		} else {
			apiKeyLabel.textContent = "TypeSafe API key (BYOK → chrome.storage.local)";
			apiKey.placeholder = "TypeSafe Jev key (console.typesafe.ai)";
			apiKeyHint.textContent = "Or switch Provider to OpenRouter and paste OPENROUTER_API_KEY instead.";
		}
	};
	const paint = (s) => {
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
	provider.addEventListener("change", () => {
		syncKeyCopy(provider.value === "openrouter" ? "openrouter" : "typesafe");
	});
	threshold.addEventListener("input", () => {
		thresholdReadout.textContent = `${Math.round(Number(threshold.value) * 100)}%`;
	});
	const read = () => ({
		...DEFAULT_SETTINGS,
		apiKey: apiKey.value.trim(),
		provider: provider.value === "openrouter" ? "openrouter" : "typesafe",
		paused,
		stampEnabled: stampEnabled.checked,
		showNotSlop: showNotSlop.checked,
		threshold: Number(threshold.value),
		model: model.value === "jev-1.13.0" ? "jev-1.13.0" : "jev-latest"
	});
	must(root, "#save").addEventListener("click", () => {
		saveSettings(read()).then(() => {
			warning.hidden = Boolean(apiKey.value.trim());
			status.textContent = "Saved.";
		});
	});
	pauseToggle.addEventListener("click", () => {
		paused = !paused;
		paintPause();
		saveSettings(read()).then(() => {
			status.textContent = paused ? "Paused." : "Running.";
		});
	});
	stampEnabled.addEventListener("change", () => {
		saveSettings(read());
	});
	showNotSlop.addEventListener("change", () => {
		saveSettings(read());
	});
	must(root, "#judge").addEventListener("click", () => {
		const text = sample.value.trim();
		if (!text) {
			sampleOut.hidden = false;
			sampleOut.textContent = "Paste tweet text first.";
			return;
		}
		sampleOut.hidden = false;
		sampleOut.textContent = "Calling Jev…";
		sendRuntimeMessage({
			type: "JUDGE_TWEET",
			tweet: {
				id: `sample-${hash(text)}`,
				text,
				handle: sampleHandle.value.trim()
			}
		}).then((result) => {
			sampleOut.textContent = JSON.stringify(result, null, 2);
		}).catch((err) => {
			sampleOut.textContent = err instanceof Error ? err.message : "Message failed";
		});
	});
	refreshXStatus(xStatusEl);
}
function must(root, sel) {
	const node = root.querySelector(sel);
	if (!node) throw new Error(`Missing ${sel}`);
	return node;
}
function hash(text) {
	let h = 0;
	for (let i = 0; i < text.length; i += 1) h = h * 31 + text.charCodeAt(i) | 0;
	return String(Math.abs(h));
}
function paintXStatus(el, state, text) {
	el.hidden = false;
	el.dataset.state = state;
	el.textContent = text;
}
async function refreshXStatus(el) {
	let tabs;
	try {
		tabs = await chromeApi().tabs.query({
			active: true,
			currentWindow: true
		});
	} catch {
		return;
	}
	const [tab] = tabs;
	if (!tab?.id || !isXUrl(tab.url)) {
		paintXStatus(el, "idle", "Open x.com to attach the timeline script.");
		return;
	}
	const tabId = tab.id;
	const ping = async () => {
		try {
			const result = await sendTabMessage(tabId, { type: "X_STATUS" });
			return result?.ok && result.live ? result : null;
		} catch {
			return null;
		}
	};
	let status = await ping();
	if (!status) {
		try {
			await sendRuntimeMessage({
				type: "INJECT_X",
				tabId
			});
		} catch {}
		status = await ping();
	}
	if (status) {
		paintXStatus(el, "live", `X script live · ${status.cards} cards · ${status.ready} ready`);
		return;
	}
	paintXStatus(el, "missing", "X script missing — Reload the extension, then reload x.com.");
}
//#endregion
export { mountSettingsPage as t };
