(function() {
	//#region node_modules/.pnpm/wxt@0.21.4_esbuild@0.28.2_eslint@9.39.4_jiti@2.7.0__rolldown@1.2.9_typescript@5.9.3_vit_47c24954015f6262a28dfea2974a21a8/node_modules/wxt/dist/utils/define-content-script.mjs
	function defineContentScript(definition) {
		return definition;
	}
	//#endregion
	//#region lib/tweet.ts
	var STATUS_RE = /\/status\/(\d+)/;
	var REPOST_RE = /reposted|retweeted|repost[oó]|reposte[oó]|reposti[oó]|retwitte[oó]|ha\s+retwitteado|ha\s+reposteado|retuite[oó]/i;
	var HANDLE_SKIP = /* @__PURE__ */ new Set([
		"home",
		"explore",
		"search",
		"i",
		"hashtag",
		"intent",
		"compose",
		"notifications",
		"messages",
		"settings"
	]);
	var CHROME_SEL = "[data-testid=\"User-Name\"], [data-testid=\"socialContext\"], [role=\"group\"], [data-testid=\"card.wrapper\"], [data-testid=\"tweetPhoto\"], [data-testid=\"videoPlayer\"], [data-testid=\"videoComponent\"], time";
	var MEDIA_SEL = "[data-testid=\"tweetText\"], [data-testid=\"tweetPhoto\"], [data-testid=\"videoPlayer\"], [data-testid=\"videoComponent\"], [data-testid=\"card.wrapper\"]";
	function tweetIdFromHref(href) {
		return href.match(STATUS_RE)?.[1] ?? null;
	}
	function extractTweet(article) {
		if (isPromoted(article)) return null;
		const text = ownTweetText(article);
		if (text.length < 8) return null;
		const id = ownTweetId(article) ?? fallbackTextId(text);
		if (!id) return null;
		return {
			id,
			text: text.slice(0, 4e3),
			handle: ownHandle(article),
			article
		};
	}
	/**
	* Timeline cards, including retweets. Quote tweets keep the parent (own commentary)
	* plus the nested quoted card. Retweet shells are dropped when the nested original
	* is extractable — otherwise the shell's querySelector('.slop-guard-row') steals
	* or deletes the inner badge.
	*/
	function listTweetArticles(root = document) {
		return uniqueElements([...queryDeep(root, "[data-testid=\"tweet\"]"), ...articlesFromCells(root)]).filter((article) => {
			const nested = nestedTweetCards(article);
			if (nested.length === 0) return true;
			if (hasOwnTweetBody(article)) return true;
			return !nested.some((card) => extractTweet(card));
		});
	}
	function isPromoted(article) {
		if (article.querySelector("[data-testid=\"placementTracking\"], [data-testid=\"promotedIndicator\"]")) return true;
		for (const el of article.querySelectorAll("span")) {
			if (!looksPromotedLabel(el.textContent?.trim() ?? "")) continue;
			if (el.closest(MEDIA_SEL)) continue;
			return true;
		}
		return false;
	}
	function looksPromotedLabel(text) {
		return text === "Promoted" || text === "Promoted by" || text === "Promocionado";
	}
	/** Match X socialContext blobs: "Name reposted" / Spanish "repostó" / "reposteó". */
	function isRetweetContext(blob) {
		return REPOST_RE.test(blob);
	}
	function isRetweetCard(article) {
		const scope = article.closest("[data-testid=\"cellInnerDiv\"]") ?? article;
		for (const social of queryDeep(scope, "[data-testid=\"socialContext\"]")) {
			const owner = social.closest("[data-testid=\"tweet\"]");
			if (owner && owner !== article) continue;
			if (isRetweetContext([
				social.getAttribute("aria-label") ?? "",
				social.textContent ?? "",
				social.parentElement?.textContent ?? ""
			].join(" "))) return true;
		}
		return false;
	}
	/** Own tweetText first; retweet shells fall back to the nested original. */
	function findTweetTextEl(article) {
		for (const node of queryDeep(article, "[data-testid=\"tweetText\"]")) if (belongsToArticle(node, article)) return node;
		for (const node of queryDeep(article, "[data-testid=\"tweetText\"]")) return node;
		for (const node of queryDeep(article, "[lang]")) {
			if (!belongsToArticle(node, article) || isChrome(node)) continue;
			if (nodeText(node).length >= 8) return node;
		}
		const more = queryDeep(article, "[data-testid=\"tweet-text-show-more-link\"]")[0];
		if (more?.previousElementSibling instanceof HTMLElement) return more.previousElementSibling;
		return null;
	}
	function findActionBar(article) {
		for (const testid of [
			"reply",
			"retweet",
			"like"
		]) for (const el of queryDeep(article, `[data-testid="${testid}"]`)) {
			if (!belongsToArticle(el, article)) continue;
			const group = el.closest("[role=\"group\"]");
			if (group instanceof HTMLElement && belongsToArticle(group, article)) return group;
			return el;
		}
		return null;
	}
	function hasOwnTweetBody(article) {
		return collectTweetText(article, false).length >= 8;
	}
	function ownTweetText(article) {
		const own = collectTweetText(article, false);
		if (own) return own;
		if (isRetweetCard(article) || nestedTweetCards(article).length > 0) return collectTweetText(article, true);
		return "";
	}
	function collectTweetText(article, allowNested) {
		const parts = [];
		for (const node of queryDeep(article, "[data-testid=\"tweetText\"]")) {
			if (!allowNested && !belongsToArticle(node, article)) continue;
			const t = nodeText(node);
			if (allowNested) {
				if (t.length >= 8) return t;
				continue;
			}
			if (t) parts.push(t);
		}
		const joined = parts.join("\n").trim();
		if (joined.length >= 8) return joined;
		return fallbackCardText(article, allowNested) || joined;
	}
	function fallbackCardText(article, allowNested) {
		for (const more of queryDeep(article, "[data-testid=\"tweet-text-show-more-link\"]")) {
			if (!allowNested && !belongsToArticle(more, article)) continue;
			const sibling = more.previousElementSibling;
			if (sibling instanceof HTMLElement) {
				const t = nodeText(sibling);
				if (t.length >= 8) return t;
			}
			const parent = more.parentElement;
			if (parent instanceof HTMLElement) {
				const t = nodeText(parent);
				if (t.length >= 8) return t;
			}
		}
		let best = "";
		for (const node of queryDeep(article, "[lang]")) {
			if (!allowNested && !belongsToArticle(node, article)) continue;
			if (isChrome(node)) continue;
			const t = nodeText(node);
			if (t.length > best.length) best = t;
		}
		if (best.length >= 8) return best;
		const labelled = labelledByText(article);
		return labelled.length >= 8 ? labelled : "";
	}
	function labelledByText(article) {
		const ids = (article.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
		const parts = [];
		for (const id of ids) {
			const el = article.ownerDocument?.getElementById(id);
			if (!(el instanceof HTMLElement) || el !== article && !article.contains(el)) continue;
			if (el !== article && !belongsToArticle(el, article)) continue;
			if (isChrome(el)) continue;
			const t = nodeText(el);
			if (t.length >= 8) parts.push(t);
		}
		return parts.join("\n").trim();
	}
	function ownTweetId(article) {
		const own = collectTweetId(article, false);
		if (own) return own;
		const nested = collectTweetId(article, true);
		if (nested) return nested;
		const cell = article.closest("[data-testid=\"cellInnerDiv\"]");
		if (cell instanceof HTMLElement && cell !== article) {
			const fromCell = collectTweetId(cell, true);
			if (fromCell) return fromCell;
		}
		const parentCard = article.parentElement?.closest("[data-testid=\"tweet\"]");
		if (parentCard instanceof HTMLElement) return collectTweetId(parentCard, false);
		return null;
	}
	function collectTweetId(article, allowNested) {
		for (const time of queryDeep(article, "time")) {
			const timeLink = time.closest("a");
			if (!timeLink || !allowNested && !belongsToArticle(timeLink, article)) continue;
			const id = tweetIdFromHref(timeLink.getAttribute("href") ?? "");
			if (id) return id;
		}
		for (const a of queryDeep(article, "a[href*=\"/status/\"]")) {
			if (!allowNested && !belongsToArticle(a, article)) continue;
			const id = tweetIdFromHref(a.getAttribute("href") ?? "");
			if (id) return id;
		}
		return null;
	}
	function ownHandle(article) {
		for (const a of queryDeep(article, "[data-testid=\"User-Name\"] a[href^=\"/\"]")) {
			if (!belongsToArticle(a, article)) continue;
			const handle = (a.getAttribute("href") ?? "").replace(/^\//, "").split("/")[0];
			if (handle && !HANDLE_SKIP.has(handle)) return `@${handle}`;
		}
		for (const a of queryDeep(article, "a[href^=\"/\"]")) {
			const href = a.getAttribute("href") ?? "";
			if (href.includes("/status/")) continue;
			const handle = href.replace(/^\//, "").split("/")[0];
			if (handle && !HANDLE_SKIP.has(handle)) return `@${handle}`;
		}
		return "";
	}
	function belongsToArticle(node, article) {
		return tweetCardOwner(node) === article;
	}
	function tweetCardOwner(node) {
		const owner = node.closest("[data-testid=\"tweet\"]") ?? node.closest("[data-testid=\"cellInnerDiv\"]");
		return owner instanceof HTMLElement ? owner : null;
	}
	function nestedTweetCards(article) {
		return queryDeep(article, "[data-testid=\"tweet\"]").filter((node) => node !== article);
	}
	function articlesFromCells(root) {
		const out = [];
		for (const cell of queryDeep(root, "[data-testid=\"cellInnerDiv\"]")) {
			const nested = queryDeep(cell, "[data-testid=\"tweet\"]");
			if (nested.length > 0) {
				out.push(...nested);
				continue;
			}
			if (cellLooksLikeTweet(cell)) out.push(cell);
		}
		return out;
	}
	function cellLooksLikeTweet(cell) {
		if (queryDeep(cell, "[data-testid=\"tweetText\"]").length > 0) return true;
		if (queryDeep(cell, "[data-testid=\"tweet-text-show-more-link\"]").length > 0) return true;
		for (const a of queryDeep(cell, "a[href*=\"/status/\"]")) if (tweetIdFromHref(a.getAttribute("href") ?? "")) return true;
		for (const node of queryDeep(cell, "[lang]")) if (!isChrome(node) && nodeText(node).length >= 8) return true;
		return false;
	}
	function uniqueElements(els) {
		const seen = /* @__PURE__ */ new Set();
		const out = [];
		for (const el of els) {
			if (seen.has(el)) continue;
			seen.add(el);
			out.push(el);
		}
		return out;
	}
	function isChrome(node) {
		return Boolean(node.closest(CHROME_SEL));
	}
	function nodeText(node) {
		const light = usableText(node.textContent ?? "");
		if (light.length >= 8) return light;
		const shadow = usableText(node.shadowRoot?.textContent ?? "");
		return shadow.length > light.length ? shadow : light;
	}
	function usableText(raw) {
		return raw.replace(/\b(Mostrar más|Show more|Show More)\b/gi, "").replace(/\s+/g, " ").trim();
	}
	function fallbackTextId(text) {
		let h = 0;
		for (let i = 0; i < text.length; i += 1) h = h * 31 + text.charCodeAt(i) | 0;
		return `x-t-${Math.abs(h).toString(16)}`;
	}
	/** querySelectorAll plus shadow roots (X sometimes wraps cells). */
	function queryDeep(root, selector) {
		const out = [];
		const visit = (node) => {
			for (const el of node.querySelectorAll(selector)) if (el instanceof HTMLElement) out.push(el);
			for (const el of node.querySelectorAll("*")) if (el instanceof HTMLElement && el.shadowRoot) visit(el.shadowRoot);
		};
		visit(root);
		return out;
	}
	//#endregion
	//#region lib/verdict.ts
	function percent(p) {
		return Math.round(Math.min(1, Math.max(0, p)) * 100);
	}
	function overThreshold(verdict, threshold) {
		return verdict.slopP >= threshold;
	}
	function shouldStamp(verdict, threshold, stampEnabled) {
		return stampEnabled && overThreshold(verdict, threshold);
	}
	/** Front copy always shows slopP so the pill matches the Slop threshold slider. */
	function badgeCopy(verdict, threshold) {
		const n = percent(verdict.slopP);
		if (overThreshold(verdict, threshold)) return {
			tone: "stop",
			text: `Stop | ${n}%`
		};
		return {
			tone: "ok",
			text: `Slop | ${n}%`
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
		const copy = badgeCopy(verdict, settings.threshold);
		if (copy.tone === "ok" && !settings.showNotSlop) clearBadge(article);
		else upsertBadge(article, copy.text, copy.tone, copy.tone === "stop");
		if (shouldStamp(verdict, settings.threshold, settings.stampEnabled) && !opts.undone) stampArticle(article, () => opts.onPutBack?.(verdict.tweetId, article));
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
	function ownSlopRow(article) {
		for (const row of article.querySelectorAll(`.${ROW_CLASS}`)) if (row instanceof HTMLElement && belongsToArticle(row, article)) return row;
		return null;
	}
	function ownOverlay(article) {
		for (const overlay of article.querySelectorAll(`.${OVERLAY_CLASS}`)) if (overlay instanceof HTMLElement && belongsToArticle(overlay, article)) return overlay;
		return null;
	}
	function insertBadgeRow(article, row) {
		const tweetText = findTweetTextEl(article);
		if (tweetText && belongsToArticle(tweetText, article)) {
			tweetText.insertAdjacentElement("afterend", row);
			return;
		}
		const actions = findActionBar(article);
		if (actions) {
			actions.insertAdjacentElement("beforebegin", row);
			return;
		}
		const nested = queryDeep(article, "[data-testid=\"tweet\"]").find((node) => node !== article);
		if (nested) {
			nested.insertAdjacentElement("afterend", row);
			return;
		}
		if (tweetText) {
			tweetText.insertAdjacentElement("afterend", row);
			return;
		}
		const media = article.querySelector("[data-testid=\"tweetPhoto\"], [data-testid=\"videoPlayer\"], [data-testid=\"card.wrapper\"]");
		if (media) media.insertAdjacentElement("beforebegin", row);
		else article.append(row);
	}
	function upsertBadge(article, text, tone, dot) {
		let row = ownSlopRow(article);
		if (!row) {
			row = document.createElement("div");
			row.className = ROW_CLASS;
			insertBadgeRow(article, row);
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
		let overlay = ownOverlay(article);
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
		ownSlopRow(article)?.remove();
	}
	function clearStamp(article) {
		article.classList.remove("slop-guard-stamped");
		ownOverlay(article)?.remove();
	}
	//#endregion
	//#region lib/chrome-msg.ts
	function chromeApi() {
		const root = globalThis;
		const api = root.chrome?.runtime ? root.chrome : root.browser;
		if (!api?.runtime) throw new Error("chrome extension API unavailable");
		return api;
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
	//#endregion
	//#region lib/timeline-guard.ts
	var PENDING_MS = 12e3;
	function runTimelineGuard(ctx, adapter) {
		let settings = DEFAULT_SETTINGS;
		const missingKeyState = { shown: false };
		const undoneIds = /* @__PURE__ */ new Set();
		const observedArticles = /* @__PURE__ */ new WeakSet();
		const inFlightArticles = /* @__PURE__ */ new WeakSet();
		const intersectingArticles = /* @__PURE__ */ new WeakSet();
		const slopFeed = {
			reset(article) {
				article.removeAttribute("data-slop-guard");
				delete article.dataset.slopId;
				delete article.dataset.slopPendingAt;
				ownSlopRow(article)?.remove();
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
					if ((!started || Date.now() - started > PENDING_MS) && !inFlightArticles.has(article)) slopFeed.reset(article);
					return;
				}
				if (state === "done" && !ownSlopRow(article)) reapplyFromDataset(article, settings, {
					undone: undoneIds.has(article.dataset.slopId ?? ""),
					onPutBack: slopFeed.putBack
				});
			},
			putBack(id, article) {
				undoneIds.add(id);
				chromeApi().storage.session.set({ [adapter.undoKey]: [...undoneIds] });
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
					const result = await sendRuntimeMessage({
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
					const badge = ownSlopRow(article)?.querySelector(".slop-guard-badge");
					if (badge instanceof HTMLElement) badge.title = result.error;
				} catch (err) {
					if (ctx.isInvalid) return;
					slopFeed.reset(article);
					markError(article, "retry");
					const badge = ownSlopRow(article)?.querySelector(".slop-guard-badge");
					if (badge instanceof HTMLElement) badge.title = err instanceof Error ? err.message : "Message failed";
					window.setTimeout(() => {
						if (article.getAttribute("data-slop-guard") === "error") {
							article.removeAttribute("data-slop-guard");
							ownSlopRow(article)?.remove();
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
					if (slopFeed.shouldJudge(article) && (isInViewport(article) || intersectingArticles.has(article))) slopFeed.judge(article);
				}
			}
		};
		const scheduleScan = debounce(() => slopFeed.scan(), 120);
		const intersectionObserver = new IntersectionObserver((entries) => {
			for (const entry of entries) {
				if (!(entry.target instanceof HTMLElement)) continue;
				if (entry.isIntersecting) intersectingArticles.add(entry.target);
				else intersectingArticles.delete(entry.target);
				if (entry.isIntersecting) slopFeed.judge(entry.target);
			}
		}, {
			root: null,
			threshold: 0,
			rootMargin: "400px 0px"
		});
		const mutationObserver = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				const target = mutation.target;
				if (target instanceof Element && target.closest?.(".slop-guard-row, .slop-guard-overlay, .slop-guard-modelbar, .slop-guard-banner, .slop-guard-liprobe, .slop-guard-xprobe")) continue;
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
		chromeApi().storage.onChanged.addListener((changes, area) => {
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
		const bag = await chromeApi().storage.session.get(key);
		return Array.isArray(bag[key]) ? bag[key].filter((id) => typeof id === "string") : [];
	}
	function isInViewport(el) {
		const nodes = [el];
		const cell = el.closest("[data-testid=\"cellInnerDiv\"]");
		if (cell && cell !== el) nodes.push(cell);
		const limit = window.innerHeight + 400;
		for (const node of nodes) {
			const rect = node.getBoundingClientRect();
			if (rect.width === 0 && rect.height === 0) continue;
			if (rect.bottom > 0 && rect.top < limit) return true;
		}
		return false;
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
	//#region entrypoints/x-timeline.content/index.ts
	var x_timeline_content_default = defineContentScript({
		matches: [
			"https://x.com/*",
			"https://twitter.com/*",
			"https://www.x.com/*",
			"https://www.twitter.com/*"
		],
		runAt: "document_idle",
		main(ctx) {
			chromeApi().runtime.onMessage.addListener((message, _sender, sendResponse) => {
				const type = message?.type;
				if (type === "PING" || type === "X_STATUS") sendResponse(xStatus());
			});
			showXProbe();
			const tick = window.setInterval(() => showXProbe(), 2e3);
			ctx.onInvalidated(() => window.clearInterval(tick));
			runTimelineGuard(ctx, {
				listArticles: listTweetArticles,
				extract: extractTweet,
				undoKey: "slopGuard.undone.v1"
			});
		}
	});
	function xStatus() {
		const cards = listTweetArticles();
		let ready = 0;
		for (const card of cards) if (extractTweet(card)) ready += 1;
		return {
			ok: true,
			live: true,
			cards: cards.length,
			ready
		};
	}
	var PROBE_STYLE = {
		display: "inline-flex",
		alignItems: "center",
		margin: "6px 16px 8px",
		padding: "4px 10px",
		borderRadius: "999px",
		background: "#1d9bf0",
		color: "#fff",
		font: "650 12px/16px ui-sans-serif, system-ui, sans-serif",
		letterSpacing: "0.01em",
		zIndex: "2147483647",
		position: "relative",
		opacity: "1",
		visibility: "visible",
		pointerEvents: "none",
		boxShadow: "0 2px 8px rgba(0,0,0,0.35)"
	};
	function showXProbe() {
		const { cards, ready } = xStatus();
		const text = `X script live · ${cards} cards · ${ready} ready`;
		let chip = document.getElementById("slop-guard-xprobe");
		if (!(chip instanceof HTMLElement)) {
			chip = document.createElement("div");
			chip.id = "slop-guard-xprobe";
			chip.className = "slop-guard-xprobe";
			Object.assign(chip.style, PROBE_STYLE);
		}
		chip.textContent = text;
		const host = findHomeTabsHost();
		if (host) {
			if (chip.parentElement !== host) host.append(chip);
			return;
		}
		if (!chip.isConnected) {
			Object.assign(chip.style, {
				position: "fixed",
				top: "12px",
				right: "12px",
				margin: "0"
			});
			document.documentElement.append(chip);
		}
	}
	function findHomeTabsHost() {
		for (const tab of document.querySelectorAll("[role=\"tab\"]")) {
			const label = (tab.textContent ?? "").replace(/\s+/g, " ").trim();
			if (/^(Para ti|For you|Siguiendo|Following)$/i.test(label)) {
				const list = tab.closest("[role=\"tablist\"]");
				if (list instanceof HTMLElement && list.parentElement instanceof HTMLElement) return list.parentElement;
				return tab.parentElement instanceof HTMLElement ? tab.parentElement : null;
			}
		}
		return null;
	}
	//#endregion
	//#region node_modules/.pnpm/wxt@0.21.4_esbuild@0.28.2_eslint@9.39.4_jiti@2.7.0__rolldown@1.2.9_typescript@5.9.3_vit_47c24954015f6262a28dfea2974a21a8/node_modules/wxt/dist/utils/internal/logger.mjs
	/** Wrapper around `console` with a "[wxt]" prefix */
	var logger$1 = {
		debug: (...args) => ([...args], void 0),
		log: (...args) => ([...args], void 0),
		warn: (...args) => ([...args], void 0),
		error: (...args) => ([...args], void 0)
	};
	//#endregion
	//#region node_modules/.pnpm/wxt@0.21.4_esbuild@0.28.2_eslint@9.39.4_jiti@2.7.0__rolldown@1.2.9_typescript@5.9.3_vit_47c24954015f6262a28dfea2974a21a8/node_modules/wxt/dist/utils/internal/custom-events.mjs
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
	//#region node_modules/.pnpm/wxt@0.21.4_esbuild@0.28.2_eslint@9.39.4_jiti@2.7.0__rolldown@1.2.9_typescript@5.9.3_vit_47c24954015f6262a28dfea2974a21a8/node_modules/wxt/dist/utils/internal/location-watcher.mjs
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
	//#region node_modules/.pnpm/wxt@0.21.4_esbuild@0.28.2_eslint@9.39.4_jiti@2.7.0__rolldown@1.2.9_typescript@5.9.3_vit_47c24954015f6262a28dfea2974a21a8/node_modules/wxt/dist/utils/content-script-context.mjs
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
	//#region \0virtual:wxt-content-script-isolated-world-entrypoint?/workspace/entrypoints/x-timeline.content/index.ts
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
