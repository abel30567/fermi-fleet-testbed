/**
 * @fileoverview Element-wise subtraction over Float64Array inputs using a
 * precomputed small-integer subtraction lookup table and bounded LRU memoization.
 */

const TABLE_MIN = -128;
const TABLE_MAX = 127;
const TABLE_SPAN = TABLE_MAX - TABLE_MIN + 1; // 256
const TABLE_OFFSET = -TABLE_MIN; // 128

const DEFAULT_MAX_CACHE_SIZE = 256;
const DEFAULT_MAX_MEMO_LENGTH = 4096;

/**
 * Precomputed 256x256 subtraction table for integer operands in [-128, 127].
 * Entry at `(x + 128) * 256 + (y + 128)` stores `x - y`.
 * @type {Float64Array}
 */
const PRECOMPUTED_SUB_TABLE = (() => {
	const table = new Float64Array(TABLE_SPAN * TABLE_SPAN);
	for (let a = TABLE_MIN; a <= TABLE_MAX; a++) {
		const rowOffset = (a + TABLE_OFFSET) * TABLE_SPAN;
		for (let b = TABLE_MIN; b <= TABLE_MAX; b++) {
			table[rowOffset + (b + TABLE_OFFSET)] = a - b;
		}
	}
	return table;
})();

/** @type {Map<string, Float64Array>} */
const memoCache = new Map();

const cacheStats = {
	hits: 0,
	misses: 0,
	evictions: 0,
	bypasses: 0,
	tableLookups: 0,
	directComputations: 0,
};

/**
 * Validates that a value is a non-detached Float64Array.
 *
 * @param {unknown} value - Value to validate.
 * @param {string} name - Parameter name for error messages.
 * @throws {TypeError} If `value` is not a Float64Array or its buffer is detached.
 */
function assertFloat64Array(value, name) {
	if (!(value instanceof Float64Array)) {
		throw new TypeError(`Expected "${name}" to be a Float64Array`);
	}
	if (value.buffer.detached) {
		throw new TypeError(`Expected "${name}" to have a non-detached ArrayBuffer`);
	}
}

/**
 * Validates optional configuration for `subtractTypedMemo`.
 *
 * @param {unknown} options - Optional settings object.
 * @returns {{ useCache: boolean, maxCacheSize: number, maxMemoLength: number }}
 * @throws {TypeError|RangeError} If any option has an invalid type or range.
 */
function parseOptions(options) {
	if (options === undefined) {
		return {
			useCache: true,
			maxCacheSize: DEFAULT_MAX_CACHE_SIZE,
			maxMemoLength: DEFAULT_MAX_MEMO_LENGTH,
		};
	}

	if (
		typeof options !== 'object' ||
		options === null ||
		Array.isArray(options) ||
		ArrayBuffer.isView(options)
	) {
		throw new TypeError('Expected "options" to be a plain object when provided');
	}

	const {
		useCache = true,
		maxCacheSize = DEFAULT_MAX_CACHE_SIZE,
		maxMemoLength = DEFAULT_MAX_MEMO_LENGTH,
	} = options;

	if (typeof useCache !== 'boolean') {
		throw new TypeError('Expected "options.useCache" to be a boolean');
	}
	if (!Number.isInteger(maxCacheSize) || maxCacheSize < 1) {
		throw new RangeError('Expected "options.maxCacheSize" to be a positive integer');
	}
	if (!Number.isInteger(maxMemoLength) || maxMemoLength < 0) {
		throw new RangeError('Expected "options.maxMemoLength" to be a non-negative integer');
	}

	return { useCache, maxCacheSize, maxMemoLength };
}

/**
 * Builds an exact bit-level cache key from two equal-length Float64Array inputs.
 * Using raw IEEE-754 64-bit representations preserves the distinction between +0 and -0,
 * handles NaN/Infinity deterministically, and respects subarray byteOffsets.
 *
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {string}
 */
function buildCacheKey(a, b) {
	const len = a.length;
	if (len === 0) {
		return '0:';
	}
	const aBits = new BigUint64Array(a.buffer, a.byteOffset, len);
	const bBits = new BigUint64Array(b.buffer, b.byteOffset, len);
	const parts = new Array(len * 2);
	for (let i = 0; i < len; i++) {
		parts[i] = aBits[i].toString(36);
		parts[len + i] = bBits[i].toString(36);
	}
	return `${len}:${parts.join(',')}`;
}

/**
 * Checks whether a Float64 value is an integer inside the precomputed table bounds.
 *
 * @param {number} value
 * @returns {boolean}
 */
function isTableIndexable(value) {
	return (
		value >= TABLE_MIN &&
		value <= TABLE_MAX &&
		Number.isInteger(value)
	);
}

/**
 * Computes element-wise subtraction `a[i] - b[i]`, consulting the precomputed
 * small-integer table whenever applicable while preserving exact IEEE-754 semantics
 * (including signed zero: `(-0) - (+0) === -0`).
 *
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {Float64Array}
 */
function computeElementWiseSubtract(a, b) {
	const len = a.length;
	const result = new Float64Array(len);

	for (let i = 0; i < len; i++) {
		const av = a[i];
		const bv = b[i];

		// Preserve IEEE-754 signed zero: (-0) - (+0) is -0, whereas table[0, 0] is +0.
		if (
			isTableIndexable(av) &&
			isTableIndexable(bv) &&
			!(Object.is(av, -0) && Object.is(bv, 0))
		) {
			result[i] = PRECOMPUTED_SUB_TABLE[(av + TABLE_OFFSET) * TABLE_SPAN + (bv + TABLE_OFFSET)];
			cacheStats.tableLookups++;
		} else {
			result[i] = av - bv;
			cacheStats.directComputations++;
		}
	}

	return result;
}

/**
 * Evicts the least-recently-used entries until the cache fits within `maxCacheSize`.
 *
 * @param {number} maxCacheSize
 */
function enforceCacheLimit(maxCacheSize) {
	while (memoCache.size > maxCacheSize) {
		const oldestKey = memoCache.keys().next().value;
		memoCache.delete(oldestKey);
		cacheStats.evictions++;
	}
}

/**
 * Computes the element-wise arithmetic difference `a[i] - b[i]` for two equal-length
 * `Float64Array` inputs, using a precomputed 256x256 integer subtraction lookup table
 * (for integer elements in `[-128, 127]`) combined with bounded LRU memoization keyed
 * on the exact IEEE-754 bit patterns of the inputs.
 *
 * Always returns a fresh `Float64Array` so caller mutations cannot corrupt cached results.
 *
 * @param {Float64Array} a - Minuend vector.
 * @param {Float64Array} b - Subtrahend vector (must have the same length as `a`).
 * @param {Object} [options] - Optional execution settings.
 * @param {boolean} [options.useCache=true] - Whether to read from and write to the memoization cache.
 * @param {number} [options.maxCacheSize=256] - Maximum number of memoized results retained (LRU).
 * @param {number} [options.maxMemoLength=4096] - Maximum vector length eligible for memoization.
 * @returns {Float64Array} A new `Float64Array` containing `a[i] - b[i]` for each index `i`.
 * @throws {TypeError} If `a` or `b` is not a non-detached `Float64Array`, or if `options` is invalid.
 * @throws {RangeError} If `a.length !== b.length`, or if numeric options are out of range.
 */
export function subtractTypedMemo(a, b, options) {
	assertFloat64Array(a, 'a');
	assertFloat64Array(b, 'b');

	if (a.length !== b.length) {
		throw new RangeError(
			`Float64Array length mismatch: "a" has length ${a.length}, "b" has length ${b.length}`
		);
	}

	const { useCache, maxCacheSize, maxMemoLength } = parseOptions(options);

	if (!useCache || a.length > maxMemoLength) {
		cacheStats.bypasses++;
		return computeElementWiseSubtract(a, b);
	}

	const key = buildCacheKey(a, b);
	if (memoCache.has(key)) {
		const cached = memoCache.get(key);
		// Refresh recency for LRU ordering.
		memoCache.delete(key);
		memoCache.set(key, cached);
		cacheStats.hits++;
		return new Float64Array(cached);
	}

	cacheStats.misses++;
	const computed = computeElementWiseSubtract(a, b);
	memoCache.set(key, computed);
	enforceCacheLimit(maxCacheSize);

	return new Float64Array(computed);
}

/**
 * Clears the internal memoization cache and resets instrumentation counters.
 */
subtractTypedMemo.clearCache = function clearCache() {
	memoCache.clear();
	cacheStats.hits = 0;
	cacheStats.misses = 0;
	cacheStats.evictions = 0;
	cacheStats.bypasses = 0;
	cacheStats.tableLookups = 0;
	cacheStats.directComputations = 0;
};

/**
 * Returns a snapshot of memoization and lookup-table statistics.
 *
 * @returns {{
 *   size: number,
 *   hits: number,
 *   misses: number,
 *   evictions: number,
 *   bypasses: number,
 *   tableLookups: number,
 *   directComputations: number,
 *   tableMin: number,
 *   tableMax: number
 * }}
 */
subtractTypedMemo.getStats = function getStats() {
	return {
		size: memoCache.size,
		hits: cacheStats.hits,
		misses: cacheStats.misses,
		evictions: cacheStats.evictions,
		bypasses: cacheStats.bypasses,
		tableLookups: cacheStats.tableLookups,
		directComputations: cacheStats.directComputations,
		tableMin: TABLE_MIN,
		tableMax: TABLE_MAX,
	};
};
