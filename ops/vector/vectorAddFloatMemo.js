/**
 * @module ops/vector/vectorAddFloatMemo
 * Element-wise vector addition over IEEE-754 float64 Numbers using a
 * precomputed small-integer lookup table and bounded LRU-style memoization.
 */

const TABLE_MIN = -16;
const TABLE_MAX = 16;
const TABLE_SPAN = TABLE_MAX - TABLE_MIN + 1;

/**
 * Precomputed IEEE-754 float64 addition table for integer pairs in
 * [TABLE_MIN, TABLE_MAX] x [TABLE_MIN, TABLE_MAX].
 * @type {Float64Array}
 */
const ADD_TABLE = new Float64Array(TABLE_SPAN * TABLE_SPAN);
for (let i = 0; i < TABLE_SPAN; i += 1) {
	const x = i + TABLE_MIN;
	const rowOffset = i * TABLE_SPAN;
	for (let j = 0; j < TABLE_SPAN; j += 1) {
		ADD_TABLE[rowOffset + j] = x + (j + TABLE_MIN);
	}
}

/** Maximum number of memoized vector-addition results retained in cache. */
const MAX_CACHE_ENTRIES = 1024;

/**
 * Bounded insertion-order / LRU memoization cache mapping canonical vector
 * pair keys to precomputed Float64Array sums.
 * @type {Map<string, Float64Array>}
 */
const memoCache = new Map();

/**
 * Encodes a single IEEE-754 float64 number into an unambiguous key fragment,
 * preserving the distinction between -0 and +0 and canonicalizing NaN.
 *
 * @param {number} value
 * @returns {string}
 */
function encodeFloat64(value) {
	if (Number.isNaN(value)) {
		return 'NaN';
	}
	if (Object.is(value, -0)) {
		return '-0';
	}
	return String(value);
}

/**
 * Validates that an input is an Array or Float64Array of IEEE-754 Numbers
 * and builds its canonical memoization key fragment in a single pass.
 *
 * @param {unknown} vec
 * @param {string} name
 * @returns {string}
 */
function validateAndEncodeVector(vec, name) {
	if (!Array.isArray(vec) && !(vec instanceof Float64Array)) {
		throw new TypeError(`${name} must be an Array or Float64Array of numbers`);
	}
	const len = vec.length;
	if (len === 0) {
		return '';
	}
	const parts = new Array(len);
	for (let i = 0; i < len; i += 1) {
		const val = vec[i];
		if (typeof val !== 'number') {
			throw new TypeError(`${name}[${i}] must be a number`);
		}
		parts[i] = encodeFloat64(val);
	}
	return parts.join(',');
}

/**
 * Adds two IEEE-754 float64 numbers using the precomputed table when both
 * operands are in-range non-negative-zero integers, falling back to native
 * IEEE-754 float64 addition otherwise.
 *
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function addFloat64(x, y) {
	if (
		Number.isInteger(x) &&
		Number.isInteger(y) &&
		x >= TABLE_MIN &&
		x <= TABLE_MAX &&
		y >= TABLE_MIN &&
		y <= TABLE_MAX &&
		!Object.is(x, -0) &&
		!Object.is(y, -0)
	) {
		return ADD_TABLE[(x - TABLE_MIN) * TABLE_SPAN + (y - TABLE_MIN)];
	}
	return x + y;
}

/**
 * Computes the element-wise sum of two equal-length vectors over IEEE-754
 * float64 Numbers using a precomputed lookup table and memoized result cache.
 *
 * @param {readonly number[] | Float64Array} a First input vector.
 * @param {readonly number[] | Float64Array} b Second input vector.
 * @returns {number[]} New array containing `a[i] + b[i]` in IEEE-754 float64 arithmetic.
 * @throws {TypeError} If either argument is not an Array/Float64Array or contains non-number elements.
 * @throws {RangeError} If `a` and `b` do not have the same length.
 */
export function vectorAddFloatMemo(a, b) {
	const keyA = validateAndEncodeVector(a, 'a');
	const keyB = validateAndEncodeVector(b, 'b');

	if (a.length !== b.length) {
		throw new RangeError(`Vector length mismatch: ${a.length} !== ${b.length}`);
	}

	const cacheKey = `${a.length}:${keyA}|${keyB}`;
	const cached = memoCache.get(cacheKey);
	if (cached !== undefined) {
		// Refresh entry recency for LRU eviction.
		memoCache.delete(cacheKey);
		memoCache.set(cacheKey, cached);
		return Array.from(cached);
	}

	const len = a.length;
	const stored = new Float64Array(len);
	const result = new Array(len);

	for (let i = 0; i < len; i += 1) {
		const sum = addFloat64(a[i], b[i]);
		stored[i] = sum;
		result[i] = sum;
	}

	if (memoCache.size >= MAX_CACHE_ENTRIES) {
		const oldestKey = memoCache.keys().next().value;
		memoCache.delete(oldestKey);
	}
	memoCache.set(cacheKey, stored);

	return result;
}
