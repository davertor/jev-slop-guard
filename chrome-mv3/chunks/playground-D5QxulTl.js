import { i as browser, n as loadSettings, s as sendRuntimeMessage, t as DEFAULT_SETTINGS } from "./settings-Ct9jgRFA.js";
//#region lib/tweet.ts
var STATUS_RE = /\/status\/(\d+)/;
var REPOST_RE = /reposted|retweeted|repost[oó]|reposte[oó]|reposti[oó]|retwitte[oó]|ha\s+retwitteado|ha\s+reposteado|retuite[oó]/i;
var SHOW_MORE_RE = /^(Show more|Mostrar más|Mostrar mas)$/i;
var SHOW_MORE_TAIL = /\s*(Show more|Mostrar más|Mostrar mas)\s*$/i;
var MIN_TEXT = 4;
function tweetIdFromHref(href) {
	return href.match(STATUS_RE)?.[1] ?? null;
}
function extractTweet(article) {
	if (isPromoted(article)) return null;
	const text = ownTweetText(article);
	if (text.length < MIN_TEXT) return null;
	const handle = ownHandle(article);
	return {
		id: ownTweetId(article) ?? syntheticId(handle, text),
		text: text.slice(0, 4e3),
		handle,
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
		if (isMediaHusk(article)) return false;
		const nested = nestedTweetCards(article).filter((card) => !isMediaHusk(card));
		if (nested.length === 0) return true;
		if (hasOwnTweetBody(article)) return true;
		return !nested.some((card) => extractTweet(card));
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
/** Own tweetText first; then lang-caption; retweet shells fall back to nested. */
function findTweetTextEl(article) {
	for (const node of queryDeep(article, "[data-testid=\"tweetText\"]")) if (belongsToArticle(node, article) && usableText(node.textContent)) return node;
	for (const node of langCaptionNodes(article, false)) return node;
	for (const node of queryDeep(article, "[data-testid=\"tweetText\"]")) if (usableText(node.textContent)) return node;
	for (const node of langCaptionNodes(article, true)) return node;
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
	return collectTweetText(article, false).length >= MIN_TEXT || collectFallbackText(article, false).length >= MIN_TEXT;
}
function ownTweetText(article) {
	const own = collectTweetText(article, false);
	if (own.length >= MIN_TEXT) return own;
	const ownFallback = collectFallbackText(article, false);
	if (ownFallback.length >= MIN_TEXT) return ownFallback;
	if (isRetweetCard(article) || nestedTweetCards(article).length > 0) {
		const nested = collectTweetText(article, true);
		if (nested.length >= MIN_TEXT) return nested;
		const nestedFallback = collectFallbackText(article, true);
		if (nestedFallback.length >= MIN_TEXT) return nestedFallback;
	}
	return own || ownFallback;
}
function collectTweetText(article, allowNested) {
	const parts = [];
	for (const node of queryDeep(article, "[data-testid=\"tweetText\"]")) {
		if (!allowNested && !belongsToArticle(node, article)) continue;
		const t = cleanText(node.textContent);
		if (SHOW_MORE_RE.test(t)) continue;
		if (allowNested) {
			if (t.length >= MIN_TEXT) return t;
			continue;
		}
		if (t) parts.push(t);
	}
	return parts.join("\n").trim();
}
function collectFallbackText(article, allowNested) {
	for (const link of queryDeep(article, "[data-testid=\"tweet-text-show-more-link\"]")) {
		if (!allowNested && !belongsToArticle(link, article)) continue;
		const t = cleanText((link.parentElement ?? link).textContent).replace(SHOW_MORE_TAIL, "").trim();
		if (t.length >= MIN_TEXT) return t;
	}
	const parts = [];
	for (const node of langCaptionNodes(article, allowNested)) parts.push(cleanText(node.textContent));
	parts.sort((a, b) => b.length - a.length);
	return parts[0] ?? "";
}
function langCaptionNodes(article, allowNested) {
	const out = [];
	for (const node of queryDeep(article, "div[lang], span[lang]")) {
		if (!allowNested && !belongsToArticle(node, article)) continue;
		if (node.closest("[data-testid=\"User-Name\"], [data-testid=\"socialContext\"], [role=\"group\"]")) continue;
		if (node.getAttribute("data-testid") === "tweetText") continue;
		const t = cleanText(node.textContent);
		if (!t || SHOW_MORE_RE.test(t) || t.length < MIN_TEXT) continue;
		out.push(node);
	}
	return out;
}
function ownTweetId(article) {
	return collectTweetId(article, false) ?? collectTweetId(article, true) ?? collectIdAround(article);
}
function collectTweetId(article, allowNested) {
	const timeLink = queryDeep(article, "time")[0]?.closest("a");
	if (timeLink && (allowNested || belongsToArticle(timeLink, article))) {
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
/** Media cards often move /status/:id to a cell overlay or a wrapping <a>. */
function collectIdAround(article) {
	const wrap = article.closest("a[href*=\"/status/\"]");
	if (wrap instanceof HTMLElement) {
		const id = tweetIdFromHref(wrap.getAttribute("href") ?? "");
		if (id) return id;
	}
	const scope = article.closest("[data-testid=\"cellInnerDiv\"]") ?? article.parentElement;
	if (!scope) return null;
	const timeLink = queryDeep(scope, "time")[0]?.closest("a");
	if (timeLink) {
		const id = tweetIdFromHref(timeLink.getAttribute("href") ?? "");
		if (id) return id;
	}
	for (const a of queryDeep(scope, "a[href*=\"/status/\"]")) {
		const id = tweetIdFromHref(a.getAttribute("href") ?? "");
		if (id) return id;
	}
	return null;
}
function ownHandle(article) {
	for (const a of queryDeep(article, "[data-testid=\"User-Name\"] a[href^=\"/\"]")) {
		if (!belongsToArticle(a, article)) continue;
		const handle = (a.getAttribute("href") ?? "").replace(/^\//, "").split("/")[0];
		if (handle && handle !== "i") return `@${handle}`;
	}
	for (const a of queryDeep(article, "[data-testid=\"User-Name\"] a[href^=\"/\"], a[href^=\"/\"]")) {
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
/** Inner [data-testid=tweet] wrappers around GIF/video — not a quoted post. */
function isMediaHusk(el) {
	return el.getAttribute("data-testid") === "tweet" && !hasOwnAuthor(el);
}
function cleanText(value) {
	return (value ?? "").replace(/\s+/g, " ").trim();
}
function usableText(value) {
	const t = cleanText(value);
	return t.length >= MIN_TEXT && !SHOW_MORE_RE.test(t);
}
function syntheticId(handle, text) {
	const who = handle.replace(/^@/, "") || "anon";
	let h = 0;
	for (let i = 0; i < text.length; i += 1) h = h * 31 + text.charCodeAt(i) | 0;
	return `x-${who}-${Math.abs(h)}`;
}
function nestedTweetCards(article) {
	return queryDeep(article, "[data-testid=\"tweet\"]").filter((node) => node !== article);
}
function realTweetCards(root) {
	return queryDeep(root, "[data-testid=\"tweet\"]").filter((node) => !isMediaHusk(node));
}
function articlesFromCells(root) {
	const out = [];
	for (const cell of queryDeep(root, "[data-testid=\"cellInnerDiv\"]")) {
		const real = realTweetCards(cell);
		if (real.length > 0) {
			out.push(...real);
			continue;
		}
		if (queryDeep(cell, "[data-testid=\"tweetText\"]").length > 0 || queryDeep(cell, "[data-testid=\"User-Name\"]").length > 0 || langCaptionNodes(cell, true).length > 0) out.push(cell);
	}
	return out;
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
//#region entrypoints/playground/main.ts
var FIXTURES = [
	{
		id: "1001",
		handle: "grindset",
		name: "Rise Daily",
		text: "Unleash your potential. The only limit is the one you set. Grind now, rest never. 🚀 #Mindset"
	},
	{
		id: "1002",
		handle: "maya",
		name: "Maya Chen",
		text: "The 4 train was stuck under the river for 22 minutes so I ate yesterday’s dumplings on the platform and they were somehow better cold."
	},
	{
		id: "1003",
		handle: "threadlord",
		name: "Growth Threads",
		text: "7 brutal truths about building in public (number 4 will surprise you):\n1. Consistency\n2. Value\n3. Audience\nReply YES if you want the rest."
	},
	{
		id: "1004",
		handle: "dev",
		name: "Ibrahim",
		text: "We shipped the retry queue last night. If you were seeing duplicate webhooks around 02:10 UTC, that was us; should be clean now."
	},
	{
		id: "1005",
		handle: "samu2kdotcom",
		name: "Samu 2k",
		text: "si gastas menos de 1200M de tokens mensuales te sale mas a cuenta OpenRouter que nan.builders.",
		repostedBy: "Joaquin Montesinos"
	}
];
var feed = document.querySelector("#feed");
var note = document.querySelector("#note");
feed.innerHTML = FIXTURES.map((tweet) => {
	const social = "repostedBy" in tweet && tweet.repostedBy ? `<div data-testid="socialContext">${escapeHtml(tweet.repostedBy)} repostó</div>` : "";
	return `
  <article data-testid="tweet" data-slop-id="${tweet.id}">
    ${social}
    <div data-testid="User-Name">
      <strong>${tweet.name}</strong>
      <a href="/${tweet.handle}">@${tweet.handle}</a>
    </div>
    <a href="/${tweet.handle}/status/${tweet.id}"><time datetime="2026-09-21">${tweet.id}</time></a>
    <div data-testid="tweetText">${escapeHtml(tweet.text)}</div>
  </article>
`;
}).join("");
run();
async function run() {
	const extension = hasExtensionApi();
	const settings = extension ? await loadSettings() : {
		...DEFAULT_SETTINGS,
		stampEnabled: true
	};
	note.textContent = extension ? settings.apiKey ? "Posts stay clean, then Jev labels them (same latency as the timeline)." : "No API key — each card should show set API key after the classifier returns NO_KEY." : "Opened outside the extension. Fixture labels after a short delay, then Show the post on stamped cards.";
	for (const article of listTweetArticles(feed)) {
		const tweet = FIXTURES.find((item) => item.id === article.dataset.slopId);
		if (!tweet) continue;
		if (!extension) {
			window.setTimeout(() => {
				applyVerdict(article, mockVerdict(tweet), settings, { onPutBack: (_id, card) => clearStamp(card) });
			}, 450);
			continue;
		}
		const result = await sendRuntimeMessage({
			type: "JUDGE_TWEET",
			tweet: {
				id: tweet.id,
				text: tweet.text,
				handle: `@${tweet.handle}`
			}
		});
		if (result.ok) {
			applyVerdict(article, result.verdict, settings, { onPutBack: (_id, card) => clearStamp(card) });
			continue;
		}
		markError(article, result.code === "NO_KEY" ? "set API key" : "jev error");
		const badge = article.querySelector(".slop-guard-badge");
		if (badge) badge.title = result.error;
	}
}
function mockVerdict(tweet) {
	const slop = tweet.id === "1001" || tweet.id === "1003";
	return {
		tweetId: tweet.id,
		label: slop ? "slop" : "not_slop",
		slopP: slop ? .92 : .11,
		notP: slop ? .08 : .89,
		model: "jev-latest"
	};
}
function hasExtensionApi() {
	try {
		return typeof browser !== "undefined" && Boolean(browser.runtime?.id);
	} catch {
		return false;
	}
}
function escapeHtml(value) {
	return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;");
}
//#endregion
