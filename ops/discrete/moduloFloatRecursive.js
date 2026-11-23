/**
 * Recursively computes the exact IEEE-754 float64 remainder of `a` modulo `b`
 * for finite `a >= 0` and `b > 0` using divide-and-conquer binary doubling.
 *
 * At each step, if `2 * b <= a`, the quotient is halved by recursively reducing
 * `a` modulo `2 * b` to a value `r` in `[0, 2 * b)`, then subtracting `b` if
 * `r >= b`. Doubling any finite float64 `b <= Number.MAX_VALUE / 2` is exact
 * (including subnormals), and subtracting `b` from a value in `[b, 2 * b)` is
 * exact by Sterbenz's lemma, yielding zero rounding error across all finite
 * IEEE-754 float64 inputs.
 *
 * @param {number} a - Non-negative finite dividend.
 * @param {number} b - Positive finite divisor.
 * @returns {number} Exact remainder in `[0, b)`.
 */
function reduceUnsigned(a, b) {
	if (a < b) {
		return a
	}
	const doubled = b * 2
	if (doubled <= a) {
		const remainder = reduceUnsigned(a, doubled)
		return remainder >= b ? remainder - b : remainder
	}
	return a - b
}

/**
 * Computes the discrete modulo (IEEE-754 float64 truncated remainder) of `a`
 * divided by `b` using a recursive divide-and-conquer algorithm.
 *
 * The returned remainder `r` satisfies `|r| < |b|`, has the same sign as the
 * dividend `a` (preserving `-0` for negative dividends with zero remainder),
 * and is exact over IEEE-754 float64 numbers without using the `%` operator.
 *
 * Time complexity and recursion depth are `O(log(|a| / |b|))`, bounded by at
 * most 2098 stack frames across the entire finite float64 exponent range.
 *
 * @param {number} a - Finite IEEE-754 float64 dividend.
 * @param {number} b - Non-zero finite IEEE-754 float64 divisor.
 * @returns {number} Exact IEEE-754 float64 remainder of `a` modulo `b`.
 * @throws {TypeError} If `a` or `b` is not of type `'number'`.
 * @throws {RangeError} If `a` or `b` is not finite (`NaN`, `±Infinity`), or if `b === 0`.
 */
export function moduloFloatRecursive(a, b) {
	if (typeof a !== 'number' || typeof b !== 'number') {
		throw new TypeError('Expected both dividend a and divisor b to be numbers')
	}
	if (!Number.isFinite(a) || !Number.isFinite(b)) {
		throw new RangeError('Expected both dividend a and divisor b to be finite numbers')
	}
	if (b === 0) {
		throw new RangeError('Divisor b must not be zero')
	}

	if (a === 0) {
		return a
	}

	const absB = b < 0 ? -b : b
	const isNegative = a < 0
	const absA = isNegative ? -a : a
	const remainder = reduceUnsigned(absA, absB)

	return isNegative ? -remainder : remainder
}
