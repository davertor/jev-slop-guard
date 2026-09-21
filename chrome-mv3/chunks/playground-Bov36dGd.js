import { i as browser, n as loadSettings, s as sendRuntimeMessage, t as DEFAULT_SETTINGS } from "./settings-DB1zihqq.js";
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
function upsertBadge(article, text, tone, dot) {
	let row = article.querySelector(`.${ROW_CLASS}`);
	if (!row) {
		row = document.createElement("div");
		row.className = ROW_CLASS;
		const tweetText = [...article.querySelectorAll("[data-testid=\"tweetText\"]")].find((node) => node instanceof HTMLElement && (node.closest("article[data-testid=\"tweet\"]") ?? node.closest("[data-testid=\"cellInnerDiv\"]")) === article);
		if (tweetText) tweetText.insertAdjacentElement("afterend", row);
		else {
			const media = article.querySelector("[data-testid=\"tweetPhoto\"], [data-testid=\"videoPlayer\"], [data-testid=\"card.wrapper\"]");
			if (media) media.insertAdjacentElement("beforebegin", row);
			else article.append(row);
		}
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
//#region lib/tweet.ts
var REPOST_RE = /reposted|retweeted|repost[oó]|reposte[oó]|reposti[oó]|retwitte[oó]|ha\s+retwitteado/i;
/**
* Timeline cards, including retweets. If a card nests another tweet (quote),
* keep the parent when it has its own text; always keep leaves.
*/
function listTweetArticles(root = document) {
	let all = [...root.querySelectorAll("article[data-testid=\"tweet\"]")].filter((node) => node instanceof HTMLElement);
	if (all.length === 0) all = uniqueElements([...queryDeep(root, "article[data-testid=\"tweet\"]"), ...articlesFromCells(root)]);
	return all.filter((article) => {
		if (!article.querySelector("article[data-testid=\"tweet\"]")) return true;
		return ownTweetText(article).length >= 8;
	});
}
/** Match X socialContext blobs: "Name reposted" / Spanish "repostó" / "reposteó". */
function isRetweetContext(blob) {
	return REPOST_RE.test(blob);
}
function isRetweetCard(article) {
	const social = queryDeep(article, "[data-testid=\"socialContext\"]")[0];
	if (!social) return false;
	return isRetweetContext(social.textContent ?? "");
}
/** Text for this card (not nested quoted tweets). Falls back for retweet shells. */
function ownTweetText(article) {
	const parts = [];
	for (const node of queryDeep(article, "[data-testid=\"tweetText\"]")) {
		if (!belongsToArticle(node, article)) continue;
		const t = node.textContent?.replace(/\s+/g, " ").trim() ?? "";
		if (t) parts.push(t);
	}
	if (parts.length > 0) return parts.join("\n").trim();
	if (isRetweetCard(article)) for (const node of queryDeep(article, "[data-testid=\"tweetText\"]")) {
		const t = node.textContent?.replace(/\s+/g, " ").trim() ?? "";
		if (t.length >= 8) return t;
	}
	return "";
}
function belongsToArticle(node, article) {
	return (node.closest("article[data-testid=\"tweet\"]") ?? node.closest("[data-testid=\"cellInnerDiv\"]")) === article;
}
function articlesFromCells(root) {
	const out = [];
	for (const cell of queryDeep(root, "[data-testid=\"cellInnerDiv\"]")) {
		const nested = queryDeep(cell, "article[data-testid=\"tweet\"]");
		if (nested.length > 0) {
			out.push(...nested);
			continue;
		}
		if (queryDeep(cell, "[data-testid=\"tweetText\"]").length > 0) out.push(cell);
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
/** querySelectorAll plus one-level-or-deeper shadow roots (X sometimes wraps cells). */
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
	}
];
var feed = document.querySelector("#feed");
var note = document.querySelector("#note");
feed.innerHTML = FIXTURES.map((tweet) => `
  <article data-testid="tweet" data-slop-id="${tweet.id}">
    <div data-testid="User-Name">
      <strong>${tweet.name}</strong>
      <a href="/${tweet.handle}">@${tweet.handle}</a>
    </div>
    <a href="/${tweet.handle}/status/${tweet.id}"><time datetime="2026-09-21">${tweet.id}</time></a>
    <div data-testid="tweetText">${escapeHtml(tweet.text)}</div>
  </article>
`).join("");
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
