/**
 * @typedef {Object} Complex
 * @property {number} re - Real part (finite number).
 * @property {number} im - Imaginary part (finite number).
 */

/** Lower bound (inclusive) for the precomputed small-integer addition table. */
const SMALL_INT_MIN = -64;

/** Upper bound (inclusive) for the precomputed small-integer addition table. */
const SMALL_INT_MAX = 64;

/** Side length of the square precomputed addition table. */
const TABLE_SPAN = SMALL_INT_MAX - SMALL_INT_MIN + 1;

/**
 * Precomputed lookup table for small integer scalar additions in
 * `[SMALL_INT_MIN, SMALL_INT_MAX]`.
 * Entry `(x - SMALL_INT_MIN) * TABLE_SPAN + (y - SMALL_INT_MIN)` stores `x + y`.
 * @type {Int16Array}
 */
const SMALL_ADD_TABLE = (() => {
	const table = new Int16Array(TABLE_SPAN * TABLE_SPAN);
	for (let x = SMALL_INT_MIN; x <= SMALL_INT_MAX; x++) {
		const rowOffset = (x - SMALL_INT_MIN) * TABLE_SPAN;
		for (let y = SMALL_INT_MIN; y <= SMALL_INT_MAX; y++) {
			table[rowOffset + (y - SMALL_INT_MIN)] = x + y;
		}
	}
	return table;
})();

/** Maximum number of entries retained in the element-pair memoization cache. */
const MAX_PAIR_CACHE_SIZE = 4096;

/** Maximum number of entries retained in the full-vector memoization cache. */
const MAX_VECTOR_CACHE_SIZE = 512;

/**
 * Bounded LRU cache mapping canonical commutative complex-pair keys to `{ re, im }`.
 * @type {Map<string, Complex>}
 */
const pairCache = new Map();

/**
 * Bounded LRU cache mapping canonical commutative vector-pair keys to `Complex[]`.
 * @type {Map<string, Complex[]>}
 */
const vectorCache = new Map();

/**
 * Formats a finite number into a lossless, `-0`-preserving key token.
 * @param {number} value
 * @returns {string}
 */
function formatNumberKey(value) {
	return Object.is(value, -0) ? '-0' : String(value);
}

/**
 * Validates that a value is a complex number object `{ re, im }` with finite numeric parts.
 * @param {unknown} value
 * @param {string} vectorName
 * @param {number} index
 * @throws {TypeError} If `value` is not a plain-like object with numeric `re` and `im`.
 * @throws {RangeError} If `re` or `im` is not finite (`NaN`, `Infinity`, `-Infinity`).
 */
function validateComplexElement(value, vectorName, index) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(
			`${vectorName}[${index}] must be a complex number object { re, im }`,
		);
	}
	const { re, im } = /** @type {Record<string, unknown>} */ (value);
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(
			`${vectorName}[${index}] must have numeric re and im properties`,
		);
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(
			`${vectorName}[${index}] re and im must be finite numbers`,
		);
	}
}

/**
 * Validates that `v` is an array of valid complex numbers and builds its canonical key.
 * @param {unknown} v
 * @param {string} name
 * @returns {string}
 */
function validateAndSerializeVector(v, name) {
	if (!Array.isArray(v)) {
		throw new TypeError(`${name} must be an array of complex numbers`);
	}
	const len = v.length;
	if (len === 0) {
		return '';
	}
	const parts = new Array(len);
	for (let i = 0; i < len; i++) {
		validateComplexElement(v[i], name, i);
		parts[i] = `${formatNumberKey(v[i].re)},${formatNumberKey(v[i].im)}`;
	}
	return parts.join(';');
}

/**
 * Adds two finite real numbers using the precomputed small-integer table when applicable.
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function addScalarTableDriven(x, y) {
	if (
		Number.isInteger(x) &&
		Number.isInteger(y) &&
		!Object.is(x, -0) &&
		!Object.is(y, -0) &&
		x >= SMALL_INT_MIN &&
		x <= SMALL_INT_MAX &&
		y >= SMALL_INT_MIN &&
		y <= SMALL_INT_MAX
	) {
		return SMALL_ADD_TABLE[(x - SMALL_INT_MIN) * TABLE_SPAN + (y - SMALL_INT_MIN)];
	}
	return x + y;
}

/**
 * Inserts a value into a bounded LRU Map cache, evicting the oldest entry if full.
 * @template V
 * @param {Map<string, V>} cache
 * @param {number} maxSize
 * @param {string} key
 * @param {V} value
 */
function setBoundedLru(cache, maxSize, key, value) {
	if (cache.has(key)) {
		cache.delete(key);
	} else if (cache.size >= maxSize) {
		const oldestKey = cache.keys().next().value;
		if (oldestKey !== undefined) {
			cache.delete(oldestKey);
		}
	}
	cache.set(key, value);
}

/**
 * Retrieves a value from a bounded LRU Map cache and refreshes its recency.
 * @template V
 * @param {Map<string, V>} cache
 * @param {string} key
 * @returns {V | undefined}
 */
function getBoundedLru(cache, key) {
	if (!cache.has(key)) {
		return undefined;
	}
	const value = cache.get(key);
	cache.delete(key);
	cache.set(key, /** @type {V} */ (value));
	return value;
}

/**
 * Adds two validated complex numbers using a canonical commutative pair cache
 * backed by the precomputed small-integer addition table.
 * @param {Complex} z1
 * @param {Complex} z2
 * @returns {Complex}
 */
function addComplexMemoized(z1, z2) {
	const k1 = `${formatNumberKey(z1.re)},${formatNumberKey(z1.im)}`;
	const k2 = `${formatNumberKey(z2.re)},${formatNumberKey(z2.im)}`;
	const pairKey = k1 <= k2 ? `${k1}|${k2}` : `${k2}|${k1}`;

	const cached = getBoundedLru(pairCache, pairKey);
	if (cached !== undefined) {
		return cached;
	}

	const sum = Object.freeze({
		re: addScalarTableDriven(z1.re, z2.re),
		im: addScalarTableDriven(z1.im, z2.im),
	});
	setBoundedLru(pairCache, MAX_PAIR_CACHE_SIZE, pairKey, sum);
	return sum;
}

/**
 * Returns a fresh array of fresh `{ re, im }` clones so callers cannot mutate cached entries.
 * @param {readonly Complex[]} vec
 * @returns {Complex[]}
 */
function cloneComplexVector(vec) {
	const len = vec.length;
	const out = new Array(len);
	for (let i = 0; i < len; i++) {
		out[i] = { re: vec[i].re, im: vec[i].im };
	}
	return out;
}

/**
 * Computes element-wise complex vector addition `a + b` over arrays of `{ re, im }` objects
 * using a precomputed small-integer addition table and bounded commutative LRU memoization
 * at both the complex-pair and full-vector levels.
 *
 * Always returns a fresh array containing fresh `{ re, im }` objects so mutations by the
 * caller cannot corrupt internal caches.
 *
 * @param {readonly Complex[]} a - First complex vector.
 * @param {readonly Complex[]} b - Second complex vector (must match length of `a`).
 * @returns {Complex[]} Element-wise sum vector where `result[i] = { re: a[i].re + b[i].re, im: a[i].im + b[i].im }`.
 * @throws {TypeError} If `a` or `b` is not an array, or any element is not `{ re, im }` with numeric components.
 * @throws {RangeError} If `a` and `b` have different lengths, or any `re`/`im` is non-finite.
 */
export function vectorAddComplexMemo(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('a must be an array of complex numbers');
	}
	if (!Array.isArray(b)) {
		throw new TypeError('b must be an array of complex numbers');
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Vector length mismatch: a has length ${a.length}, b has length ${b.length}`,
		);
	}

	const keyA = validateAndSerializeVector(a, 'a');
	const keyB = validateAndSerializeVector(b, 'b');

	if (a.length === 0) {
		return [];
	}

	const vectorKey = keyA <= keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;
	const cachedVector = getBoundedLru(vectorCache, vectorKey);
	if (cachedVector !== undefined) {
		return cloneComplexVector(cachedVector);
	}

	const computed = new Array(a.length);
	for (let i = 0; i < a.length; i++) {
		computed[i] = addComplexMemoized(a[i], b[i]);
	}

	setBoundedLru(vectorCache, MAX_VECTOR_CACHE_SIZE, vectorKey, computed);
	return cloneComplexVector(computed);
}
