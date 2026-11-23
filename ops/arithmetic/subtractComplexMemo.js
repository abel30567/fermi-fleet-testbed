/**
 * @typedef {Object} Complex
 * @property {number} re - Real part (finite number).
 * @property {number} im - Imaginary part (finite number).
 */

/** Maximum absolute integer value covered by the precomputed subtraction table. */
const TABLE_BOUND = 32;
const TABLE_SPAN = TABLE_BOUND * 2 + 1;

/**
 * Precomputed lookup table for small integer subtraction over [-TABLE_BOUND, TABLE_BOUND].
 * Indexed as `SUB_TABLE[(a + TABLE_BOUND) * TABLE_SPAN + (b + TABLE_BOUND)] = a - b`.
 * @type {Int16Array}
 */
const SUB_TABLE = new Int16Array(TABLE_SPAN * TABLE_SPAN);
for (let a = -TABLE_BOUND; a <= TABLE_BOUND; a++) {
	const rowOffset = (a + TABLE_BOUND) * TABLE_SPAN;
	for (let b = -TABLE_BOUND; b <= TABLE_BOUND; b++) {
		SUB_TABLE[rowOffset + (b + TABLE_BOUND)] = a - b;
	}
}

/** Maximum number of entries retained in the bounded LRU memoization cache. */
const MAX_CACHE_SIZE = 4096;

/**
 * Bounded LRU memoization cache mapping serialized operand pairs to frozen Complex results.
 * @type {Map<string, Readonly<Complex>>}
 */
const memoCache = new Map();

/**
 * Validates that a value is a well-formed complex number object `{ re, im }`
 * with finite numeric components.
 *
 * @param {unknown} value - Candidate complex number.
 * @param {string} name - Parameter name for error messages.
 * @returns {void}
 * @throws {TypeError} If `value` is not a non-null plain/non-array object or if `re`/`im` are not numbers.
 * @throws {RangeError} If `re` or `im` is not a finite number (`NaN`, `Infinity`, `-Infinity`).
 */
function validateComplex(value, name) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${name} must be a non-null object with numeric { re, im } properties`);
	}
	if (typeof value.re !== 'number') {
		throw new TypeError(`${name}.re must be a number`);
	}
	if (typeof value.im !== 'number') {
		throw new TypeError(`${name}.im must be a number`);
	}
	if (!Number.isFinite(value.re)) {
		throw new RangeError(`${name}.re must be a finite number`);
	}
	if (!Number.isFinite(value.im)) {
		throw new RangeError(`${name}.im must be a finite number`);
	}
}

/**
 * Encodes a finite number for memoization keys while distinguishing `-0` from `+0`.
 *
 * @param {number} n
 * @returns {string}
 */
function encodeNumberKey(n) {
	return Object.is(n, -0) ? '-0' : String(n);
}

/**
 * Subtracts two finite real components using the precomputed table when both are
 * small integers within `[-TABLE_BOUND, TABLE_BOUND]` (excluding signed `-0`),
 * falling back to IEEE 754 subtraction otherwise.
 *
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function subtractScalar(x, y) {
	if (
		Number.isInteger(x) &&
		Number.isInteger(y) &&
		x >= -TABLE_BOUND &&
		x <= TABLE_BOUND &&
		y >= -TABLE_BOUND &&
		y <= TABLE_BOUND &&
		!Object.is(x, -0) &&
		!Object.is(y, -0)
	) {
		return SUB_TABLE[(x + TABLE_BOUND) * TABLE_SPAN + (y + TABLE_BOUND)];
	}
	return x - y;
}

/**
 * Subtracts complex number `b` from complex number `a` (`a - b`), where complex
 * numbers are represented as `{ re, im }` objects.
 *
 * Uses a hybrid table-driven and memoized strategy:
 * - Small integer components in `[-32, 32]` are resolved via a precomputed lookup table.
 * - Full `(a, b)` results are cached in a bounded LRU `Map` (up to 4096 entries).
 * - Always returns a fresh `{ re, im }` object so caller mutations cannot corrupt the cache.
 *
 * @param {Complex} a - Minuend complex number `{ re, im }`.
 * @param {Complex} b - Subtrahend complex number `{ re, im }`.
 * @returns {Complex} The complex difference `{ re: a.re - b.re, im: a.im - b.im }`.
 * @throws {TypeError} If either argument is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If any input component is non-finite or if subtraction overflows to a non-finite value.
 */
export function subtractComplexMemo(a, b) {
	validateComplex(a, 'a');
	validateComplex(b, 'b');

	const key = `${encodeNumberKey(a.re)},${encodeNumberKey(a.im)}|${encodeNumberKey(b.re)},${encodeNumberKey(b.im)}`;

	const cached = memoCache.get(key);
	if (cached !== undefined) {
		// Refresh LRU recency
		memoCache.delete(key);
		memoCache.set(key, cached);
		return { re: cached.re, im: cached.im };
	}

	const re = subtractScalar(a.re, b.re);
	const im = subtractScalar(a.im, b.im);

	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('Complex subtraction overflowed to a non-finite value');
	}

	const entry = Object.freeze({ re, im });
	if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value;
		memoCache.delete(oldestKey);
	}
	memoCache.set(key, entry);

	return { re, im };
}
