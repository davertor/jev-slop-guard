(function() {
	//#region node_modules/.pnpm/wxt@0.21.4_esbuild@0.28.2_eslint@9.39.4_jiti@2.7.0_supports-color@7.2.0__rolldown@1.2.9_625403a819c950bf0584edb17f563f87/node_modules/wxt/dist/utils/define-content-script.mjs
	function defineContentScript(definition) {
		return definition;
	}
	//#endregion
	//#region node_modules/.pnpm/wxt@0.21.4_esbuild@0.28.2_eslint@9.39.4_jiti@2.7.0_supports-color@7.2.0__rolldown@1.2.9_625403a819c950bf0584edb17f563f87/node_modules/wxt/dist/browser.mjs
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
	//#region lib/verdict.ts
	function percent(p) {
		return Math.round(Math.min(1, Math.max(0, p)) * 100);
	}
	function shouldStamp(verdict, threshold, stampEnabled) {
		return stampEnabled && verdict.slopP >= threshold;
	}
	function badgeCopy(verdict, stamped) {
		if (stamped) return {
			tone: "stop",
			text: `Stop | ${percent(verdict.slopP)}%`
		};
		return {
			tone: "ok",
			text: `Not slop | ${percent(verdict.notP)}%`
		};
	}
	//#endregion
	//#region lib/badge.ts
	var BADGE_ATTR = "data-slop-guard";
	var BADGE_CLASS = "slop-guard-badge";
	var ROW_CLASS = "slop-guard-row";
	var OVERLAY_CLASS = "slop-guard-overlay";
	function markPending(article) {
		article.setAttribute(BADGE_ATTR, "pending");
	}
	function markError(article, message) {
		article.setAttribute(BADGE_ATTR, "error");
		upsertBadge(article, message, "error", false);
		clearStamp(article);
	}
	function applyVerdict(article, verdict, settings, opts = {}) {
		article.setAttribute(BADGE_ATTR, "done");
		article.dataset.slopP = String(verdict.slopP);
		article.dataset.slopNotP = String(verdict.notP);
		article.dataset.slopLabel = verdict.label;
		article.dataset.slopModel = verdict.model;
		article.classList.add("slop-guard-card");
		const over = shouldStamp(verdict, settings.threshold, settings.stampEnabled);
		const copy = badgeCopy(verdict, over);
		if (copy.tone === "ok" && !settings.showNotSlop) clearBadge(article);
		else upsertBadge(article, copy.text, copy.tone, copy.tone === "stop");
		if (over && !opts.undone) stampArticle(article, () => opts.onPutBack?.(verdict.tweetId, article));
		else clearStamp(article);
	}
	function reapplyFromDataset(article, settings, opts = {}) {
		if (article.getAttribute("data-slop-guard") !== "done") return;
		const slopP = Number(article.dataset.slopP);
		const notP = Number(article.dataset.slopNotP);
		if (!Number.isFinite(slopP) || !Number.isFinite(notP)) return;
		applyVerdict(article, {
			tweetId: article.dataset.slopId ?? "",
			label: article.dataset.slopLabel === "slop" ? "slop" : "not_slop",
			slopP,
			notP,
			model: article.dataset.slopModel ?? "jev-latest"
		}, settings, opts);
	}
	function upsertBadge(article, text, tone, dot) {
		let row = article.querySelector(`.${ROW_CLASS}`);
		if (!row) {
			row = document.createElement("div");
			row.className = ROW_CLASS;
			const tweetText = [...article.querySelectorAll("[data-testid=\"tweetText\"]")].find((node) => node instanceof HTMLElement && node.closest("article[data-testid=\"tweet\"]") === article);
			if (tweetText?.parentElement) tweetText.parentElement.insertBefore(row, tweetText.nextSibling);
			else article.append(row);
		}
		let badge = row.querySelector(`.${BADGE_CLASS}`);
		if (!badge) {
			badge = document.createElement("span");
			badge.className = BADGE_CLASS;
			row.append(badge);
		}
		badge.dataset.tone = tone;
		badge.replaceChildren();
		if (tone === "ok") {
			const check = document.createElement("span");
			check.className = "slop-guard-check";
			check.textContent = "✓";
			badge.append(check);
		} else if (dot) {
			const mark = document.createElement("span");
			mark.className = "slop-guard-dot";
			badge.append(mark);
		}
		badge.append(document.createTextNode(text));
		badge.title = text;
	}
	function stampArticle(article, onPutBack) {
		article.classList.add("slop-guard-stamped");
		let overlay = article.querySelector(`.${OVERLAY_CLASS}`);
		if (!overlay) {
			overlay = document.createElement("div");
			overlay.className = OVERLAY_CLASS;
			const stamp = document.createElement("div");
			stamp.className = "slop-guard-stamp";
			stamp.textContent = "SLOP";
			const putBack = document.createElement("button");
			putBack.type = "button";
			putBack.className = "slop-guard-putback";
			putBack.textContent = "Show the post";
			overlay.append(stamp, putBack);
			article.append(overlay);
		}
		const button = overlay.querySelector(".slop-guard-putback");
		if (button instanceof HTMLButtonElement) button.onclick = (event) => {
			event.preventDefault();
			event.stopPropagation();
			onPutBack();
		};
	}
	function clearBadge(article) {
		article.querySelector(`.${ROW_CLASS}`)?.remove();
	}
	function clearStamp(article) {
		article.classList.remove("slop-guard-stamped");
		article.querySelector(`.${OVERLAY_CLASS}`)?.remove();
	}
	//#endregion
	//#region lib/queue.ts
	function debounce(fn, ms) {
		let timer;
		return () => {
			if (timer) clearTimeout(timer);
			timer = setTimeout(fn, ms);
		};
	}
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
	//#endregion
	//#region lib/timeline-guard.ts
	var PENDING_MS = 12e3;
	function runTimelineGuard(ctx, adapter) {
		let settings = DEFAULT_SETTINGS;
		const missingKeyState = { shown: false };
		const undoneIds = /* @__PURE__ */ new Set();
		const observedArticles = /* @__PURE__ */ new WeakSet();
		const inFlightArticles = /* @__PURE__ */ new WeakSet();
		const slopFeed = {
			reset(article) {
				article.removeAttribute("data-slop-guard");
				delete article.dataset.slopId;
				delete article.dataset.slopPendingAt;
				article.querySelector(".slop-guard-row")?.remove();
				clearStamp(article);
			},
			shouldJudge(article) {
				if (settings.paused) return false;
				if (inFlightArticles.has(article)) return false;
				if (article.getAttribute("data-slop-guard")) return false;
				return Boolean(adapter.extract(article));
			},
			reconcile(article) {
				const state = article.getAttribute("data-slop-guard");
				if (!state) return;
				const item = adapter.extract(article);
				if (!item) return;
				if (article.dataset.slopId && article.dataset.slopId !== item.id) {
					slopFeed.reset(article);
					return;
				}
				if (state === "pending") {
					const started = Number(article.dataset.slopPendingAt ?? 0);
					if (started && Date.now() - started > PENDING_MS && !inFlightArticles.has(article)) slopFeed.reset(article);
				}
			},
			putBack(id, article) {
				undoneIds.add(id);
				browser.storage.session.set({ [adapter.undoKey]: [...undoneIds] });
				clearStamp(article);
			},
			async judge(article) {
				slopFeed.reconcile(article);
				if (!slopFeed.shouldJudge(article)) return;
				const item = adapter.extract(article);
				if (!item) return;
				inFlightArticles.add(article);
				article.dataset.slopId = item.id;
				article.dataset.slopPendingAt = String(Date.now());
				markPending(article);
				try {
					const result = await browser.runtime.sendMessage({
						type: "JUDGE_TWEET",
						tweet: {
							id: item.id,
							text: item.text,
							handle: item.handle
						}
					});
					if (ctx.isInvalid) return;
					const current = adapter.extract(article);
					if (!current || current.id !== item.id) {
						slopFeed.reset(article);
						return;
					}
					if (!result) {
						slopFeed.reset(article);
						return;
					}
					if (result.ok) {
						applyVerdict(article, result.verdict, settings, {
							undone: undoneIds.has(item.id),
							onPutBack: slopFeed.putBack
						});
						delete article.dataset.slopPendingAt;
						showModelBar(result.verdict.model);
						return;
					}
					if (result.code === "NO_KEY") {
						markError(article, "set API key");
						showMissingKeyBanner(missingKeyState, adapter.missingKeyMessage);
						return;
					}
					if (result.code === "PAUSED") {
						slopFeed.reset(article);
						return;
					}
					markError(article, "jev error");
					const badge = article.querySelector(".slop-guard-badge");
					if (badge instanceof HTMLElement) badge.title = result.error;
				} catch (err) {
					if (ctx.isInvalid) return;
					slopFeed.reset(article);
					markError(article, "retry");
					const badge = article.querySelector(".slop-guard-badge");
					if (badge instanceof HTMLElement) badge.title = err instanceof Error ? err.message : "Message failed";
					window.setTimeout(() => {
						if (article.getAttribute("data-slop-guard") === "error") {
							article.removeAttribute("data-slop-guard");
							article.querySelector(".slop-guard-row")?.remove();
						}
					}, 2500);
				} finally {
					inFlightArticles.delete(article);
				}
			},
			scan() {
				for (const article of adapter.listArticles()) {
					slopFeed.reconcile(article);
					if (!observedArticles.has(article)) {
						observedArticles.add(article);
						intersectionObserver.observe(article);
					}
					if (slopFeed.shouldJudge(article) && isInViewport(article)) slopFeed.judge(article);
				}
			}
		};
		const scheduleScan = debounce(() => slopFeed.scan(), 120);
		const intersectionObserver = new IntersectionObserver((entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) continue;
				slopFeed.judge(entry.target);
			}
		}, {
			root: null,
			threshold: .05,
			rootMargin: "220px 0px"
		});
		const mutationObserver = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				const target = mutation.target;
				if (target instanceof Element && target.closest?.(".slop-guard-row, .slop-guard-overlay, .slop-guard-modelbar, .slop-guard-banner, .slop-guard-liprobe")) continue;
				scheduleScan();
				return;
			}
		});
		mutationObserver.observe(document.documentElement, {
			childList: true,
			subtree: true
		});
		const sweepTimer = window.setInterval(() => slopFeed.scan(), 2e3);
		ctx.onInvalidated(() => {
			mutationObserver.disconnect();
			intersectionObserver.disconnect();
			window.clearInterval(sweepTimer);
		});
		Promise.all([loadSettings(), loadUndoneIds(adapter.undoKey)]).then(([loaded, ids]) => {
			settings = loaded;
			for (const id of ids) undoneIds.add(id);
			slopFeed.scan();
		});
		browser.storage.onChanged.addListener((changes, area) => {
			if (area !== "local" || !changes["slopGuard.settings.v1"]) return;
			loadSettings().then((loaded) => {
				settings = loaded;
				for (const article of adapter.listArticles()) {
					if (article.getAttribute("data-slop-guard") === "error" && loaded.apiKey.trim()) {
						slopFeed.reset(article);
						if (isInViewport(article)) slopFeed.judge(article);
						continue;
					}
					reapplyFromDataset(article, settings, {
						undone: undoneIds.has(article.dataset.slopId ?? ""),
						onPutBack: slopFeed.putBack
					});
				}
				document.querySelector(".slop-guard-banner")?.remove();
				if (!settings.paused) slopFeed.scan();
			});
		});
	}
	async function loadUndoneIds(key) {
		const bag = await browser.storage.session.get(key);
		return Array.isArray(bag[key]) ? bag[key].filter((id) => typeof id === "string") : [];
	}
	function isInViewport(el) {
		const rect = el.getBoundingClientRect();
		return rect.bottom > 0 && rect.top < window.innerHeight + 220;
	}
	function showModelBar(model) {
		let bar = document.querySelector(".slop-guard-modelbar");
		if (!bar) {
			bar = document.createElement("div");
			bar.className = "slop-guard-modelbar";
			document.body.append(bar);
		}
		bar.textContent = model.replace(/^jev/i, "Jev");
	}
	function showMissingKeyBanner(state, message) {
		if (state.shown) return;
		state.shown = true;
		if (document.querySelector(".slop-guard-banner")) return;
		const banner = document.createElement("div");
		banner.className = "slop-guard-banner";
		banner.textContent = message ?? "Slop Guard: add your TypeSafe or OpenRouter API key in the extension popup.";
		document.body.append(banner);
	}
	//#endregion
	//#region lib/tweet.ts
	var STATUS_RE = /\/status\/(\d+)/;
	function tweetIdFromHref(href) {
		return href.match(STATUS_RE)?.[1] ?? null;
	}
	function extractTweet(article) {
		if (isPromoted(article)) return null;
		const text = ownTweetText(article);
		if (text.length < 8) return null;
		const id = ownTweetId(article);
		if (!id) return null;
		return {
			id,
			text: text.slice(0, 4e3),
			handle: ownHandle(article),
			article
		};
	}
	/**
	* Timeline cards, including retweets. If a card nests another tweet (quote),
	* keep the parent when it has its own text; always keep leaves.
	*/
	function listTweetArticles(root = document) {
		return [...root.querySelectorAll("article[data-testid=\"tweet\"]")].filter((node) => node instanceof HTMLElement).filter((article) => {
			if (!article.querySelector("article[data-testid=\"tweet\"]")) return true;
			return ownTweetText(article).length >= 8;
		});
	}
	function isPromoted(article) {
		if (article.querySelector("[data-testid=\"placementTracking\"], [data-testid=\"promotedIndicator\"]")) return true;
		for (const el of article.querySelectorAll("span")) {
			const text = el.textContent?.trim();
			if (text === "Promoted" || text === "Promoted by" || text === "Promocionado") return true;
		}
		return false;
	}
	function isRetweetCard(article) {
		const social = article.querySelector("[data-testid=\"socialContext\"]");
		if (!social) return false;
		const blob = (social.textContent ?? "").toLowerCase();
		return /reposteó|reposted|retweeted|repostió|ha retwitteado/.test(blob);
	}
	/** Text for this card (not nested quoted tweets). Falls back for retweet shells. */
	function ownTweetText(article) {
		const parts = [];
		for (const node of article.querySelectorAll("[data-testid=\"tweetText\"]")) {
			if (!(node instanceof HTMLElement)) continue;
			if (node.closest("article[data-testid=\"tweet\"]") !== article) continue;
			const t = node.textContent?.replace(/\s+/g, " ").trim() ?? "";
			if (t) parts.push(t);
		}
		if (parts.length > 0) return parts.join("\n").trim();
		if (isRetweetCard(article)) for (const node of article.querySelectorAll("[data-testid=\"tweetText\"]")) {
			const t = node.textContent?.replace(/\s+/g, " ").trim() ?? "";
			if (t.length >= 8) return t;
		}
		return "";
	}
	function ownTweetId(article) {
		const timeLink = article.querySelector("time")?.closest("a");
		if (timeLink && belongsToArticle(timeLink, article)) {
			const id = tweetIdFromHref(timeLink.getAttribute("href") ?? "");
			if (id) return id;
		}
		for (const a of article.querySelectorAll("a[href*=\"/status/\"]")) {
			if (!(a instanceof HTMLElement)) continue;
			if (!belongsToArticle(a, article)) continue;
			const id = tweetIdFromHref(a.getAttribute("href") ?? "");
			if (id) return id;
		}
		if (isRetweetCard(article)) for (const a of article.querySelectorAll("a[href*=\"/status/\"]")) {
			const id = tweetIdFromHref(a.getAttribute("href") ?? "");
			if (id) return id;
		}
		return null;
	}
	function ownHandle(article) {
		for (const a of article.querySelectorAll("[data-testid=\"User-Name\"] a[href^=\"/\"]")) {
			if (!(a instanceof HTMLElement)) continue;
			if (!belongsToArticle(a, article)) continue;
			const handle = (a.getAttribute("href") ?? "").replace(/^\//, "").split("/")[0];
			if (handle && handle !== "i") return `@${handle}`;
		}
		if (isRetweetCard(article)) for (const a of article.querySelectorAll("a[href^=\"/\"]")) {
			const href = a.getAttribute("href") ?? "";
			if (href.includes("/status/")) continue;
			const handle = href.replace(/^\//, "").split("/")[0];
			if (handle && ![
				"home",
				"explore",
				"search",
				"i"
			].includes(handle)) return `@${handle}`;
		}
		return "";
	}
	function belongsToArticle(node, article) {
		return node.closest("article[data-testid=\"tweet\"]") === article;
	}
	//#endregion
	//#region entrypoints/x-timeline.content/index.ts
	var x_timeline_content_default = defineContentScript({
		matches: ["https://x.com/*", "https://twitter.com/*"],
		runAt: "document_idle",
		main(ctx) {
			runTimelineGuard(ctx, {
				listArticles: listTweetArticles,
				extract: extractTweet,
				undoKey: "slopGuard.undone.v1"
			});
		}
	});
	//#endregion
	//#region node_modules/.pnpm/wxt@0.21.4_esbuild@0.28.2_eslint@9.39.4_jiti@2.7.0_supports-color@7.2.0__rolldown@1.2.9_625403a819c950bf0584edb17f563f87/node_modules/wxt/dist/utils/internal/logger.mjs
	/** Wrapper around `console` with a "[wxt]" prefix */
	var logger$1 = {
		debug: (...args) => ([...args], void 0),
		log: (...args) => ([...args], void 0),
		warn: (...args) => ([...args], void 0),
		error: (...args) => ([...args], void 0)
	};
	//#endregion
	//#region node_modules/.pnpm/wxt@0.21.4_esbuild@0.28.2_eslint@9.39.4_jiti@2.7.0_supports-color@7.2.0__rolldown@1.2.9_625403a819c950bf0584edb17f563f87/node_modules/wxt/dist/utils/internal/custom-events.mjs
	var WxtLocationChangeEvent = class WxtLocationChangeEvent extends Event {
		static EVENT_NAME = getUniqueEventName("wxt:locationchange");
		constructor(newUrl, oldUrl) {
			super(WxtLocationChangeEvent.EVENT_NAME, {});
			this.newUrl = newUrl;
			this.oldUrl = oldUrl;
		}
	};
	/**
	* Returns an event name unique to the extension and content script that's
	* running.
	*/
	function getUniqueEventName(eventName) {
		return `${browser?.runtime?.id}:x-timeline:${eventName}`;
	}
	//#endregion
	//#region node_modules/.pnpm/wxt@0.21.4_esbuild@0.28.2_eslint@9.39.4_jiti@2.7.0_supports-color@7.2.0__rolldown@1.2.9_625403a819c950bf0584edb17f563f87/node_modules/wxt/dist/utils/internal/location-watcher.mjs
	var supportsNavigationApi = typeof globalThis.navigation?.addEventListener === "function";
	/**
	* Create a util that watches for URL changes, dispatching the custom event when
	* detected. Stops watching when content script is invalidated. Uses Navigation
	* API when available, otherwise falls back to polling.
	*/
	function createLocationWatcher(ctx) {
		let lastUrl;
		let watching = false;
		return { run() {
			if (watching) return;
			watching = true;
			lastUrl = new URL(location.href);
			if (supportsNavigationApi) globalThis.navigation.addEventListener("navigate", (event) => {
				const newUrl = new URL(event.destination.url);
				if (newUrl.href === lastUrl.href) return;
				window.dispatchEvent(new WxtLocationChangeEvent(newUrl, lastUrl));
				lastUrl = newUrl;
			}, { signal: ctx.signal });
			else ctx.setInterval(() => {
				const newUrl = new URL(location.href);
				if (newUrl.href !== lastUrl.href) {
					window.dispatchEvent(new WxtLocationChangeEvent(newUrl, lastUrl));
					lastUrl = newUrl;
				}
			}, 1e3);
		} };
	}
	//#endregion
	//#region node_modules/.pnpm/wxt@0.21.4_esbuild@0.28.2_eslint@9.39.4_jiti@2.7.0_supports-color@7.2.0__rolldown@1.2.9_625403a819c950bf0584edb17f563f87/node_modules/wxt/dist/utils/content-script-context.mjs
	/**
	* Implements
	* [`AbortController`](https://developer.mozilla.org/en-US/docs/Web/API/AbortController).
	* Used to detect and stop content script code when the script is invalidated.
	*
	* It also provides several utilities like `ctx.setTimeout` and
	* `ctx.setInterval` that should be used in content scripts instead of
	* `window.setTimeout` or `window.setInterval`.
	*
	* To create context for testing, you can use the class's constructor:
	*
	* ```ts
	* import { ContentScriptContext } from 'wxt/utils/content-scripts-context';
	*
	* test('storage listener should be removed when context is invalidated', () => {
	*   const ctx = new ContentScriptContext('test');
	*   const item = storage.defineItem('local:count', { defaultValue: 0 });
	*   const watcher = vi.fn();
	*
	*   const unwatch = item.watch(watcher);
	*   ctx.onInvalidated(unwatch); // Listen for invalidate here
	*
	*   await item.setValue(1);
	*   expect(watcher).toBeCalledTimes(1);
	*   expect(watcher).toBeCalledWith(1, 0);
	*
	*   ctx.notifyInvalidated(); // Use this function to invalidate the context
	*   await item.setValue(2);
	*   expect(watcher).toBeCalledTimes(1);
	* });
	* ```
	*/
	var ContentScriptContext = class ContentScriptContext {
		static SCRIPT_STARTED_MESSAGE_TYPE = getUniqueEventName("wxt:content-script-started");
		id;
		abortController;
		locationWatcher = createLocationWatcher(this);
		constructor(contentScriptName, options) {
			this.contentScriptName = contentScriptName;
			this.options = options;
			this.id = Math.random().toString(36).slice(2);
			this.abortController = new AbortController();
			this.stopOldScripts();
			this.listenForNewerScripts();
		}
		get signal() {
			return this.abortController.signal;
		}
		abort(reason) {
			return this.abortController.abort(reason);
		}
		get isInvalid() {
			if (browser.runtime?.id == null) this.notifyInvalidated();
			return this.signal.aborted;
		}
		get isValid() {
			return !this.isInvalid;
		}
		/**
		* Add a listener that is called when the content script's context is
		* invalidated.
		*
		* @example
		*   browser.runtime.onMessage.addListener(cb);
		*   const removeInvalidatedListener = ctx.onInvalidated(() => {
		*     browser.runtime.onMessage.removeListener(cb);
		*   });
		*   // ...
		*   removeInvalidatedListener();
		*
		* @returns A function to remove the listener.
		*/
		onInvalidated(cb) {
			this.signal.addEventListener("abort", cb);
			return () => this.signal.removeEventListener("abort", cb);
		}
		/**
		* Return a promise that never resolves. Useful if you have an async function
		* that shouldn't run after the context is expired.
		*
		* @example
		*   const getValueFromStorage = async () => {
		*     if (ctx.isInvalid) return ctx.block();
		*
		*     // ...
		*   };
		*/
		block() {
			return new Promise(() => {});
		}
		/**
		* Wrapper around `window.setInterval` that automatically clears the interval
		* when invalidated.
		*
		* Intervals can be cleared by calling the normal `clearInterval` function.
		*/
		setInterval(handler, timeout) {
			const id = setInterval(() => {
				if (this.isValid) handler();
			}, timeout);
			this.onInvalidated(() => clearInterval(id));
			return id;
		}
		/**
		* Wrapper around `window.setTimeout` that automatically clears the interval
		* when invalidated.
		*
		* Timeouts can be cleared by calling the normal `setTimeout` function.
		*/
		setTimeout(handler, timeout) {
			const id = setTimeout(() => {
				if (this.isValid) handler();
			}, timeout);
			this.onInvalidated(() => clearTimeout(id));
			return id;
		}
		/**
		* Wrapper around `window.requestAnimationFrame` that automatically cancels
		* the request when invalidated.
		*
		* Callbacks can be canceled by calling the normal `cancelAnimationFrame`
		* function.
		*/
		requestAnimationFrame(callback) {
			const id = requestAnimationFrame((...args) => {
				if (this.isValid) callback(...args);
			});
			this.onInvalidated(() => cancelAnimationFrame(id));
			return id;
		}
		/**
		* Wrapper around `window.requestIdleCallback` that automatically cancels the
		* request when invalidated.
		*
		* Callbacks can be canceled by calling the normal `cancelIdleCallback`
		* function.
		*/
		requestIdleCallback(callback, options) {
			const id = requestIdleCallback((...args) => {
				if (!this.signal.aborted) callback(...args);
			}, options);
			this.onInvalidated(() => cancelIdleCallback(id));
			return id;
		}
		addEventListener(target, type, handler, options) {
			if (type === "wxt:locationchange") {
				if (this.isValid) this.locationWatcher.run();
			}
			target.addEventListener?.(type.startsWith("wxt:") ? getUniqueEventName(type) : type, handler, {
				...options,
				signal: this.signal
			});
		}
		/**
		* @internal
		* Abort the abort controller and execute all `onInvalidated` listeners.
		*/
		notifyInvalidated() {
			this.abort("Content script context invalidated");
			logger$1.debug(`Content script "${this.contentScriptName}" context invalidated`);
		}
		stopOldScripts() {
			document.dispatchEvent(new CustomEvent(ContentScriptContext.SCRIPT_STARTED_MESSAGE_TYPE, { detail: {
				contentScriptName: this.contentScriptName,
				messageId: this.id
			} }));
			if (!this.options?.noScriptStartedPostMessage) window.postMessage({
				type: ContentScriptContext.SCRIPT_STARTED_MESSAGE_TYPE,
				contentScriptName: this.contentScriptName,
				messageId: this.id
			}, "*");
		}
		verifyScriptStartedEvent(event) {
			const isSameContentScript = event.detail?.contentScriptName === this.contentScriptName;
			const isFromSelf = event.detail?.messageId === this.id;
			return isSameContentScript && !isFromSelf;
		}
		listenForNewerScripts() {
			const cb = (event) => {
				if (!(event instanceof CustomEvent) || !this.verifyScriptStartedEvent(event)) return;
				this.notifyInvalidated();
			};
			document.addEventListener(ContentScriptContext.SCRIPT_STARTED_MESSAGE_TYPE, cb);
			this.onInvalidated(() => document.removeEventListener(ContentScriptContext.SCRIPT_STARTED_MESSAGE_TYPE, cb));
		}
	};
	//#endregion
	//#region \0virtual:wxt-content-script-isolated-world-entrypoint?/Users/dverdu/Python_projects/jev-slop-detector/entrypoints/x-timeline.content/index.ts
	/** Wrapper around `console` with a "[wxt]" prefix */
	var logger = {
		debug: (...args) => ([...args], void 0),
		log: (...args) => ([...args], void 0),
		warn: (...args) => ([...args], void 0),
		error: (...args) => ([...args], void 0)
	};
	//#endregion
	return (async () => {
		try {
			const { main, ...options } = x_timeline_content_default;
			return await main(new ContentScriptContext("x-timeline", options));
		} catch (err) {
			logger.error(`The content script "x-timeline" crashed on startup!`, err);
			throw err;
		}
	})();
})();
