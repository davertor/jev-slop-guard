//#region \0vite/modulepreload-polyfill.js
(function polyfill() {
	const relList = document.createElement("link").relList;
	if (relList && relList.supports && relList.supports("modulepreload")) return;
	for (const link of document.querySelectorAll("link[rel=\"modulepreload\"]")) processPreload(link);
	new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			if (mutation.type !== "childList") continue;
			for (const node of mutation.addedNodes) if (node.tagName === "LINK" && node.rel === "modulepreload") processPreload(node);
		}
	}).observe(document, {
		childList: true,
		subtree: true
	});
	function getFetchOpts(link) {
		const fetchOpts = {};
		if (link.integrity) fetchOpts.integrity = link.integrity;
		if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
		if (link.crossOrigin === "use-credentials") fetchOpts.credentials = "include";
		else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
		else fetchOpts.credentials = "same-origin";
		return fetchOpts;
	}
	function processPreload(link) {
		if (link.ep) return;
		link.ep = true;
		const fetchOpts = getFetchOpts(link);
		fetch(link.href, fetchOpts);
	}
})();
//#endregion
//#region lib/chrome-msg.ts
function chromeApi() {
	const root = globalThis;
	const api = root.chrome?.runtime ? root.chrome : root.browser;
	if (!api?.runtime) throw new Error("chrome extension API unavailable");
	return api;
}
function isLinkedInUrl(url) {
	if (!url) return false;
	try {
		const { protocol, hostname } = new URL(url);
		if (protocol !== "https:") return false;
		return hostname === "linkedin.com" || hostname === "www.linkedin.com";
	} catch {
		return false;
	}
}
function isXUrl(url) {
	if (!url) return false;
	try {
		const { protocol, hostname } = new URL(url);
		if (protocol !== "https:") return false;
		return hostname === "x.com" || hostname === "www.x.com" || hostname === "twitter.com" || hostname === "www.twitter.com";
	} catch {
		return false;
	}
}
function sendRuntimeMessage(message) {
	return new Promise((resolve, reject) => {
		const api = chromeApi();
		api.runtime.sendMessage(message, (response) => {
			const err = api.runtime.lastError;
			if (err) reject(new Error(err.message));
			else resolve(response);
		});
	});
}
function sendTabMessage(tabId, message) {
	return new Promise((resolve, reject) => {
		const api = chromeApi();
		api.tabs.sendMessage(tabId, message, (response) => {
			const err = api.runtime.lastError;
			if (err) reject(new Error(err.message));
			else resolve(response);
		});
	});
}
//#endregion
//#region node_modules/.pnpm/wxt@0.21.4_esbuild@0.28.2_eslint@9.39.4_jiti@2.7.0__rolldown@1.2.9_typescript@5.9.3_vit_47c24954015f6262a28dfea2974a21a8/node_modules/wxt/dist/browser.mjs
/**
* Contains the `browser` export which you should use to access the extension
* APIs in your project:
*
* ```ts
* import { browser } from 'wxt/browser';
*
* browser.runtime.onInstalled.addListener(() => {
*   // ...
* });
* ```
*
* @module wxt/browser
*/
var browser = globalThis.browser?.runtime?.id ? globalThis.browser : globalThis.chrome;
//#endregion
//#region lib/settings.ts
var SETTINGS_KEY = "slopGuard.settings.v1";
var DEFAULT_SETTINGS = {
	apiKey: "",
	provider: "typesafe",
	paused: false,
	stampEnabled: true,
	showNotSlop: true,
	threshold: .7,
	model: "jev-latest"
};
function mergeSettings(raw) {
	const src = raw && typeof raw === "object" ? raw : {};
	const fromLegacy = typeof src.noulThreshold === "number" ? src.noulThreshold : void 0;
	const thresholdRaw = typeof src.threshold === "number" && Number.isFinite(src.threshold) ? src.threshold : fromLegacy ?? DEFAULT_SETTINGS.threshold;
	return {
		apiKey: typeof src.apiKey === "string" ? src.apiKey : DEFAULT_SETTINGS.apiKey,
		provider: src.provider === "openrouter" ? "openrouter" : "typesafe",
		paused: src.paused === true,
		stampEnabled: src.stampEnabled !== false,
		showNotSlop: src.showNotSlop !== false,
		threshold: Math.min(.99, Math.max(.4, thresholdRaw)),
		model: src.model === "jev-1.13.0" ? "jev-1.13.0" : "jev-latest"
	};
}
async function loadSettings() {
	return mergeSettings((await browser.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY]);
}
async function saveSettings(next) {
	await browser.storage.local.set({ [SETTINGS_KEY]: mergeSettings(next) });
}
//#endregion
export { chromeApi as a, sendRuntimeMessage as c, browser as i, sendTabMessage as l, loadSettings as n, isLinkedInUrl as o, saveSettings as r, isXUrl as s, DEFAULT_SETTINGS as t };
