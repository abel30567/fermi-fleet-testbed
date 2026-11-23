/**
 * Precomputed lookup table resolution for exact 3-decimal membership values in [0, 1].
 * Covers 0.000, 0.001, ..., 1.000 (1,001 entries).
 */
const TABLE_STEPS = 1000;

/**
 * Maximum number of off-grid scalar results retained in the memoization cache
 * to prevent unbounded memory growth.
 */
const MAX_CACHE_SIZE = 4096;

/**
 * Precomputed Zadeh complement table: COMPLEMENT_TABLE[i] = (TABLE_STEPS - i) / TABLE_STEPS.
 * @type {Float64Array}
 */
const COMPLEMENT_TABLE = new Float64Array(TABLE_STEPS + 1);
for (let i = 0; i <= TABLE_STEPS; i += 1) {
	COMPLEMENT_TABLE[i] = (TABLE_STEPS - i) / TABLE_STEPS;
}

/**
 * Bounded LRU-style memoization cache for off-grid floating-point membership degrees.
 * @type {Map<number, number>}
 */
const memoCache = new Map();

/**
 * Validates a scalar fuzzy membership degree in [0, 1].
 *
 * @param {unknown} value - Candidate membership degree.
 * @param {string} [label='value'] - Contextual label for error messages.
 * @returns {number} Validated membership degree in [0, 1] with -0 normalized to 0.
 * @throws {TypeError} If value is not a number.
 * @throws {RangeError} If value is NaN, non-finite, or outside [0, 1].
 */
function validateMembership(value, label = 'value') {
	if (typeof value !== 'number') {
		throw new TypeError(`Expected ${label} to be a number in [0, 1], got ${value === null ? 'null' : typeof value}`);
	}
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new RangeError(`Expected ${label} to be a finite number in [0, 1], got ${value}`);
	}
	return value === 0 ? 0 : value;
}

/**
 * Computes the Zadeh fuzzy NOT (1 - mu) for a single validated membership degree
 * using the precomputed table for exact grid points and a bounded memoization cache
 * for arbitrary floating-point inputs.
 *
 * @param {number} mu - Validated membership degree in [0, 1].
 * @returns {number} Complement membership degree in [0, 1].
 */
function notScalar(mu) {
	const index = Math.round(mu * TABLE_STEPS);
	if (index >= 0 && index <= TABLE_STEPS && index / TABLE_STEPS === mu) {
		return COMPLEMENT_TABLE[index];
	}

	const cached = memoCache.get(mu);
	if (cached !== undefined) {
		// Refresh entry recency for LRU behavior.
		memoCache.delete(mu);
		memoCache.set(mu, cached);
		return cached;
	}

	const raw = 1 - mu;
	const result = raw === 0 ? 0 : raw;

	if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value;
		memoCache.delete(oldestKey);
	}
	memoCache.set(mu, result);
	return result;
}

/**
 * Checks whether a value is a plain object (Object.prototype or null prototype).
 *
 * @param {unknown} value - Candidate object.
 * @returns {boolean} True if value is a plain object.
 */
function isPlainObject(value) {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

/**
 * Computes the Zadeh fuzzy logic / fuzzy set NOT (standard complement: `1 - mu`)
 * over membership degrees in `[0, 1]`, backed by a precomputed lookup table for
 * exact 3-decimal grid points and a bounded memoization cache for arbitrary floats.
 *
 * Supports:
 * - Scalar fuzzy truth value (`number` in `[0, 1]`) -> `number`
 * - Array of membership degrees (`number[]`) -> `number[]`
 * - Fuzzy set as a `Map<K, number>` -> `Map<K, number>`
 * - Fuzzy set as a plain object (`Record<string, number>`) -> `Record<string, number>`
 *
 * @template {number | number[] | Map<any, number> | Record<string, number>} T
 * @param {T} input - Fuzzy membership degree or fuzzy set with memberships in `[0, 1]`.
 * @returns {T} The Zadeh fuzzy complement of `input`, without mutating the input.
 * @throws {TypeError} If `input` is not a supported type or contains non-number memberships.
 * @throws {RangeError} If any membership degree is `NaN`, non-finite, or outside `[0, 1]`.
 */
export function notFuzzyMemo(input) {
	if (typeof input === 'number') {
		return notScalar(validateMembership(input, 'membership'));
	}

	if (Array.isArray(input)) {
		const out = new Array(input.length);
		for (let i = 0; i < input.length; i += 1) {
			if (!(i in input)) {
				throw new TypeError(`Expected membership at index ${i} to be a number in [0, 1], got sparse hole`);
			}
			out[i] = notScalar(validateMembership(input[i], `membership[${i}]`));
		}
		return out;
	}

	if (input instanceof Map) {
		const out = new Map();
		for (const [key, value] of input.entries()) {
			out.set(key, notScalar(validateMembership(value, `membership for key ${String(key)}`)));
		}
		return out;
	}

	if (isPlainObject(input)) {
		const isNullProto = Object.getPrototypeOf(input) === null;
		const out = isNullProto ? Object.create(null) : {};
		for (const key of Object.keys(input)) {
			const val = notScalar(validateMembership(input[key], `membership["${key}"]`));
			Object.defineProperty(out, key, {
				value: val,
				writable: true,
				enumerable: true,
				configurable: true,
			});
		}
		return out;
	}

	throw new TypeError(
		`Expected a membership number in [0, 1], Array, Map, or plain object fuzzy set; got ${input === null ? 'null' : typeof input}`,
	);
}
