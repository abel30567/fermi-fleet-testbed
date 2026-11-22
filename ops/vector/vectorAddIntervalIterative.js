/**
 * @fileoverview Iterative interval vector addition with IEEE-754 outward rounding.
 */

const f64View = new Float64Array(1)
const u64View = new BigUint64Array(f64View.buffer)

/**
 * Returns the smallest IEEE-754 binary64 value strictly greater than `x`
 * (or `x` itself if `x` is `+Infinity` or `NaN`).
 *
 * @param {number} x
 * @returns {number}
 */
function nextUp(x) {
	if (Number.isNaN(x) || x === Infinity) return x
	if (x === 0) return Number.MIN_VALUE
	f64View[0] = x
	if (x > 0) {
		u64View[0] += 1n
	} else {
		u64View[0] -= 1n
	}
	const result = f64View[0]
	return result === 0 ? 0 : result
}

/**
 * Returns the largest IEEE-754 binary64 value strictly less than `x`
 * (or `x` itself if `x` is `-Infinity` or `NaN`).
 *
 * @param {number} x
 * @returns {number}
 */
function nextDown(x) {
	if (Number.isNaN(x) || x === -Infinity) return x
	if (x === 0) return -Number.MIN_VALUE
	f64View[0] = x
	if (x > 0) {
		u64View[0] -= 1n
	} else {
		u64View[0] += 1n
	}
	const result = f64View[0]
	return result === 0 ? 0 : result
}

/**
 * Computes `x + y` rounded toward `-Infinity` (exact IEEE-754 downward rounding)
 * using Dekker's Fast2Sum error-free transformation and `nextDown`.
 *
 * For all finite IEEE-754 binary64 numbers `x` and `y`, guarantees
 * `addDown(x, y) <= x + y` in exact real arithmetic.
 *
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function addDown(x, y) {
	let hi = x
	let lo = y
	if (Math.abs(hi) < Math.abs(lo)) {
		hi = y
		lo = x
	}
	const sum = hi + lo
	if (sum === Infinity) return Number.MAX_VALUE
	if (sum === -Infinity) return -Infinity
	const err = lo - (sum - hi)
	const rounded = err < 0 ? nextDown(sum) : sum
	return rounded === 0 ? 0 : rounded
}

/**
 * Computes `x + y` rounded toward `+Infinity` (exact IEEE-754 upward rounding)
 * using Dekker's Fast2Sum error-free transformation and `nextUp`.
 *
 * For all finite IEEE-754 binary64 numbers `x` and `y`, guarantees
 * `addUp(x, y) >= x + y` in exact real arithmetic.
 *
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function addUp(x, y) {
	let hi = x
	let lo = y
	if (Math.abs(hi) < Math.abs(lo)) {
		hi = y
		lo = x
	}
	const sum = hi + lo
	if (sum === Infinity) return Infinity
	if (sum === -Infinity) return -Number.MAX_VALUE
	const err = lo - (sum - hi)
	const rounded = err > 0 ? nextUp(sum) : sum
	return rounded === 0 ? 0 : rounded
}

/**
 * Validates that `interval` is a valid finite `[lo, hi]` pair with `lo <= hi`.
 *
 * @param {unknown} interval
 * @param {string} name
 * @param {number} index
 */
function validateInterval(interval, name, index) {
	if (!Array.isArray(interval) || interval.length !== 2) {
		throw new TypeError(`${name}[${index}] must be a [lo, hi] interval array of length 2`)
	}
	const [lo, hi] = interval
	if (typeof lo !== 'number' || typeof hi !== 'number') {
		throw new TypeError(`${name}[${index}] bounds must be numbers`)
	}
	if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
		throw new RangeError(`${name}[${index}] bounds must be finite numbers`)
	}
	if (lo > hi) {
		throw new RangeError(`${name}[${index}] lower bound (${lo}) must not exceed upper bound (${hi})`)
	}
}

/**
 * Adds two vectors of closed real intervals `[lo, hi]` componentwise using a
 * straightforward iterative loop and outward rounding (directed rounding via
 * Fast2Sum with IEEE-754 `nextDown`/`nextUp`) on every addition.
 *
 * For each index `i`, if `a[i] = [aLo, aHi]` and `b[i] = [bLo, bHi]`, the
 * resulting interval `[rLo, rHi]` satisfies the fundamental enclosure property:
 * for every real `x` in `[aLo, aHi]` and `y` in `[bLo, bHi]`, `rLo <= x + y <= rHi`.
 *
 * @param {Array<[number, number]>} a First vector of `[lo, hi]` intervals.
 * @param {Array<[number, number]>} b Second vector of `[lo, hi]` intervals.
 * @returns {Array<[number, number]>} Componentwise sum vector of `[lo, hi]` intervals.
 * @throws {TypeError} If `a` or `b` is not an array, or any entry is not a 2-number tuple `[lo, hi]`.
 * @throws {RangeError} If `a` and `b` have different lengths, any bound is non-finite, or `lo > hi`.
 * @example
 * vectorAddIntervalIterative([[1, 2], [0.1, 0.1]], [[3, 4], [0.2, 0.2]])
 * // => [[4, 6], [0.3, 0.30000000000000004]]
 */
export function vectorAddIntervalIterative(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument "a" must be an array of [lo, hi] intervals')
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument "b" must be an array of [lo, hi] intervals')
	}
	if (a.length !== b.length) {
		throw new RangeError(`Vector length mismatch: a.length (${a.length}) !== b.length (${b.length})`)
	}

	const length = a.length
	const result = new Array(length)

	for (let i = 0; i < length; i++) {
		const intervalA = a[i]
		const intervalB = b[i]
		validateInterval(intervalA, 'a', i)
		validateInterval(intervalB, 'b', i)

		const lo = addDown(intervalA[0], intervalB[0])
		const hi = addUp(intervalA[1], intervalB[1])
		result[i] = [lo, hi]
	}

	return result
}
