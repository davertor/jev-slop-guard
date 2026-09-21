(function() {
	//#region node_modules/.pnpm/wxt@0.21.4_esbuild@0.28.2_eslint@9.39.4_jiti@2.7.0__rolldown@1.2.9_typescript@5.9.3_vit_47c24954015f6262a28dfea2974a21a8/node_modules/wxt/dist/utils/define-content-script.mjs
	function defineContentScript(definition) {
		return definition;
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
	//#region lib/linkedin.ts
	/** Prefer concrete activity cards; fall back to newer FeedType rows. */
	var PRIMARY_CARD_SELECTORS = [
		"div.feed-shared-update-v2[data-urn]",
		"div.feed-shared-update-v2[data-id]",
		"div[data-id^=\"urn:li:activity\"]",
		"div[data-urn^=\"urn:li:activity\"]",
		"div[data-urn^=\"urn:li:ugcPost\"]",
		"div[data-urn^=\"urn:li:share\"]",
		"div[data-urn^=\"urn:li:aggregatedShare\"]",
		"div.feed-shared-update-v2",
		"div.occludable-update"
	];
	var FEED_ROW_SELECTORS = [
		"div[componentkey*=\"FeedType_MAIN_FEED\"]",
		"div[componentkey*=\"FeedType_\"]",
		"div[data-finite-scroll-hotkey-item]"
	];
	var TEXT_SELECTORS = [
		".update-components-text",
		".feed-shared-update-v2__commentary",
		".feed-shared-update-v2__description",
		".feed-shared-text",
		".feed-shared-inline-show-more-text",
		".update-components-update-v2__commentary",
		"[data-test-id=\"main-feed-activity-card__commentary\"]",
		".break-words span[dir=\"ltr\"]",
		".break-words"
	];
	var ACTOR_SELECTORS = [
		"a[href*=\"/in/\"] span[aria-hidden=\"true\"]",
		"a[href*=\"/company/\"] span[aria-hidden=\"true\"]",
		".update-components-actor__title span[aria-hidden=\"true\"]",
		".update-components-actor__title",
		".update-components-actor__name"
	];
	function listLinkedInArticles(root = document) {
		const primary = queryAll(root, PRIMARY_CARD_SELECTORS);
		return dropNested(primary.length > 0 ? primary : queryAll(root, FEED_ROW_SELECTORS)).filter((el) => {
			if (el.closest(".feed-shared-update-v2[data-urn], div[data-urn^=\"urn:li:activity\"]") && el.closest(".feed-shared-update-v2[data-urn], div[data-urn^=\"urn:li:activity\"]") !== el) return false;
			return true;
		}).filter((el) => {
			const rectH = el.getBoundingClientRect().height;
			const h = rectH > 0 ? rectH : el.offsetHeight || 0;
			if (h === 0) return true;
			return h > 80 && h < Math.max(window.innerHeight, 600) * 2.5;
		});
	}
	function extractLinkedInPost(article) {
		if (isLinkedInPromoted(article)) return null;
		const text = pickText(article);
		if (text.length < 12) return null;
		const id = linkedInId(article, text);
		if (!id) return null;
		return {
			id,
			text: text.slice(0, 4e3),
			handle: pickActor(article),
			article
		};
	}
	function isLinkedInPromoted(article) {
		for (const el of article.querySelectorAll(".update-components-actor__description, .update-components-actor__sub-description, span, div")) {
			const t = el.textContent?.trim() ?? "";
			if (t.length > 24) continue;
			if (/^(Promoted|Sponsored|Promocionado|Patrocinado)(\s+by)?$/i.test(t)) return true;
		}
		const urn = article.getAttribute("data-urn") ?? article.getAttribute("data-id") ?? "";
		return /sponsored|promoted/i.test(urn);
	}
	function queryAll(root, selectors) {
		const out = [];
		const seen = /* @__PURE__ */ new Set();
		for (const sel of selectors) for (const node of root.querySelectorAll(sel)) {
			if (!(node instanceof HTMLElement) || seen.has(node)) continue;
			seen.add(node);
			out.push(node);
		}
		return out;
	}
	function dropNested(els) {
		return els.filter((el) => !els.some((other) => other !== el && other.contains(el)));
	}
	function pickText(article) {
		for (const sel of TEXT_SELECTORS) {
			const t = clean(article.querySelector(sel)?.textContent ?? "");
			if (t.length >= 12) return t;
		}
		const candidates = [];
		for (const el of article.querySelectorAll("span[dir=\"ltr\"], p, span")) {
			if (el.closest("button, nav, footer, .social-details-social-counts, [role=\"button\"]")) continue;
			const t = clean(el.textContent ?? "");
			if (t.length >= 40 && t.length < 4e3) candidates.push(t);
		}
		candidates.sort((a, b) => b.length - a.length);
		if (candidates[0]) return candidates[0];
		let best = "";
		for (const el of article.querySelectorAll("span, p, div")) {
			if (el.closest("button, a[href*=\"comment\"], .social-details-social-counts, [role=\"button\"]")) continue;
			const t = clean(el.textContent ?? "");
			if (t.length > best.length && t.length < 4e3 && t.length >= 12) best = t;
		}
		return best;
	}
	function pickActor(article) {
		for (const sel of ACTOR_SELECTORS) {
			const t = clean(article.querySelector(sel)?.textContent ?? "");
			if (t) return t.split("•")[0]?.trim() || t;
		}
		const slug = (article.querySelector("a[href*=\"/in/\"]")?.getAttribute("href") ?? article.querySelector("a[href*=\"/company/\"]")?.getAttribute("href") ?? "").match(/\/(in|company)\/([^/?#]+)/)?.[2];
		return slug ? `@${decodeURIComponent(slug)}` : "";
	}
	function linkedInId(article, text) {
		const activity = (article.getAttribute("data-id") || article.getAttribute("data-urn") || article.querySelector("[data-id*=\"urn:li:\"]")?.getAttribute("data-id") || article.querySelector("[data-urn*=\"urn:li:\"]")?.getAttribute("data-urn") || "").match(/urn:li:(?:activity|ugcPost|share|aggregatedShare):(\d+)/);
		if (activity?.[1]) return `li-${activity[0].includes("ugcPost") ? "ugc" : "activity"}-${activity[1]}`;
		const updateHref = article.querySelector("a[href*=\"/feed/update/\"]")?.getAttribute("href") ?? article.querySelector("a[href*=\"activity:\"]")?.getAttribute("href") ?? "";
		const fromHref = updateHref.match(/activity[:%](\d+)/) ?? updateHref.match(/(\d{10,})/);
		if (fromHref?.[1]) return `li-href-${fromHref[1]}`;
		const ck = article.getAttribute("componentkey") ?? "";
		if (ck) return `li-ck-${hash(ck).slice(0, 16)}`;
		return `li-h-${hash(text)}`;
	}
	function clean(text) {
		return text.replace(/\s+/g, " ").trim();
	}
	function hash(text) {
		let h = 0;
		for (let i = 0; i < text.length; i += 1) h = h * 31 + text.charCodeAt(i) | 0;
		return String(Math.abs(h));
	}
	//#endregion
	//#region lib/tweet.ts
	var SHOW_MORE_RE = /^(Show more|Mostrar más|Mostrar mas)$/i;
	var MIN_TEXT = 4;
	var HARD_MEDIA_CHROME = "[data-testid=\"videoPlayer\"], [data-testid=\"videoComponent\"], [data-testid=\"tweetPhoto\"], [data-testid=\"card.layoutLarge.media\"], [data-testid=\"card.layoutSmall.media\"]";
	var SOFT_MEDIA_CHROME = "[data-testid=\"previewInterstitial\"], [data-testid=\"card.wrapper\"]";
	var MEDIA_CHROME = `${HARD_MEDIA_CHROME}, ${SOFT_MEDIA_CHROME}`;
	var PLAYER_OVERLAY_RE = /^(Original|AI|GIF|Play|Pause|Video|Live)$/i;
	var CAPTION_SEL = "div[lang], span[lang], div[dir=\"auto\"], span[dir=\"auto\"]";
	/** Own tweetText first; then lang/dir=auto caption; retweet shells fall back to nested. Never a node inside the player. */
	function findTweetTextEl(article) {
		for (const node of queryDeep(article, "[data-testid=\"tweetText\"]")) if (belongsToArticle(node, article) && usableText(node.textContent) && !inMediaChrome(node)) return node;
		for (const node of langCaptionNodes(article, false)) if (!inMediaChrome(node)) return node;
		for (const node of queryDeep(article, "[data-testid=\"tweetText\"]")) if (usableText(node.textContent) && !inMediaChrome(node)) return node;
		for (const node of langCaptionNodes(article, true)) if (!inMediaChrome(node)) return node;
		return labelledByNode(article, true);
	}
	function findActionBar(article) {
		for (const testid of [
			"reply",
			"retweet",
			"like"
		]) for (const el of queryDeep(article, `[data-testid="${testid}"]`)) {
			if (!belongsToArticle(el, article)) continue;
			const group = el.closest("[role=\"group\"]");
			if (group instanceof HTMLElement && belongsToArticle(group, article) && !group.querySelector("[data-testid=\"User-Name\"]")) return group;
			return el;
		}
		return null;
	}
	function langCaptionNodes(article, allowNested) {
		const out = [];
		for (const node of queryDeep(article, CAPTION_SEL)) {
			if (!allowNested && !belongsToArticle(node, article)) continue;
			if (node.closest("[data-testid=\"User-Name\"], [data-testid=\"socialContext\"]")) continue;
			if (inMediaChrome(node)) continue;
			if (node.getAttribute("data-testid") === "tweetText") continue;
			const t = cleanText(node.textContent);
			if (!t || SHOW_MORE_RE.test(t) || PLAYER_OVERLAY_RE.test(t) || t.length < MIN_TEXT) continue;
			out.push(node);
		}
		return out;
	}
	function labelledByNode(article, allowNested) {
		const ids = /* @__PURE__ */ new Set();
		const labelled = [article, ...queryDeep(article, "[aria-labelledby]")];
		for (const el of labelled) {
			if (!allowNested && el !== article && !belongsToArticle(el, article)) continue;
			for (const id of (el.getAttribute("aria-labelledby") ?? "").split(/\s+/)) if (id) ids.add(id);
		}
		let best = null;
		let bestLen = 0;
		for (const id of ids) {
			const node = article.querySelector(`[id="${id}"]`) ?? document.getElementById(id);
			if (!(node instanceof HTMLElement)) continue;
			if (!allowNested && !belongsToArticle(node, article)) continue;
			if (node.closest("[data-testid=\"User-Name\"], [data-testid=\"socialContext\"]")) continue;
			if (inMediaChrome(node)) continue;
			const t = cleanText(node.textContent);
			if (!usableText(t)) continue;
			if (t.length > bestLen) {
				best = node;
				bestLen = t.length;
			}
		}
		return best;
	}
	function belongsToArticle(node, article) {
		return tweetCardOwner(node) === article;
	}
	function tweetCardOwner(node) {
		let scope = node.closest("[data-testid=\"tweet\"]") ?? node.closest("[data-testid=\"cellInnerDiv\"]");
		while (scope) {
			if (scope.getAttribute("data-testid") === "tweet" && !isMediaHusk(scope)) return scope;
			if (scope.getAttribute("data-testid") === "cellInnerDiv" && realTweetCards(scope).length === 0) return scope;
			const parent = scope.parentElement;
			scope = parent ? parent.closest("[data-testid=\"tweet\"]") ?? parent.closest("[data-testid=\"cellInnerDiv\"]") : null;
		}
		const fallback = node.closest("[data-testid=\"tweet\"]") ?? node.closest("[data-testid=\"cellInnerDiv\"]");
		return fallback instanceof HTMLElement ? fallback : null;
	}
	function hasOwnAuthor(article) {
		for (const node of article.querySelectorAll("[data-testid=\"User-Name\"]")) {
			if (!(node instanceof HTMLElement)) continue;
			const owner = node.closest("[data-testid=\"tweet\"]");
			if (owner === article) return true;
			if (!owner && article.getAttribute("data-testid") === "cellInnerDiv") return true;
		}
		return false;
	}
	/** Inner [data-testid=tweet] wrappers around GIF/video — not a quoted post. Face-cam overlays sit inside the player and may carry User-Name. */
	function isMediaHusk(el) {
		if (el.getAttribute("data-testid") !== "tweet") return false;
		if (el.parentElement && el.closest(MEDIA_CHROME)) return true;
		return !hasOwnAuthor(el);
	}
	function cleanText(value) {
		return (value ?? "").replace(/\s+/g, " ").trim();
	}
	function usableText(value) {
		const t = cleanText(value);
		return t.length >= MIN_TEXT && !SHOW_MORE_RE.test(t) && !PLAYER_OVERLAY_RE.test(t);
	}
	function inMediaChrome(node) {
		if (node.closest(HARD_MEDIA_CHROME)) return true;
		if (node.closest(SOFT_MEDIA_CHROME) && !isSoftChromeCaption(node)) return true;
		let root = node.getRootNode();
		while (root.host instanceof Element) {
			if (root.host.matches(HARD_MEDIA_CHROME) || root.host.closest(HARD_MEDIA_CHROME)) return true;
			if ((root.host.matches(SOFT_MEDIA_CHROME) || root.host.closest(SOFT_MEDIA_CHROME)) && !isSoftChromeCaption(node)) return true;
			root = root.host.getRootNode();
		}
		return false;
	}
	function isSoftChromeCaption(node) {
		if (!usableText(node.textContent)) return false;
		return node.getAttribute("data-testid") === "tweetText" || node.matches(CAPTION_SEL);
	}
	function realTweetCards(root) {
		return queryDeep(root, "[data-testid=\"tweet\"]").filter((node) => !isMediaHusk(node));
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
		for (const row of article.querySelectorAll(`.${ROW_CLASS}`)) {
			if (!(row instanceof HTMLElement)) continue;
			if (belongsToArticle(row, article)) return row;
			const nestedOwner = row.parentElement?.closest("[data-slop-guard]");
			if (nestedOwner && nestedOwner !== article) continue;
			if (article.contains(row) && !row.closest("[data-testid=\"tweet\"]")) return row;
		}
		return null;
	}
	function ownOverlay(article) {
		for (const overlay of article.querySelectorAll(`.${OVERLAY_CLASS}`)) if (overlay instanceof HTMLElement && belongsToArticle(overlay, article)) return overlay;
		return null;
	}
	function insertBadgeRow(article, row) {
		const place = (target, where) => {
			if (!target) return false;
			target.insertAdjacentElement(where, row);
			if (!inMediaChrome(row)) return true;
			row.remove();
			return false;
		};
		const tweetText = findTweetTextEl(article);
		if (tweetText && belongsToArticle(tweetText, article) && !inMediaChrome(tweetText) && place(tweetText, "afterend")) return;
		if (place(findActionBar(article), "beforebegin")) return;
		if (place(queryDeep(article, "[data-testid=\"tweet\"]").find((node) => node !== article && !inMediaChrome(node)) ?? null, "afterend")) return;
		if (place(article.querySelector("[data-testid=\"tweetPhoto\"], [data-testid=\"videoPlayer\"], [data-testid=\"videoComponent\"], [data-testid=\"previewInterstitial\"], [data-testid=\"card.wrapper\"]"), "beforebegin")) return;
		if (article.hasAttribute("data-urn") || article.classList.contains("feed-shared-update-v2") || !!article.querySelector(".social-details-social-activity, .feed-shared-social-action-bar, .update-v2-social-activity")) {
			article.prepend(row);
			if (!inMediaChrome(row)) return;
			row.remove();
		}
		article.append(row);
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
				if (!item) {
					if (state === "pending") {
						const started = Number(article.dataset.slopPendingAt ?? 0);
						if (started && Date.now() - started > PENDING_MS && !inFlightArticles.has(article)) slopFeed.reset(article);
					}
					return;
				}
				if (article.dataset.slopId && article.dataset.slopId !== item.id) {
					slopFeed.reset(article);
					return;
				}
				if (state === "pending") {
					const started = Number(article.dataset.slopPendingAt ?? 0);
					if (started && Date.now() - started > PENDING_MS && !inFlightArticles.has(article)) slopFeed.reset(article);
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
	//#region entrypoints/linkedin-feed.content/index.ts
	var linkedin_feed_content_default = defineContentScript({
		matches: ["https://www.linkedin.com/*", "https://linkedin.com/*"],
		runAt: "document_idle",
		main(ctx) {
			chromeApi().runtime.onMessage.addListener((message, _sender, sendResponse) => {
				const type = message?.type;
				if (type === "PING" || type === "LI_STATUS") sendResponse(liStatus());
			});
			showLiProbe();
			const tick = window.setInterval(() => showLiProbe(), 2e3);
			ctx.onInvalidated(() => window.clearInterval(tick));
			runTimelineGuard(ctx, {
				listArticles: listLinkedInArticles,
				extract: extractLinkedInPost,
				undoKey: "slopGuard.undone.linkedin.v1",
				missingKeyMessage: "Slop Guard (LinkedIn): add your TypeSafe or OpenRouter API key in the extension popup."
			});
		}
	});
	function liStatus() {
		const cards = listLinkedInArticles();
		let ready = 0;
		for (const c of cards) if (extractLinkedInPost(c)) ready += 1;
		return {
			ok: true,
			live: true,
			cards: cards.length,
			ready
		};
	}
	function showLiProbe() {
		const { cards, ready } = liStatus();
		let bar = document.querySelector(".slop-guard-liprobe");
		if (!bar) {
			bar = document.createElement("div");
			bar.className = "slop-guard-liprobe slop-guard-modelbar";
			bar.style.cssText = "position:fixed;left:12px;bottom:40px;z-index:2147483646;padding:6px 10px;border-radius:999px;background:#553011;color:#fff;font:12px/1.3 system-ui,sans-serif;pointer-events:none;";
			document.body.append(bar);
		}
		bar.textContent = `Slop Guard LI · cards ${cards} · ready ${ready}`;
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
		return `${browser?.runtime?.id}:linkedin-feed:${eventName}`;
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
	//#region \0virtual:wxt-content-script-isolated-world-entrypoint?/Users/dverdu/Python_projects/jev-slop-detector/entrypoints/linkedin-feed.content/index.ts
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
			const { main, ...options } = linkedin_feed_content_default;
			return await main(new ContentScriptContext("linkedin-feed", options));
		} catch (err) {
			logger.error(`The content script "linkedin-feed" crashed on startup!`, err);
			throw err;
		}
	})();
})();
