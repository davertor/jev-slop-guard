var background = (function() {
	//#region node_modules/.pnpm/wxt@0.21.4_esbuild@0.28.2_eslint@9.39.4_jiti@2.7.0_supports-color@7.2.0__rolldown@1.2.9_625403a819c950bf0584edb17f563f87/node_modules/wxt/dist/utils/define-background.mjs
	function defineBackground(arg) {
		if (arg == null || typeof arg === "function") return { main: arg };
		return arg;
	}
	//#endregion
	//#region node_modules/.pnpm/@typesafe-ai+sdk@0.6.0/node_modules/@typesafe-ai/sdk/dist/index.mjs
	var requestIdFrom = (headers) => headers.get("x-typesafe-request-id") ?? void 0;
	/**
	* A promise for the parsed result with access to the HTTP response.
	*
	* Non-2xx responses reject with an `APIError`, including through `asResponse()`.
	*/
	var APIPromise = class APIPromise extends Promise {
		#responsePromise;
		#parseResponse;
		#parsed;
		constructor(responsePromise, parseResponse) {
			super((resolve) => resolve(void 0));
			this.#responsePromise = responsePromise;
			this.#parseResponse = parseResponse;
		}
		/**
		* Resolves to the raw `Response` without parsing the body. SDK requests buffer the full
		* body under the request timeout before handoff; reading it afterwards is caller-owned.
		* The caller owns the body; don't also `await` the parsed result on the same promise.
		*/
		asResponse() {
			return this.#responsePromise;
		}
		/** Return the parsed result, HTTP response, and request ID. */
		async withResponse() {
			const [data, response] = await Promise.all([this.#parse(), this.#responsePromise]);
			return {
				data,
				response,
				requestId: requestIdFrom(response.headers)
			};
		}
		/** Transform the parsed result, sharing the HTTP response and a single body parse. */
		map(fn) {
			return new APIPromise(this.#responsePromise, () => this.#parse().then(fn));
		}
		#parse() {
			this.#parsed ??= this.#responsePromise.then(this.#parseResponse);
			return this.#parsed;
		}
		then(onfulfilled, onrejected) {
			return this.#parse().then(onfulfilled, onrejected);
		}
		catch(onrejected) {
			return this.#parse().catch(onrejected);
		}
		finally(onfinally) {
			return this.#parse().finally(onfinally);
		}
	};
	/** Environment variable names for client configuration. Explicit options take precedence. */
	var ENV = {
		/** Required API key; used when `apiKey` is omitted. */
		apiKey: "TYPESAFE_API_KEY",
		/** API root; defaults to `https://api.typesafe.ai`. */
		baseURL: "TYPESAFE_BASE_URL",
		/** Default model name; defaults to `jev-latest`. */
		defaultModel: "TYPESAFE_DEFAULT_MODEL",
		/** Log level; defaults to `warn`. */
		logLevel: "TYPESAFE_LOG_LEVEL"
	};
	/** Read a trimmed environment value, returning `undefined` for missing or blank values. */
	var readEnv = (name) => {
		if (typeof process === "undefined" || !process.env) return void 0;
		return process.env[name]?.trim() || void 0;
	};
	/** Return the explicit value, falling back to the environment. */
	var fromCodeOrEnv = (fromCode, envVar) => fromCode ?? readEnv(envVar);
	var range = (from, to) => Array.from({ length: to - from }, (_, i) => from + i);
	/** Default SDK retry policy. */
	var DEFAULT_RETRY_POLICY = {
		maxRetries: 2,
		backoffInitialMs: 500,
		backoffMaxMs: 5e3,
		backoffJitter: .25,
		/** HTTP 408, 429, and 5xx responses. */
		httpStatuses: /* @__PURE__ */ new Set([
			408,
			429,
			...range(500, 600)
		]),
		respectRetryAfter: true,
		/** Maximum server retry delay before falling back to backoff. */
		maxRetryAfterMs: 6e4,
		apiConnectionError: true,
		apiTimeoutError: true
	};
	DEFAULT_RETRY_POLICY.maxRetries;
	/** Whether the policy retries an HTTP status code. */
	var isRetryableStatus = (status, policy = DEFAULT_RETRY_POLICY) => policy.httpStatuses.has(status);
	/**
	* Parse `retry-after-ms` or `Retry-After` into milliseconds, preferring `retry-after-ms`.
	*
	* Return `undefined` when neither header contains a valid delay.
	*/
	var parseRetryAfter = (headers, now = Date.now()) => {
		const ms = Number(headers.get("retry-after-ms"));
		if (headers.has("retry-after-ms") && Number.isFinite(ms) && ms >= 0) return ms;
		const raw = headers.get("retry-after");
		if (raw === null) return void 0;
		const seconds = Number(raw);
		if (Number.isFinite(seconds)) return seconds >= 0 ? seconds * 1e3 : void 0;
		const date = Date.parse(raw);
		if (!Number.isNaN(date)) return Math.max(0, date - now);
	};
	/**
	* Calculate the delay in milliseconds for a zero-based retry attempt.
	*
	* Use an allowed server delay; otherwise use capped exponential backoff with jitter.
	*/
	var retryDelayMs = (attempt, headers, policy = DEFAULT_RETRY_POLICY, random = Math.random) => {
		if (policy.respectRetryAfter && headers !== void 0) {
			const retryAfter = parseRetryAfter(headers);
			if (retryAfter !== void 0 && retryAfter <= policy.maxRetryAfterMs) return retryAfter;
		}
		const exponential = Math.min(policy.backoffInitialMs * 2 ** attempt, policy.backoffMaxMs);
		return Math.round(exponential * (1 - random() * policy.backoffJitter));
	};
	/** Wait `ms` milliseconds, rejecting with `signal.reason` on cancellation. */
	var sleep = (ms, signal) => new Promise((resolve, reject) => {
		if (signal?.aborted) return reject(signal.reason);
		const onAbort = () => {
			clearTimeout(timer);
			reject(signal?.reason);
		};
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		signal?.addEventListener("abort", onAbort, { once: true });
	});
	/** Base class for SDK errors. */
	var TypeSafeError = class extends Error {
		constructor(message, options) {
			super(message, options);
			this.name = new.target.name;
		}
	};
	var isRecord = (value) => typeof value === "object" && value !== null;
	/** Extract a message from a text, error, or validation response body. */
	var extractMessage = (body) => {
		if (typeof body === "string") return body || void 0;
		if (!isRecord(body)) return void 0;
		const { error, message, detail } = body;
		if (typeof error === "string") return error;
		if (isRecord(error) && typeof error.message === "string") return error.message;
		if (typeof message === "string") return message;
		if (typeof detail === "string") return detail;
		if (isRecord(detail) && typeof detail.message === "string") return detail.message;
		if (Array.isArray(detail)) return describeValidationErrors(detail);
	};
	/** Format validation errors as semicolon-separated `path: message` entries. */
	var describeValidationErrors = (errors) => {
		const parts = errors.flatMap((e) => {
			if (!isRecord(e) || typeof e.msg !== "string") return [];
			const loc = Array.isArray(e.loc) ? e.loc.filter((x) => x !== "body").join(".") : "";
			return [loc ? `${loc}: ${e.msg}` : e.msg];
		});
		return parts.length > 0 ? parts.join("; ") : void 0;
	};
	var MAX_RAW_BODY_IN_MESSAGE = 200;
	/** An unsuccessful HTTP response from the API. */
	var APIError = class APIError extends TypeSafeError {
		/** HTTP response status code. */
		status;
		/** HTTP response headers. */
		headers;
		/** Parsed JSON, response text, or `undefined` for an empty body. */
		body;
		/** Request ID from `x-typesafe-request-id`, or `undefined` when absent. */
		requestId;
		constructor(status, body, headers, message) {
			super(message ?? APIError.describe(status, body));
			this.status = status;
			this.body = body;
			this.headers = headers;
			this.requestId = requestIdFrom(headers);
		}
		static describe(status, body) {
			const detail = extractMessage(body);
			if (detail) return `${status} ${detail}`;
			if (body === void 0) return `${status} status code (no body)`;
			const raw = typeof body === "string" ? body : JSON.stringify(body);
			return `${status} ${raw.length > MAX_RAW_BODY_IN_MESSAGE ? `${raw.slice(0, MAX_RAW_BODY_IN_MESSAGE)}…` : raw}`;
		}
		/** Create the error subclass for an HTTP status code. */
		static fromResponse(status, body, headers) {
			if (status === 400) return new BadRequestError(status, body, headers);
			if (status === 401) return new AuthenticationError(status, body, headers);
			if (status === 403) return new PermissionDeniedError(status, body, headers);
			if (status === 404) return new NotFoundError(status, body, headers);
			if (status === 422) return new UnprocessableEntityError(status, body, headers);
			if (status === 429) return new RateLimitError(status, body, headers);
			if (status >= 500) return new InternalServerError(status, body, headers);
			return new APIError(status, body, headers);
		}
	};
	/** HTTP 400: the request is invalid. */
	var BadRequestError = class extends APIError {};
	/** HTTP 401: authentication failed. */
	var AuthenticationError = class extends APIError {};
	/** HTTP 403: access is denied. */
	var PermissionDeniedError = class extends APIError {};
	/** HTTP 404: the resource was not found. */
	var NotFoundError = class extends APIError {};
	/** HTTP 422: request validation failed. */
	var UnprocessableEntityError = class extends APIError {};
	/** HTTP 429: the rate limit was exceeded. */
	var RateLimitError = class extends APIError {
		/** Server retry delay in milliseconds, or `undefined` when absent or invalid. */
		retryAfterMs = parseRetryAfter(this.headers);
	};
	/** HTTP 5xx: the server failed to handle the request. */
	var InternalServerError = class extends APIError {};
	/** The request or response-body delivery failed (DNS, TLS, connection closed, etc.). */
	var APIConnectionError = class extends TypeSafeError {
		constructor(message = "Connection error.", options) {
			super(message, options);
		}
	};
	/** The full response did not arrive within the timeout. A kind of `APIConnectionError`. */
	var APITimeoutError = class extends APIConnectionError {
		/** Configured timeout in milliseconds. */
		timeoutMs;
		constructor(timeoutMs, options) {
			super(`Request timed out after ${timeoutMs}ms.`, options);
			this.timeoutMs = timeoutMs;
		}
	};
	/** The caller cancelled the request through an `AbortSignal`. */
	var APIUserAbortError = class extends TypeSafeError {
		constructor(message = "Request was aborted.", options) {
			super(message, options);
		}
	};
	/** Supported log levels, from most to least verbose. */
	var LOG_LEVELS = [
		"debug",
		"info",
		"warn",
		"error",
		"off"
	];
	var DEFAULT_LOG_LEVEL = "warn";
	var isLogLevel = (value) => LOG_LEVELS.includes(value);
	/** Validate a configured log level, throwing `TypeSafeError` for unknown values. */
	var parseLogLevel = (value, source) => {
		if (isLogLevel(value)) return value;
		throw new TypeSafeError(`Invalid log level "${value}" from ${source}. Expected one of: ${LOG_LEVELS.join(", ")}.`);
	};
	var PREFIX = "[typesafe-sdk]";
	/** Default console logger with the `[typesafe-sdk]` prefix. */
	var consoleLogger = {
		debug: (message, ...args) => console.debug(`${PREFIX} ${message}`, ...args),
		info: (message, ...args) => console.info(`${PREFIX} ${message}`, ...args),
		warn: (message, ...args) => console.warn(`${PREFIX} ${message}`, ...args),
		error: (message, ...args) => console.error(`${PREFIX} ${message}`, ...args)
	};
	var RANK = {
		debug: 0,
		info: 1,
		warn: 2,
		error: 3,
		off: 4
	};
	var drop = () => {};
	/** Filter logger calls to the configured level and above. */
	var withLevel = (sink, level) => {
		const enabled = (at) => RANK[at] >= RANK[level];
		return {
			debug: enabled("debug") ? (message, ...args) => sink.debug(message, ...args) : drop,
			info: enabled("info") ? (message, ...args) => sink.info(message, ...args) : drop,
			warn: enabled("warn") ? (message, ...args) => sink.warn(message, ...args) : drop,
			error: enabled("error") ? (message, ...args) => sink.error(message, ...args) : drop
		};
	};
	/** Credential headers that retain a key suffix for identification. */
	var KEY_HEADERS = /* @__PURE__ */ new Set([
		"authorization",
		"proxy-authorization",
		"x-api-key"
	]);
	/** Headers whose values are redacted in full. */
	var OPAQUE_HEADERS = /* @__PURE__ */ new Set(["cookie", "set-cookie"]);
	/** Mask a key, preserving its scheme and the last four characters of secrets longer than eight. */
	var redactKey = (value) => {
		const [scheme, secret] = value.includes(" ") ? value.split(/\s+/, 2) : [void 0, value];
		const tail = secret && secret.length > 8 ? secret.slice(-4) : "";
		return `${scheme ? `${scheme} ` : ""}***${tail}`;
	};
	var redact = (name, value) => {
		const lower = name.toLowerCase();
		if (KEY_HEADERS.has(lower)) return redactKey(value);
		if (OPAQUE_HEADERS.has(lower)) return "***";
		return value;
	};
	/** Copy headers with known credential values redacted. */
	var redactHeaders = (headers) => Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, redact(name, value)]));
	/**
	* Create a question that selects between named alternatives.
	*
	* @param instructions - The question as text, a JSON object or array, or `null`.
	* @param criteria - Labels mapped to descriptions, or `null` for undescribed labels.
	*/
	var choice = (instructions, criteria) => {
		if (Array.isArray(criteria)) throw new TypeSafeError("Choice criteria must be a map of labels to descriptions, not a list.");
		return {
			type: "choice",
			instructions,
			criteria
		};
	};
	/** Reject empty question sets and score questions without a list of at least two criteria. */
	var validateQuestions = (questions) => {
		if (Object.keys(questions).length === 0) throw new TypeSafeError("At least one question is required.");
		for (const [name, question] of Object.entries(questions)) {
			if (question.type !== "score") continue;
			if (!Array.isArray(question.criteria)) throw new TypeSafeError(`Score question "${name}" has criteria that are not a list; score criteria must be a list of descriptions indexed by score from zero.`);
			if (question.criteria.length < 2) throw new TypeSafeError(`Score question "${name}" has ${question.criteria.length} criteria; at least two scores are required.`);
		}
	};
	/** Access to the Models API resource. */
	var Models = class {
		#transport;
		constructor(transport) {
			this.#transport = transport;
		}
		/** List the models available to the account. */
		list(options = {}) {
			return this.#transport.request("GET", "/v1/models", options).map(unwrapModels);
		}
	};
	var unwrapModels = (wire) => {
		if (Array.isArray(wire?.models)) return wire.models;
		throw new TypeSafeError("Unexpected response shape from GET /v1/models; expected { models: [...] }.");
	};
	var g = globalThis;
	/** Whether browser page globals are present. */
	var isBrowser = () => typeof g.window !== "undefined" && typeof g.window.document !== "undefined" && typeof g.navigator !== "undefined";
	/** Runtime name, version, and platform for the `X-TypeSafe-Runtime` header. */
	var describeRuntime = () => {
		const platform = g.process?.platform && g.process?.arch ? ` (${g.process.platform}; ${g.process.arch})` : "";
		if (g.Bun?.version) return `bun/${g.Bun.version}${platform}`;
		if (g.Deno?.version?.deno) return `deno/${g.Deno.version.deno}${platform}`;
		if (g.EdgeRuntime !== void 0) return "vercel-edge";
		if (g.navigator?.userAgent === "Cloudflare-Workers") return "cloudflare-workers";
		if (g.process?.versions?.node) return `node/${g.process.versions.node}${platform}`;
		if (isBrowser()) return "browser";
		return "unknown";
	};
	var VERSION = "0.6.0";
	var missingApiKey = () => {
		throw new TypeSafeError(`No API key was provided. Pass \`apiKey\` to the TypeSafeClient constructor or set the ${ENV.apiKey} environment variable.`);
	};
	var missingFetch = () => {
		throw new TypeSafeError("No global `fetch` is available in this runtime. Pass a `fetch` implementation to the TypeSafeClient constructor.");
	};
	var refuseBrowser = () => {
		throw new TypeSafeError("TypeSafeClient is running in a browser, which would expose your API key to anyone using the page. Call the API from a server instead, or pass `dangerouslyAllowBrowser: true` if you understand the risk.");
	};
	/** Call global `fetch` with its required receiver in browsers. */
	var defaultFetch = (input, init) => globalThis.fetch(input, init);
	var assertNonNegativeInteger = (name, value) => {
		if (!Number.isInteger(value) || value < 0) throw new TypeSafeError(`\`${name}\` must be a non-negative integer, got ${String(value)}.`);
		return value;
	};
	var assertPositiveMs = (name, value) => {
		if (!Number.isFinite(value) || value <= 0) throw new TypeSafeError(`\`${name}\` must be a positive number of milliseconds, got ${String(value)}.`);
		return value;
	};
	var assertNonNegativeMs = (name, value) => {
		if (!Number.isFinite(value) || value < 0) throw new TypeSafeError(`\`${name}\` must be a non-negative number of milliseconds, got ${String(value)}.`);
		return value;
	};
	var assertFraction = (name, value) => {
		if (!Number.isFinite(value) || value < 0 || value > 1) throw new TypeSafeError(`\`${name}\` must be between 0 and 1, got ${String(value)}.`);
		return value;
	};
	var assertStatusSet = (name, statuses) => {
		for (const status of statuses) if (!Number.isInteger(status) || status < 100 || status > 999) throw new TypeSafeError(`\`${name}\` must contain HTTP status codes, got ${String(status)}.`);
		return statuses;
	};
	/** Merge and validate retry overrides, copying the status set to isolate later mutations. */
	var resolveRetryPolicy = (base, overrides) => {
		const o = overrides ?? {};
		return {
			maxRetries: o.maxRetries === void 0 ? base.maxRetries : assertNonNegativeInteger("retry.maxRetries", o.maxRetries),
			backoffInitialMs: o.backoffInitialMs === void 0 ? base.backoffInitialMs : assertNonNegativeMs("retry.backoffInitialMs", o.backoffInitialMs),
			backoffMaxMs: o.backoffMaxMs === void 0 ? base.backoffMaxMs : assertNonNegativeMs("retry.backoffMaxMs", o.backoffMaxMs),
			backoffJitter: o.backoffJitter === void 0 ? base.backoffJitter : assertFraction("retry.backoffJitter", o.backoffJitter),
			httpStatuses: new Set(o.httpStatuses === void 0 ? base.httpStatuses : assertStatusSet("retry.httpStatuses", o.httpStatuses)),
			respectRetryAfter: o.respectRetryAfter ?? base.respectRetryAfter,
			maxRetryAfterMs: o.maxRetryAfterMs === void 0 ? base.maxRetryAfterMs : assertNonNegativeMs("retry.maxRetryAfterMs", o.maxRetryAfterMs),
			apiConnectionError: o.apiConnectionError ?? base.apiConnectionError,
			apiTimeoutError: o.apiTimeoutError ?? base.apiTimeoutError
		};
	};
	/** Whether the policy retries a connection error or timeout. */
	var isRetryableError = (err, policy) => {
		if (err instanceof APITimeoutError) return policy.apiTimeoutError;
		if (err instanceof APIConnectionError) return policy.apiConnectionError;
		return false;
	};
	/** Resolve and validate the log level from configuration or the environment. */
	var resolveLogLevel = (fromCode) => {
		if (fromCode !== void 0) return parseLogLevel(fromCode, "the `logLevel` option");
		const fromEnv = readEnv(ENV.logLevel);
		if (fromEnv !== void 0) return parseLogLevel(fromEnv, ENV.logLevel);
		return DEFAULT_LOG_LEVEL;
	};
	var stripTrailingSlashes = (url) => url.replace(/\/+$/, "");
	/** Last value wins regardless of casing; undefined removes a protected header. */
	var mergeHeaders = (...sources) => {
		const entries = /* @__PURE__ */ new Map();
		for (const source of sources) for (const [name, value] of Object.entries(source)) if (value === void 0) entries.delete(name.toLowerCase());
		else entries.set(name.toLowerCase(), [name, value]);
		return Object.fromEntries(entries.values());
	};
	/** Drain a clone so the original response retains its metadata and a readable, buffered body. */
	var bufferResponse = async (response, signal) => {
		const reader = response.clone().body?.getReader();
		if (!reader) return;
		const cancel = () => {
			reader.cancel(signal.reason).catch(() => {});
			response.body?.cancel(signal.reason).catch(() => {});
		};
		signal.addEventListener("abort", cancel, { once: true });
		try {
			if (signal.aborted) cancel();
			signal.throwIfAborted();
			while (!(await reader.read()).done) signal.throwIfAborted();
			signal.throwIfAborted();
		} finally {
			signal.removeEventListener("abort", cancel);
			reader.releaseLock();
		}
	};
	/** Runtime description cached for the process lifetime. */
	var RUNTIME = describeRuntime();
	/** Client for the TypeSafe AI API. */
	var TypeSafeClient = class {
		/** API key excluded from serialization and public properties. */
		#apiKey;
		/** API root with trailing slashes removed. */
		baseURL;
		/** Model used when a request omits `model`. */
		defaultModel;
		/** Configured log verbosity. */
		logLevel;
		/** The configured logger, filtered to `logLevel`. */
		logger;
		/** Retry settings with constructor overrides applied. */
		retry;
		/** Timeout per attempt in milliseconds. */
		timeout;
		/** Additional headers sent with each request. */
		defaultHeaders;
		/** HTTP fetch implementation. */
		fetch;
		/** The models available to the account. */
		models;
		#requestCount = 0;
		/**
		* Create a client for the TypeSafe AI API.
		*
		* Explicit options take precedence over environment variables, then SDK defaults.
		* Empty or whitespace-only environment values are ignored.
		*
		* @throws {TypeSafeError} The API key is missing, configuration is invalid, or the runtime is unsupported.
		*/
		constructor(config = {}) {
			if (isBrowser() && !config.dangerouslyAllowBrowser) refuseBrowser();
			this.#apiKey = fromCodeOrEnv(config.apiKey, ENV.apiKey) ?? missingApiKey();
			this.baseURL = stripTrailingSlashes(fromCodeOrEnv(config.baseURL, ENV.baseURL) ?? "https://api.typesafe.ai");
			this.defaultModel = fromCodeOrEnv(config.defaultModel, ENV.defaultModel) ?? "jev-latest";
			this.logLevel = resolveLogLevel(config.logLevel);
			this.logger = withLevel(config.logger ?? consoleLogger, this.logLevel);
			this.retry = resolveRetryPolicy(DEFAULT_RETRY_POLICY, config.retry);
			this.timeout = assertPositiveMs("timeout", config.timeout ?? 1e4);
			this.defaultHeaders = { ...config.defaultHeaders };
			if (config.fetch === void 0 && typeof globalThis.fetch !== "function") missingFetch();
			this.fetch = config.fetch ?? defaultFetch;
			const transport = {
				request: (method, path, options) => this.#request(method, path, options),
				defaultModel: this.defaultModel
			};
			this.models = new Models(transport);
		}
		/**
		* Answer named questions about text or structured state.
		*
		* @param request - State, questions, and an optional model override.
		* @param options - Per-call timeout, retry, headers, and cancellation settings.
		* @returns Answers typed by question name and criteria, with model and token usage.
		* @throws {TypeSafeError} Questions are empty, or score criteria are not a list of at least two entries.
		* @throws {APIError} The server returns a non-2xx response after retries.
		* @throws {APIConnectionError} The request cannot connect or times out after retries.
		* @throws {APIUserAbortError} The caller aborts the request.
		*
		* @example
		* ```ts
		* const { answers } = await client.systemOne({
		*   state: "I was charged twice. Please help.",
		*   questions: { billing: noul("Is this about billing?") },
		* });
		* console.log(answers.billing.noul);
		* ```
		*/
		systemOne(request, options = {}) {
			validateQuestions(request.questions);
			const body = {
				...request,
				model: request.model ?? this.defaultModel
			};
			return this.#request("POST", "/v1/systemone", {
				...options,
				body
			});
		}
		/** Send a request and parse its response body. */
		#request(method, path, options = {}) {
			const resolved = {
				method,
				path,
				body: options.body,
				headers: mergeHeaders(this.defaultHeaders, options.headers ?? {}),
				signal: options.signal,
				timeout: options.timeout === void 0 ? this.timeout : assertPositiveMs("timeout", options.timeout),
				retry: resolveRetryPolicy(this.retry, options.retry)
			};
			const tag = `#${++this.#requestCount} ${method} ${path}`;
			return new APIPromise(this.fetchWithRetries(tag, resolved), async (res) => {
				const parsed = await parseBody(res);
				this.logger.debug(`${tag} <- body`, parsed);
				return parsed;
			});
		}
		/** Retry eligible failures, logging attempt summaries at `info` and headers and bodies at `debug`. */
		async fetchWithRetries(tag, req) {
			const url = `${this.baseURL}${req.path}`;
			const headers = mergeHeaders(req.headers, {
				Authorization: `Bearer ${this.#apiKey}`,
				Accept: "application/json",
				"User-Agent": `typesafe-sdk/${VERSION}`,
				"X-TypeSafe-SDK": `typesafe-sdk/${VERSION}`,
				"X-TypeSafe-Runtime": RUNTIME,
				"Content-Type": req.body === void 0 ? void 0 : "application/json",
				"X-TypeSafe-Retry-Count": void 0
			});
			const body = req.body === void 0 ? void 0 : JSON.stringify(req.body);
			for (let attempt = 0;; attempt++) {
				const retriesLeft = req.retry.maxRetries - attempt;
				const attemptHeaders = attempt === 0 ? headers : {
					...headers,
					"X-TypeSafe-Retry-Count": String(attempt)
				};
				this.logger.debug(`${tag} -> ${url}`, {
					headers: redactHeaders(attemptHeaders),
					body: req.body
				});
				const started = Date.now();
				let res;
				try {
					res = await this.attempt(tag, url, {
						method: req.method,
						headers: attemptHeaders,
						body
					}, req);
				} catch (err) {
					if (err instanceof APIUserAbortError || retriesLeft <= 0) throw err;
					if (!isRetryableError(err, req.retry)) throw err;
					await this.backOff(tag, attempt, retriesLeft, err.message, void 0, req);
					continue;
				}
				const requestId = requestIdFrom(res.headers);
				this.logger.info(`${tag} <- ${res.status} in ${Date.now() - started}ms${requestId ? ` (request ${requestId})` : ""}`);
				if (res.ok) return res;
				const errorBody = await parseBody(res);
				this.logger.debug(`${tag} <- error body`, errorBody);
				const error = APIError.fromResponse(res.status, errorBody, res.headers);
				if (retriesLeft <= 0 || !isRetryableStatus(res.status, req.retry)) throw error;
				await this.backOff(tag, attempt, retriesLeft, `${res.status}`, res.headers, req);
			}
		}
		/**
		* One HTTP round trip, including body delivery, with a timeout. The caller's signal and our
		* timer both abort the same controller; we check which fired to choose the error class.
		*/
		async attempt(tag, url, init, { signal, timeout }) {
			const controller = new AbortController();
			const abortFromCaller = () => controller.abort(signal?.reason);
			if (signal?.aborted) abortFromCaller();
			signal?.addEventListener("abort", abortFromCaller, { once: true });
			let timedOut = false;
			const timer = setTimeout(() => {
				timedOut = true;
				controller.abort();
			}, timeout);
			const started = Date.now();
			const elapsed = () => `${Date.now() - started}ms`;
			try {
				const response = await this.fetch(url, {
					...init,
					signal: controller.signal
				});
				await bufferResponse(response, controller.signal);
				return response;
			} catch (err) {
				if (signal?.aborted) {
					this.logger.info(`${tag} aborted by caller after ${elapsed()}`);
					throw new APIUserAbortError(void 0, { cause: err });
				}
				if (timedOut) {
					this.logger.info(`${tag} timed out after ${elapsed()}`);
					throw new APITimeoutError(timeout, { cause: err });
				}
				this.logger.info(`${tag} connection error after ${elapsed()}`, err);
				throw new APIConnectionError(err instanceof Error ? `Connection error: ${err.message}` : void 0, { cause: err });
			} finally {
				clearTimeout(timer);
				signal?.removeEventListener("abort", abortFromCaller);
			}
		}
		/** Wait before retrying; caller cancellation throws `APIUserAbortError`. */
		async backOff(tag, attempt, retriesLeft, reason, headers, { retry, signal }) {
			const delay = retryDelayMs(attempt, headers, retry);
			const nth = attempt + 1;
			const total = attempt + retriesLeft;
			this.logger.info(`${tag} retrying in ${delay}ms (retry ${nth}/${total}) after ${reason}`);
			try {
				await sleep(delay, signal);
			} catch (err) {
				this.logger.info(`${tag} aborted by caller while waiting to retry`);
				throw new APIUserAbortError(void 0, { cause: err });
			}
		}
	};
	var parseBody = async (res) => {
		const text = await res.text();
		if (text.length === 0) return void 0;
		if ((res.headers.get("content-type") ?? "").includes("application/json")) try {
			return JSON.parse(text);
		} catch {
			return text;
		}
		try {
			return JSON.parse(text);
		} catch {
			return text;
		}
	};
	//#endregion
	//#region lib/jev.ts
	var OPENROUTER_URL = "https://openrouter.ai/api/alpha/decisions";
	var SLOP_CHOICE = choice("Classify whether this social post is low-value slop. Judge the writing and intent, not the topic. Prefer not_slop when the post clearly adds something specific or authorship is unclear.", {
		slop: "Noise, clickbait, or empty daily content: engagement bait; rage/curiosity hooks with no payoff; recycled “content for content’s sake”; templated or LLM-generic hustle/motivation; fake expertise without specifics; shiny prose with no lived detail or new information.",
		not_slop: "Brings something real: concrete detail, a personal take, a genuine question, humor with specificity, technical substance, news with substance, or authorship is simply unclear — polished or promotional alone is not enough to call it slop."
	});
	function typesafeModel(settings) {
		return settings.model === "jev-1.13.0" ? "jev-1.13.0" : "jev-latest";
	}
	function openrouterModel(settings) {
		return settings.model === "jev-1.13.0" ? "typesafe/jev-1.13" : "~typesafe/jev-latest";
	}
	function parseChoiceAnswer(tweetId, model, answer) {
		const slopP = typeof answer.probabilities?.slop === "number" ? answer.probabilities.slop : answer.choice === "slop" ? answer.confidence ?? 0 : 1 - (answer.confidence ?? 0);
		const notP = typeof answer.probabilities?.not_slop === "number" ? answer.probabilities.not_slop : 1 - slopP;
		return {
			tweetId,
			label: answer.choice === "slop" || answer.choice === "not_slop" ? answer.choice : slopP >= .5 ? "slop" : "not_slop",
			slopP,
			notP,
			model: model.trim() || "jev-latest"
		};
	}
	async function callJev(tweet, settings, fetchImpl) {
		if (settings.provider === "openrouter") return callOpenRouter(tweet, settings, fetchImpl ?? fetch);
		const response = await new TypeSafeClient({
			apiKey: settings.apiKey.trim(),
			defaultModel: typesafeModel(settings),
			dangerouslyAllowBrowser: true,
			...fetchImpl ? { fetch: fetchImpl } : {}
		}).systemOne({
			state: {
				handle: tweet.handle,
				text: tweet.text
			},
			questions: { verdict: SLOP_CHOICE }
		});
		return parseChoiceAnswer(tweet.id, response.model, response.answers.verdict);
	}
	async function callOpenRouter(tweet, settings, fetchImpl) {
		const res = await fetchImpl(OPENROUTER_URL, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${settings.apiKey.trim()}`,
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				model: openrouterModel(settings),
				state: {
					handle: tweet.handle,
					text: tweet.text
				},
				questions: { verdict: SLOP_CHOICE }
			})
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok) throw new Error(data.error?.message ?? data.detail ?? `Jev HTTP ${res.status}`);
		if (!data.answers?.verdict) throw new Error("Jev returned an incomplete answers object");
		return parseChoiceAnswer(tweet.id, typeof data.model === "string" ? data.model : "jev-latest", data.answers.verdict);
	}
	//#endregion
	//#region lib/chrome-msg.ts
	function chromeApi() {
		const root = globalThis;
		const api = root.chrome?.runtime ? root.chrome : root.browser;
		if (!api?.runtime) throw new Error("chrome extension API unavailable");
		return api;
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
	//#region lib/messages.ts
	function isInjectXMessage(value) {
		if (!value || typeof value !== "object") return false;
		const msg = value;
		return msg.type === "INJECT_X" && typeof msg.tabId === "number";
	}
	function isJudgeTweetMessage(value) {
		if (!value || typeof value !== "object") return false;
		const msg = value;
		return msg.type === "JUDGE_TWEET" && !!msg.tweet && typeof msg.tweet.id === "string" && typeof msg.tweet.text === "string";
	}
	//#endregion
	//#region lib/queue.ts
	function createLimiter(max) {
		let active = 0;
		const waiting = [];
		const pump = () => {
			while (active < max && waiting.length > 0) {
				const start = waiting.shift();
				if (!start) return;
				active += 1;
				start();
			}
		};
		return async function run(fn) {
			await new Promise((resolve) => {
				waiting.push(resolve);
				pump();
			});
			try {
				return await fn();
			} finally {
				active -= 1;
				pump();
			}
		};
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
	//#region lib/x-inject.ts
	var X_JS = "content-scripts/x-timeline.js";
	var X_CSS = "content-scripts/x-timeline.css";
	var X_QUERY = [
		"https://x.com/*",
		"https://www.x.com/*",
		"https://twitter.com/*",
		"https://www.twitter.com/*"
	];
	async function pingXStatus(tabId) {
		try {
			const result = await sendTabMessage(tabId, { type: "X_STATUS" });
			return result?.ok && result.live ? result : null;
		} catch {
			return null;
		}
	}
	async function injectXTimeline(tabId) {
		const api = chromeApi();
		try {
			await api.scripting.insertCSS({
				target: { tabId },
				files: [X_CSS]
			});
		} catch {}
		await api.scripting.executeScript({
			target: { tabId },
			files: [X_JS]
		});
	}
	/** Ping the content script; inject the bundled X file if the tab has no receiver. */
	async function ensureXTimeline(tabId) {
		const existing = await pingXStatus(tabId);
		if (existing) return existing;
		try {
			await injectXTimeline(tabId);
		} catch (err) {
			return {
				ok: false,
				error: err instanceof Error ? err.message : String(err)
			};
		}
		return await pingXStatus(tabId) ?? {
			ok: false,
			error: "Injected, but X script did not answer."
		};
	}
	async function injectAllXTabs() {
		const tabs = await chromeApi().tabs.query({ url: X_QUERY });
		for (const tab of tabs) if (typeof tab.id === "number" && isXUrl(tab.url)) ensureXTimeline(tab.id);
	}
	function watchXTabs() {
		const api = chromeApi();
		api.tabs.onUpdated.addListener((tabId, info, tab) => {
			if (info.status !== "complete") return;
			if (!isXUrl(tab.url)) return;
			ensureXTimeline(tabId);
		});
		api.runtime.onInstalled.addListener(() => {
			injectAllXTabs();
		});
		api.runtime.onStartup.addListener(() => {
			injectAllXTabs();
		});
	}
	//#endregion
	//#region entrypoints/background.ts
	var CACHE_KEY = "slopGuard.cache.v2";
	var CACHE_LIMIT = 400;
	var limit = createLimiter(3);
	var memory = /* @__PURE__ */ new Map();
	var inflight = /* @__PURE__ */ new Map();
	var background_default = defineBackground(() => {
		hydrateCache();
		watchXTabs();
		chromeApi().runtime.onMessage.addListener((message, _sender, sendResponse) => {
			const msg = message;
			if (msg.type === "PING") {
				sendResponse({ ok: true });
				return;
			}
			if (msg.type === "GET_SETTINGS") {
				loadSettings().then((settings) => ({
					ok: true,
					settings
				})).then(sendResponse).catch((err) => {
					sendResponse({
						ok: false,
						error: err instanceof Error ? err.message : String(err)
					});
				});
				return true;
			}
			if (isJudgeTweetMessage(msg)) {
				judge(msg.tweet).then(sendResponse).catch((err) => {
					sendResponse({
						ok: false,
						code: "JEV",
						error: err instanceof Error ? err.message : "Jev request failed"
					});
				});
				return true;
			}
			if (isInjectXMessage(msg)) {
				ensureXTimeline(msg.tabId).then((result) => {
					sendResponse(result.ok ? { ok: true } : {
						ok: false,
						error: result.error
					});
				}).catch((err) => {
					sendResponse({
						ok: false,
						error: err instanceof Error ? err.message : String(err)
					});
				});
				return true;
			}
		});
	});
	async function hydrateCache() {
		const raw = (await chromeApi().storage.session.get(CACHE_KEY))[CACHE_KEY];
		if (!raw || typeof raw !== "object") return;
		for (const [id, verdict] of Object.entries(raw)) if (verdict && typeof verdict.slopP === "number") memory.set(id, verdict);
	}
	async function persistCache() {
		const dump = {};
		for (const [id, verdict] of memory) dump[id] = verdict;
		await chromeApi().storage.session.set({ [CACHE_KEY]: dump });
	}
	function remember(verdict) {
		memory.set(verdict.tweetId, verdict);
		if (memory.size <= CACHE_LIMIT) {
			persistCache();
			return;
		}
		const extra = memory.size - CACHE_LIMIT;
		const keys = memory.keys();
		for (let i = 0; i < extra; i += 1) {
			const key = keys.next().value;
			if (typeof key === "string") memory.delete(key);
		}
		persistCache();
	}
	async function judge(tweet) {
		const cached = memory.get(tweet.id);
		if (cached) return {
			ok: true,
			verdict: cached
		};
		const existing = inflight.get(tweet.id);
		if (existing) return existing;
		const job = limit(async () => {
			const again = memory.get(tweet.id);
			if (again) return {
				ok: true,
				verdict: again
			};
			const settings = await loadSettings();
			if (settings.paused) return {
				ok: false,
				code: "PAUSED",
				error: "Slop Guard is paused."
			};
			if (!settings.apiKey.trim()) return {
				ok: false,
				code: "NO_KEY",
				error: "Add a TypeSafe API key in the extension popup."
			};
			try {
				const verdict = await callJev(tweet, settings);
				remember(verdict);
				return {
					ok: true,
					verdict
				};
			} catch (err) {
				const message = err instanceof Error ? err.message : "Jev request failed";
				return {
					ok: false,
					code: message.includes("timed out") || message.includes("fetch") ? "NETWORK" : "JEV",
					error: message
				};
			}
		});
		inflight.set(tweet.id, job);
		try {
			return await job;
		} finally {
			inflight.delete(tweet.id);
		}
	}
	//#endregion
	//#region \0virtual:wxt-background-entrypoint?/workspace/entrypoints/background.ts
	/** Wrapper around `console` with a "[wxt]" prefix */
	var logger = {
		debug: (...args) => ([...args], void 0),
		log: (...args) => ([...args], void 0),
		warn: (...args) => ([...args], void 0),
		error: (...args) => ([...args], void 0)
	};
	var result;
	try {
		result = background_default.main();
		if (result instanceof Promise) console.warn("The background's main() function return a promise, but it must be synchronous");
	} catch (err) {
		logger.error("The background crashed on startup!");
		throw err;
	}
	//#endregion
	return result;
})();
