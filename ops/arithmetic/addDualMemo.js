/**
 * @fileoverview Table-driven and memoized addition over dual numbers `{ v, d }`.
 *
 * A dual number `v + d * ε` (with `ε² = 0`) carries a primal value `v` alongside
 * its forward-mode derivative `d`. Addition is defined componentwise:
 *
 *   (a.v + a.d·ε) + (b.v + b.d·ε) = (a.v + b.v) + (a.d + b.d)·ε
 *
 * This implementation accelerates small-integer component sums using a
 * precomputed lookup table for integers in `[-16, 16]` and memoizes full
 * dual-number addition results in a bounded LRU cache keyed canonically
 * (exploiting commutativity while preserving IEEE-754 signed-zero semantics).
 */

/** @typedef {{ readonly v: number, readonly d: number }} Dual */

/** Minimum integer inclusive covered by the precomputed addition table. */
const TABLE_MIN = -16;

/** Maximum integer inclusive covered by the precomputed addition table. */
const TABLE_MAX = 16;

/** Side length of the precomputed addition table. */
const TABLE_SPAN = TABLE_MAX - TABLE_MIN + 1;

/** Maximum number of entries retained in the memoization LRU cache. */
const MAX_CACHE_SIZE = 4096;

/**
 * Precomputed 2D lookup table for integer sums in `[TABLE_MIN, TABLE_MAX]`.
 * Entry `(i, j)` is stored at `(i - TABLE_MIN) * TABLE_SPAN + (j - TABLE_MIN)`.
 */
const SMALL_INT_ADD_TABLE = new Int8Array(TABLE_SPAN * TABLE_SPAN);
for (let i = TABLE_MIN; i <= TABLE_MAX; i += 1) {
	const rowOffset = (i - TABLE_MIN) * TABLE_SPAN;
	for (let j = TABLE_MIN; j <= TABLE_MAX; j += 1) {
		SMALL_INT_ADD_TABLE[rowOffset + (j - TABLE_MIN)] = i + j;
	}
}

/** @type {Map<string, Dual>} */
const memoCache = new Map();

const stats = {
	hits: 0,
	misses: 0,
	evictions: 0,
	tableLookups: 0,
};

/**
 * Validates that an operand is a dual number `{ v, d }` with finite numeric fields.
 *
 * @param {unknown} operand - Value to validate.
 * @param {string} name - Parameter name for error messages.
 * @returns {Dual} Validated dual number.
 * @throws {TypeError} If `operand` is not a non-null, non-array object with numeric `v` and `d`.
 * @throws {RangeError} If `operand.v` or `operand.d` is `NaN` or `±Infinity`.
 */
function validateDual(operand, name) {
	if (typeof operand !== 'object' || operand === null || Array.isArray(operand)) {
		throw new TypeError(`${name} must be a dual number object { v, d }`);
	}
	if (!('v' in operand) || !('d' in operand)) {
		throw new TypeError(`${name} must have numeric properties "v" and "d"`);
	}
	const { v, d } = operand;
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError(`${name}.v and ${name}.d must be numbers`);
	}
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError(`${name}.v and ${name}.d must be finite numbers`);
	}
	return operand;
}

/**
 * Formats a finite number for memoization keys while distinguishing `-0` from `+0`.
 *
 * @param {number} n - Finite number.
 * @returns {string} Exact string key representation.
 */
function numberKey(n) {
	return Object.is(n, -0) ? '-0' : String(n);
}

/**
 * Builds a canonical commutative cache key for dual-number operands `a` and `b`.
 *
 * @param {Dual} a - First dual number.
 * @param {Dual} b - Second dual number.
 * @returns {string} Canonical cache key.
 */
function makeCacheKey(a, b) {
	const ka = `${numberKey(a.v)},${numberKey(a.d)}`;
	const kb = `${numberKey(b.v)},${numberKey(b.d)}`;
	return ka <= kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

/**
 * Adds two finite numbers using the precomputed table when both are small integers
 * in `[TABLE_MIN, TABLE_MAX]`, falling back to native IEEE-754 addition otherwise.
 *
 * @param {number} x - First finite addend.
 * @param {number} y - Second finite addend.
 * @returns {number} Sum `x + y`.
 */
function addComponent(x, y) {
	if (
		Number.isInteger(x) &&
		Number.isInteger(y) &&
		x >= TABLE_MIN &&
		x <= TABLE_MAX &&
		y >= TABLE_MIN &&
		y <= TABLE_MAX
	) {
		stats.tableLookups += 1;
		if (Object.is(x, -0) && Object.is(y, -0)) {
			return -0;
		}
		return SMALL_INT_ADD_TABLE[(x - TABLE_MIN) * TABLE_SPAN + (y - TABLE_MIN)];
	}
	return x + y;
}

/**
 * Adds two dual numbers `{ v, d }` carrying a forward-mode derivative alongside
 * the value, using a precomputed small-integer addition table and a bounded LRU
 * memoization cache.
 *
 * Returned objects are frozen so cached entries cannot be corrupted by callers.
 *
 * @param {{ v: number, d: number }} a - First dual number `{ v, d }`.
 * @param {{ v: number, d: number }} b - Second dual number `{ v, d }`.
 * @returns {Dual} Frozen dual number `{ v: a.v + b.v, d: a.d + b.d }`.
 * @throws {TypeError} If either operand is not a dual number object with numeric `v` and `d`.
 * @throws {RangeError} If any component of `a` or `b` is non-finite (`NaN`, `±Infinity`).
 */
export function addDualMemo(a, b) {
	const left = validateDual(a, 'a');
	const right = validateDual(b, 'b');

	const key = makeCacheKey(left, right);
	const cached = memoCache.get(key);
	if (cached !== undefined) {
		// Refresh LRU recency by moving key to the end of Map iteration order.
		memoCache.delete(key);
		memoCache.set(key, cached);
		stats.hits += 1;
		return cached;
	}

	stats.misses += 1;
	const result = Object.freeze({
		v: addComponent(left.v, right.v),
		d: addComponent(left.d, right.d),
	});

	if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value;
		memoCache.delete(oldestKey);
		stats.evictions += 1;
	}
	memoCache.set(key, result);

	return result;
}

/**
 * Clears all memoized entries and resets cache/table statistics.
 *
 * @returns {void}
 */
addDualMemo.clearCache = function clearCache() {
	memoCache.clear();
	stats.hits = 0;
	stats.misses = 0;
	stats.evictions = 0;
	stats.tableLookups = 0;
};

/**
 * Returns a snapshot of memoization cache and precomputed-table statistics.
 *
 * @returns {{ hits: number, misses: number, evictions: number, tableLookups: number, size: number, maxSize: number }}
 */
addDualMemo.getStats = function getStats() {
	return {
		hits: stats.hits,
		misses: stats.misses,
		evictions: stats.evictions,
		tableLookups: stats.tableLookups,
		size: memoCache.size,
		maxSize: MAX_CACHE_SIZE,
	};
};

addDualMemo.TABLE_MIN = TABLE_MIN;
addDualMemo.TABLE_MAX = TABLE_MAX;
addDualMemo.MAX_CACHE_SIZE = MAX_CACHE_SIZE;
