/**
 * Memoized and table-driven division over complex numbers represented as `{ re, im }`.
 *
 * Uses:
 * 1. A bounded LRU memoization cache keyed by normalized operand components so repeated
 *    complex divisions return in O(1) time without recomputation (always returning a fresh
 *    object to preserve immutability of cached entries).
 * 2. A precomputed divisor table for common small Gaussian integer divisors
 *    (`re, im ∈ [-8, 8]`, excluding `0 + 0i`), storing precomputed conjugate/norm-squared
 *    values (and exact inverse factors when `normSq` is a power of two).
 * 3. Numerically stable Smith's algorithm (with power-of-two overflow guard) as the general
 *    fallback to avoid spurious overflow/underflow for extreme magnitudes.
 *
 * @module ops/arithmetic/divideComplexMemo
 */

/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Maximum number of entries stored in the memoization cache before oldest entries are evicted.
 * @type {number}
 */
const MAX_CACHE_SIZE = 4096

/**
 * Half-width of the precomputed Gaussian integer divisor table (`[-TABLE_LIMIT, TABLE_LIMIT]`).
 * @type {number}
 */
const TABLE_LIMIT = 8

/**
 * Precomputed lookup table for small Gaussian integer divisors `b = re + i*im`.
 * Maps `"re|im"` to `{ re, im, normSq, exactInvRe, exactInvIm }`, where `exactInvRe`/`exactInvIm`
 * are populated when `normSq` is a power of two (making division by `normSq` exact in IEEE 754).
 *
 * @type {Map<string, { re: number, im: number, normSq: number, exactInvRe: number | null, exactInvIm: number | null }>}
 */
const PRECOMPUTED_DIVISORS = (() => {
	const table = new Map()
	for (let re = -TABLE_LIMIT; re <= TABLE_LIMIT; re++) {
		for (let im = -TABLE_LIMIT; im <= TABLE_LIMIT; im++) {
			if (re === 0 && im === 0) continue
			const normSq = re * re + im * im
			const isPowerOfTwo = (normSq & (normSq - 1)) === 0
			table.set(`${re}|${im}`, {
				re,
				im,
				normSq,
				exactInvRe: isPowerOfTwo ? re / normSq : null,
				exactInvIm: isPowerOfTwo ? -im / normSq : null,
			})
		}
	}
	return table
})()

/**
 * Bounded LRU memoization cache mapping `"aRe|aIm|bRe|bIm"` to frozen `{ re, im }` quotients.
 * @type {Map<string, Readonly<Complex>>}
 */
const memoCache = new Map()

/**
 * Normalizes `-0` to `+0`.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Validates that a value is a complex number object `{ re, im }` with finite numeric parts.
 *
 * @param {unknown} value - Candidate complex number.
 * @param {string} name - Parameter name for descriptive error messages.
 * @returns {Complex} Normalized `{ re, im }` pair.
 * @throws {TypeError} If `value` is not a non-null non-array object with finite number `re` and `im`.
 */
function validateComplex(value, name) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${name} must be a complex number object with finite numeric re and im properties`)
	}
	const { re, im } = /** @type {Record<string, unknown>} */ (value)
	if (typeof re !== 'number' || !Number.isFinite(re)) {
		throw new TypeError(`${name}.re must be a finite number`)
	}
	if (typeof im !== 'number' || !Number.isFinite(im)) {
		throw new TypeError(`${name}.im must be a finite number`)
	}
	return { re: normalizeZero(re), im: normalizeZero(im) }
}

/**
 * Computes `(aRe + i*aIm) / (bRe + i*bIm)` using Smith's numerically stable algorithm,
 * with a power-of-two scaling guard for operands near `Number.MAX_VALUE`.
 *
 * @param {number} aRe
 * @param {number} aIm
 * @param {number} bRe
 * @param {number} bIm
 * @returns {Complex}
 */
function divideSmith(aRe, aIm, bRe, bIm) {
	let ar = aRe
	let ai = aIm
	let br = bRe
	let bi = bIm

	// Scale down by an exact power of two if any component could overflow intermediate sums.
	const maxComponent = Math.max(Math.abs(ar), Math.abs(ai), Math.abs(br), Math.abs(bi))
	if (maxComponent > 1e300) {
		ar *= 0.25
		ai *= 0.25
		br *= 0.25
		bi *= 0.25
	}

	let re
	let im
	if (Math.abs(br) >= Math.abs(bi)) {
		const ratio = bi / br
		const denom = br + bi * ratio
		re = (ar + ai * ratio) / denom
		im = (ai - ar * ratio) / denom
	} else {
		const ratio = br / bi
		const denom = bi + br * ratio
		re = (ar * ratio + ai) / denom
		im = (ai * ratio - ar) / denom
	}

	return { re: normalizeZero(re), im: normalizeZero(im) }
}

/**
 * Divides two complex numbers `a / b`, where each complex number is represented as `{ re, im }`,
 * backed by a precomputed Gaussian-integer divisor table and a bounded LRU memoization cache.
 *
 * @param {Complex} a - Dividend complex number `{ re, im }`.
 * @param {Complex} b - Divisor complex number `{ re, im }` (must be non-zero).
 * @returns {Complex} Quotient `a / b` as a new `{ re, im }` object.
 * @throws {TypeError} If `a` or `b` is not a valid `{ re, im }` object with finite numeric parts.
 * @throws {RangeError} If `b` is `0 + 0i` (division by zero).
 */
export function divideComplexMemo(a, b) {
	const na = validateComplex(a, 'a')
	const nb = validateComplex(b, 'b')

	if (nb.re === 0 && nb.im === 0) {
		throw new RangeError('Division by zero: complex divisor b must not be 0 + 0i')
	}

	const cacheKey = `${na.re}|${na.im}|${nb.re}|${nb.im}`
	const cached = memoCache.get(cacheKey)
	if (cached !== undefined) {
		// Refresh LRU recency
		memoCache.delete(cacheKey)
		memoCache.set(cacheKey, cached)
		return { re: cached.re, im: cached.im }
	}

	let result
	if (
		Number.isInteger(nb.re) &&
		Number.isInteger(nb.im) &&
		Math.abs(nb.re) <= TABLE_LIMIT &&
		Math.abs(nb.im) <= TABLE_LIMIT &&
		Math.max(Math.abs(na.re), Math.abs(na.im)) <= 1e300
	) {
		const entry = PRECOMPUTED_DIVISORS.get(`${nb.re}|${nb.im}`)
		if (entry !== undefined) {
			if (entry.exactInvRe !== null && entry.exactInvIm !== null) {
				// Exact multiplication by precomputed reciprocal for power-of-two normSq
				const re = na.re * entry.exactInvRe - na.im * entry.exactInvIm
				const im = na.re * entry.exactInvIm + na.im * entry.exactInvRe
				result = { re: normalizeZero(re), im: normalizeZero(im) }
			} else {
				const re = (na.re * entry.re + na.im * entry.im) / entry.normSq
				const im = (na.im * entry.re - na.re * entry.im) / entry.normSq
				result = { re: normalizeZero(re), im: normalizeZero(im) }
			}
		}
	}

	if (result === undefined) {
		result = divideSmith(na.re, na.im, nb.re, nb.im)
	}

	if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value
		if (oldestKey !== undefined) {
			memoCache.delete(oldestKey)
		}
	}
	memoCache.set(cacheKey, Object.freeze({ re: result.re, im: result.im }))

	return { re: result.re, im: result.im }
}
