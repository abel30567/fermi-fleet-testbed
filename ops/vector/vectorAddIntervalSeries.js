/**
 * @fileoverview Interval vector addition with guaranteed IEEE-754 outward rounding.
 *
 * Implements component-wise Minkowski addition of interval vectors over closed real
 * intervals `[lo, hi]` using the exact closed-form endpoint identity:
 *
 *   `[a_lo, a_hi] + [b_lo, b_hi] = [a_lo + b_lo, a_hi + b_hi]`
 *
 * paired with Dekker's error-free transformation identity (`FastTwoSum`, exact for all
 * finite binary64 operands whose rounded sum does not overflow):
 *
 *   `x + y = s + e`,  where `s = fl(x + y)` and `e = b - (s - a)` for `|a| >= |b|`.
 *
 * Inspecting the exact residual `e` and stepping via IEEE-754 `nextDown` / `nextUp`
 * guarantees tight (0-ULP when exact, 1-ULP when inexact) outward-rounded enclosure
 * for every component, including subnormals and overflow boundaries.
 */

const f64 = new Float64Array(1)
const u64 = new BigUint64Array(f64.buffer)

/**
 * Returns the smallest IEEE-754 binary64 value strictly greater than `x`.
 *
 * @param {number} x
 * @returns {number}
 */
function nextUp(x) {
	if (Number.isNaN(x) || x === Infinity) return x
	if (x === 0) return Number.MIN_VALUE
	f64[0] = x
	if (x > 0) {
		u64[0] += 1n
	} else {
		u64[0] -= 1n
	}
	const result = f64[0]
	return result === 0 ? 0 : result
}

/**
 * Returns the largest IEEE-754 binary64 value strictly less than `x`.
 *
 * @param {number} x
 * @returns {number}
 */
function nextDown(x) {
	if (Number.isNaN(x) || x === -Infinity) return x
	if (x === 0) return -Number.MIN_VALUE
	f64[0] = x
	if (x > 0) {
		u64[0] -= 1n
	} else {
		u64[0] += 1n
	}
	const result = f64[0]
	return result === 0 ? 0 : result
}

/**
 * Computes the exact rounding residual of `x + y` using Dekker's FastTwoSum identity.
 * Assumes `x`, `y`, and `s = x + y` are all finite binary64 numbers.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} s - IEEE-754 sum `x + y`.
 * @returns {number} Exact error `e` such that `x + y = s + e` over the reals.
 */
function exactAddResidual(x, y, s) {
	if (Math.abs(x) >= Math.abs(y)) {
		return y - (s - x)
	}
	return x - (s - y)
}

/**
 * Computes the tightest binary64 lower bound `<= x + y` (directed rounding toward -Infinity).
 *
 * @param {number} x - Finite number.
 * @param {number} y - Finite number.
 * @returns {number}
 */
function addDown(x, y) {
	const s = x + y
	if (s === Infinity) return Number.MAX_VALUE
	if (s === -Infinity) return -Infinity
	const e = exactAddResidual(x, y, s)
	const lo = e < 0 ? nextDown(s) : s
	return lo === 0 ? 0 : lo
}

/**
 * Computes the tightest binary64 upper bound `>= x + y` (directed rounding toward +Infinity).
 *
 * @param {number} x - Finite number.
 * @param {number} y - Finite number.
 * @returns {number}
 */
function addUp(x, y) {
	const s = x + y
	if (s === Infinity) return Infinity
	if (s === -Infinity) return -Number.MAX_VALUE
	const e = exactAddResidual(x, y, s)
	const hi = e > 0 ? nextUp(s) : s
	return hi === 0 ? 0 : hi
}

/**
 * Validates that `interval` is a well-formed finite closed interval `[lo, hi]` with `lo <= hi`.
 *
 * @param {unknown} interval
 * @param {string} name - Parameter name for diagnostics.
 * @param {number} index - Element index in the vector.
 * @returns {[number, number]}
 */
function validateInterval(interval, name, index) {
	if (!Array.isArray(interval) || interval.length !== 2) {
		throw new TypeError(`${name}[${index}] must be a [lo, hi] array of length 2`)
	}
	const lo = interval[0]
	const hi = interval[1]
	if (typeof lo !== 'number' || typeof hi !== 'number') {
		throw new TypeError(`${name}[${index}] bounds must be numbers`)
	}
	if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
		throw new RangeError(`${name}[${index}] bounds must be finite numbers`)
	}
	if (lo > hi) {
		throw new RangeError(`${name}[${index}] must satisfy lo <= hi (got [${lo}, ${hi}])`)
	}
	return [lo, hi]
}

/**
 * Adds two interval vectors component-wise over `[lo, hi]` intervals with outward rounding
 * guaranteeing mathematical enclosure.
 *
 * For each index `i`, every pair `(x, y)` with `x in a[i]` and `y in b[i]` is guaranteed to
 * satisfy `result[i][0] <= x + y <= result[i][1]` over the real numbers.
 *
 * @param {Array<[number, number]>} a - First interval vector (each element `[lo, hi]`, finite, `lo <= hi`).
 * @param {Array<[number, number]>} b - Second interval vector of the same length as `a`.
 * @returns {Array<[number, number]>} Outward-rounded interval sum vector (endpoints may be `±Infinity` on overflow).
 * @throws {TypeError} If `a` or `b` is not an array, or any element is not a numeric `[lo, hi]` pair.
 * @throws {RangeError} If `a.length !== b.length`, any bound is non-finite (`NaN`/`±Infinity`), or `lo > hi`.
 */
export function vectorAddIntervalSeries(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument a must be an array of [lo, hi] intervals')
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument b must be an array of [lo, hi] intervals')
	}
	if (a.length !== b.length) {
		throw new RangeError(`Vector length mismatch: a.length (${a.length}) !== b.length (${b.length})`)
	}

	const n = a.length
	const result = new Array(n)

	for (let i = 0; i < n; i++) {
		const [aLo, aHi] = validateInterval(a[i], 'a', i)
		const [bLo, bHi] = validateInterval(b[i], 'b', i)
		result[i] = [addDown(aLo, bLo), addUp(aHi, bHi)]
	}

	return result
}
