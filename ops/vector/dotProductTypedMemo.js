/**
 * @fileoverview Table-driven, memoized dot product for Float64Array vectors.
 *
 * Uses a precomputed small-integer multiplication lookup table combined with
 * a bounded LRU memoization cache keyed by exact IEEE-754 float64 bit patterns
 * (order-independent to exploit commutativity a · b === b · a).
 */

const TABLE_HALF = 32;
const TABLE_SPAN = TABLE_HALF * 2 + 1;

/**
 * Precomputed multiplication lookup table for integer pairs in [-32, 32].
 * Indexed as `(x + TABLE_HALF) * TABLE_SPAN + (y + TABLE_HALF)`.
 * @type {Float64Array}
 */
const MUL_TABLE = new Float64Array(TABLE_SPAN * TABLE_SPAN);
for (let x = -TABLE_HALF; x <= TABLE_HALF; x++) {
	const rowOffset = (x + TABLE_HALF) * TABLE_SPAN;
	for (let y = -TABLE_HALF; y <= TABLE_HALF; y++) {
		MUL_TABLE[rowOffset + (y + TABLE_HALF)] = x * y;
	}
}

const MAX_CACHE_ENTRIES = 1024;
const MAX_MEMO_LENGTH = 8192;

/**
 * Bounded LRU memoization cache mapping canonical vector-pair keys to results.
 * Pre-seeded with the empty vector dot product.
 * @type {Map<string, number>}
 */
const memoCache = new Map([['|', 0]]);

let cacheHits = 0;
let cacheMisses = 0;

/**
 * Encodes a Float64Array's elements into an exact, collision-free bit key.
 * Respects `byteOffset` and `length` for subarray views.
 *
 * @param {Float64Array} vec
 * @returns {string}
 */
function encodeVectorKey(vec) {
	const len = vec.length;
	if (len === 0) {
		return '';
	}
	const bits = new BigUint64Array(vec.buffer, vec.byteOffset, len);
	const parts = new Array(len);
	for (let i = 0; i < len; i++) {
		parts[i] = bits[i].toString(36);
	}
	return parts.join(',');
}

/**
 * Builds a commutative cache key for a pair of equal-length Float64Arrays.
 *
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {string}
 */
function makePairKey(a, b) {
	const keyA = encodeVectorKey(a);
	const keyB = encodeVectorKey(b);
	return keyA <= keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;
}

/**
 * Computes the element-wise dot product of two Float64Array vectors using a
 * precomputed multiplication table and a bounded LRU memoization cache.
 *
 * @param {Float64Array} a - First input vector.
 * @param {Float64Array} b - Second input vector (must have the same length as `a`).
 * @returns {number} The scalar dot product `sum(a[i] * b[i])`.
 * @throws {TypeError} If either argument is not a `Float64Array`.
 * @throws {RangeError} If the two `Float64Array` inputs have different lengths.
 */
export function dotProductTypedMemo(a, b) {
	if (!(a instanceof Float64Array)) {
		throw new TypeError('First argument must be a Float64Array');
	}
	if (!(b instanceof Float64Array)) {
		throw new TypeError('Second argument must be a Float64Array');
	}
	const len = a.length;
	if (len !== b.length) {
		throw new RangeError(
			`Vector lengths must match (received ${len} and ${b.length})`,
		);
	}

	const useMemo = len <= MAX_MEMO_LENGTH;
	let key = '';
	if (useMemo) {
		key = makePairKey(a, b);
		if (memoCache.has(key)) {
			const cached = memoCache.get(key);
			// Refresh LRU recency
			memoCache.delete(key);
			memoCache.set(key, cached);
			cacheHits++;
			return cached;
		}
		cacheMisses++;
	}

	let sum = 0;
	for (let i = 0; i < len; i++) {
		const x = a[i];
		const y = b[i];
		if (
			(x | 0) === x &&
			(y | 0) === y &&
			x >= -TABLE_HALF &&
			x <= TABLE_HALF &&
			y >= -TABLE_HALF &&
			y <= TABLE_HALF
		) {
			sum += MUL_TABLE[(x + TABLE_HALF) * TABLE_SPAN + (y + TABLE_HALF)];
		} else {
			sum += x * y;
		}
	}

	if (useMemo) {
		if (memoCache.size >= MAX_CACHE_ENTRIES) {
			const oldestKey = memoCache.keys().next().value;
			memoCache.delete(oldestKey);
		}
		memoCache.set(key, sum);
	}

	return sum;
}

/**
 * Resets the memoization cache (retaining the precomputed empty-vector entry)
 * and zeros hit/miss counters.
 */
dotProductTypedMemo.clearCache = function clearCache() {
	memoCache.clear();
	memoCache.set('|', 0);
	cacheHits = 0;
	cacheMisses = 0;
};

/**
 * Returns a snapshot of current memoization cache statistics.
 *
 * @returns {{ size: number, maxEntries: number, hits: number, misses: number }}
 */
dotProductTypedMemo.getCacheStats = function getCacheStats() {
	return {
		size: memoCache.size,
		maxEntries: MAX_CACHE_ENTRIES,
		hits: cacheHits,
		misses: cacheMisses,
	};
};
