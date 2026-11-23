/**
 * @typedef {Object} Complex
 * @property {number} re - The finite real component of the complex number.
 * @property {number} im - The finite imaginary component of the complex number.
 */

/**
 * Inclusive bound for the precomputed Gaussian-integer multiplication table.
 * Pairs of complex numbers with integer components in [-TABLE_BOUND, TABLE_BOUND]
 * are served directly from an O(1) precomputed flat lookup table.
 */
const TABLE_BOUND = 3
const TABLE_SPAN = TABLE_BOUND * 2 + 1 // 7 values: -3..3
const TABLE_STATES = TABLE_SPAN * TABLE_SPAN // 49 Gaussian integers

/**
 * Maximum number of dynamic memoization entries retained in the LRU-style Map cache.
 */
const MAX_CACHE_SIZE = 4096

/**
 * Precomputed flat lookup tables for real and imaginary parts of products of
 * Gaussian integers in [-TABLE_BOUND, TABLE_BOUND]^2.
 * Indexed by (idxA * TABLE_STATES + idxB).
 */
const PRECOMPUTED_RE = new Int16Array(TABLE_STATES * TABLE_STATES)
const PRECOMPUTED_IM = new Int16Array(TABLE_STATES * TABLE_STATES)

for (let ar = -TABLE_BOUND; ar <= TABLE_BOUND; ar++) {
	for (let ai = -TABLE_BOUND; ai <= TABLE_BOUND; ai++) {
		const idxA = (ar + TABLE_BOUND) * TABLE_SPAN + (ai + TABLE_BOUND)
		for (let br = -TABLE_BOUND; br <= TABLE_BOUND; br++) {
			for (let bi = -TABLE_BOUND; bi <= TABLE_BOUND; bi++) {
				const idxB = (br + TABLE_BOUND) * TABLE_SPAN + (bi + TABLE_BOUND)
				const flatIdx = idxA * TABLE_STATES + idxB
				PRECOMPUTED_RE[flatIdx] = ar * br - ai * bi
				PRECOMPUTED_IM[flatIdx] = ar * bi + ai * br
			}
		}
	}
}

/**
 * Bounded memoization cache mapping canonicalized commutative operand keys
 * to frozen `{ re, im }` product records.
 * @type {Map<string, Readonly<Complex>>}
 */
const memoCache = new Map()

/**
 * Normalizes IEEE-754 negative zero (-0) to positive zero (+0).
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Validates that an argument is a complex number object `{ re, im }` with
 * finite numeric components.
 * @param {unknown} value - Candidate complex number.
 * @param {string} name - Parameter name for error messages.
 * @throws {TypeError} If `value` is not a non-null plain object or lacks numeric `re`/`im`.
 * @throws {RangeError} If `value.re` or `value.im` is `NaN`, `Infinity`, or `-Infinity`.
 */
function validateComplex(value, name) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${name} must be an object with finite numeric { re, im } properties`)
	}
	if (typeof value.re !== 'number' || typeof value.im !== 'number') {
		throw new TypeError(`${name}.re and ${name}.im must both be numbers`)
	}
	if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
		throw new RangeError(`${name}.re and ${name}.im must be finite numbers`)
	}
}

/**
 * Checks whether a finite number is an integer within the precomputed table range.
 * @param {number} value
 * @returns {boolean}
 */
function isInTableRange(value) {
	return Number.isInteger(value) && value >= -TABLE_BOUND && value <= TABLE_BOUND
}

/**
 * Builds a canonical commutative cache key for `(ar, ai)` and `(br, bi)`.
 * Because complex multiplication is strictly commutative in IEEE-754 arithmetic,
 * `(a, b)` and `(b, a)` share a single memoization entry.
 * @param {number} ar
 * @param {number} ai
 * @param {number} br
 * @param {number} bi
 * @returns {string}
 */
function canonicalKey(ar, ai, br, bi) {
	if (ar < br || (ar === br && ai <= bi)) {
		return `${ar},${ai}*${br},${bi}`
	}
	return `${br},${bi}*${ar},${ai}`
}

/**
 * Multiplies two complex numbers represented as `{ re, im }` objects using a
 * precomputed Gaussian-integer lookup table for small integer inputs and a
 * bounded commutative memoization cache for general floating-point inputs.
 *
 * Computes `(a.re * b.re - a.im * b.im) + (a.re * b.im + a.im * b.re)i`,
 * normalizing `-0` components to `+0` and returning a fresh `{ re, im }` object
 * on every call so caller mutations cannot affect cached results.
 *
 * @param {Complex} a - First complex factor `{ re, im }`.
 * @param {Complex} b - Second complex factor `{ re, im }`.
 * @returns {Complex} The complex product `{ re, im }`.
 * @throws {TypeError} If `a` or `b` is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If any component of `a` or `b` is non-finite (`NaN`, `Infinity`, `-Infinity`).
 */
export function multiplyComplexMemo(a, b) {
	validateComplex(a, 'a')
	validateComplex(b, 'b')

	const ar = normalizeZero(a.re)
	const ai = normalizeZero(a.im)
	const br = normalizeZero(b.re)
	const bi = normalizeZero(b.im)

	// Fast path 1: O(1) precomputed Gaussian-integer lookup table.
	if (isInTableRange(ar) && isInTableRange(ai) && isInTableRange(br) && isInTableRange(bi)) {
		const idxA = (ar + TABLE_BOUND) * TABLE_SPAN + (ai + TABLE_BOUND)
		const idxB = (br + TABLE_BOUND) * TABLE_SPAN + (bi + TABLE_BOUND)
		const flatIdx = idxA * TABLE_STATES + idxB
		return {
			re: PRECOMPUTED_RE[flatIdx],
			im: PRECOMPUTED_IM[flatIdx],
		}
	}

	// Fast path 2: bounded commutative LRU memoization cache.
	const key = canonicalKey(ar, ai, br, bi)
	const cached = memoCache.get(key)
	if (cached !== undefined) {
		// Refresh entry recency for LRU eviction behavior.
		memoCache.delete(key)
		memoCache.set(key, cached)
		return { re: cached.re, im: cached.im }
	}

	const re = normalizeZero(ar * br - ai * bi)
	const im = normalizeZero(ar * bi + ai * br)

	if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value
		memoCache.delete(oldestKey)
	}
	memoCache.set(key, Object.freeze({ re, im }))

	return { re, im }
}
