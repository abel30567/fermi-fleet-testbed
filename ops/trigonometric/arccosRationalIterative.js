/**
 * @typedef {Object} Rational
 * @property {bigint} num - Numerator of the rational number.
 * @property {bigint} den - Non-zero denominator of the rational number.
 */

/**
 * @typedef {Object} ArccosOptions
 * @property {number} [precision=50] - Number of decimal digits of precision (positive integer).
 */

/**
 * Compute the greatest common divisor of two BigInts using the iterative Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative GCD of a and b.
 */
function bigIntGcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

/**
 * Reduce a rational number to lowest terms with a positive denominator.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function reduceRational(num, den) {
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	if (n === 0n) {
		return { num: 0n, den: 1n }
	}
	const g = bigIntGcd(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Compute the exact integer square root floor(sqrt(n)) for a non-negative BigInt
 * using iterative Newton-Heron refinement.
 *
 * @param {bigint} n
 * @returns {bigint}
 */
function bigIntSqrt(n) {
	if (n < 0n) {
		throw new RangeError('Square root of a negative integer is undefined')
	}
	if (n < 2n) {
		return n
	}
	const bitLength = n.toString(2).length
	let x = 1n << BigInt((bitLength + 1) >> 1)
	while (true) {
		const next = (x + n / x) >> 1n
		if (next >= x) {
			return x
		}
		x = next
	}
}

/**
 * Compute floor(scale * arcsin(u / scale)) iteratively via the Maclaurin series:
 *   arcsin(z) = sum_{k=0}^{inf} ((2k)! / (4^k (k!)^2 (2k + 1))) * z^(2k + 1)
 *
 * Requires 0 <= u <= scale / 2 so each term shrinks by more than a factor of 4.
 *
 * @param {bigint} u - Non-negative fixed-point input scaled by `scale`.
 * @param {bigint} scale - Fixed-point scaling factor.
 * @returns {bigint} Fixed-point approximation of scale * arcsin(u / scale).
 */
function arcsinFixed(u, scale) {
	if (u === 0n) {
		return 0n
	}
	const uSq = u * u
	const scaleSq = scale * scale
	let sum = u
	let coeffPower = u
	let k = 1n
	while (true) {
		const twoK = 2n * k
		coeffPower = (coeffPower * (twoK - 1n) * uSq) / (twoK * scaleSq)
		const term = coeffPower / (twoK + 1n)
		if (term === 0n) {
			break
		}
		sum += term
		k += 1n
	}
	return sum
}

/**
 * Compute arccos(x) over exact rational numbers using a straightforward iterative algorithm.
 *
 * Algorithm:
 * 1. Validate and normalize the input rational `x = num / den` in `[-1, 1]`.
 * 2. Return exact `{ num: 0n, den: 1n }` when `x = 1`.
 * 3. For `x in [-1, 1)`, apply exact half-angle argument reduction:
 *      arccos(x) = 2 * arccos(sqrt((1 + x) / 2))
 *    iteratively (at most twice) until the argument `y >= 1/2`, then apply:
 *      arccos(y) = 2 * arcsin(sqrt((1 - y) / 2))
 *    where `u = sqrt((1 - y) / 2) <= 1/2`.
 * 4. Evaluate `arcsin(u)` iteratively via its Maclaurin series in fixed-point BigInt arithmetic
 *    with guard digits, round to the requested decimal precision, and reduce to lowest terms.
 *
 * @param {Rational} x - Rational input `{ num: BigInt, den: BigInt }` with `-1 <= x <= 1`.
 * @param {ArccosOptions} [options={}] - Optional configuration object.
 * @returns {Rational} Reduced rational `{ num: BigInt, den: BigInt }` with `den > 0n` approximating `arccos(x)`.
 * @throws {TypeError} If `x` is not a valid rational object with BigInt `num`/`den`, or `options` is invalid.
 * @throws {RangeError} If `x.den === 0n`, `|x| > 1`, or `options.precision` is not a positive integer.
 */
export function arccosRationalIterative(x, options = {}) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('Input x must be an object with BigInt properties { num, den }')
	}
	if (typeof x.num !== 'bigint' || typeof x.den !== 'bigint') {
		throw new TypeError('Input x.num and x.den must both be BigInt values')
	}
	if (x.den === 0n) {
		throw new RangeError('Input rational denominator x.den must not be zero')
	}
	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('Options must be a plain object')
	}

	const { precision = 50 } = options
	if (typeof precision !== 'number') {
		throw new TypeError('options.precision must be a number')
	}
	if (!Number.isInteger(precision) || precision < 1) {
		throw new RangeError('options.precision must be a positive integer')
	}

	const { num, den } = reduceRational(x.num, x.den)
	if (num < -den || num > den) {
		throw new RangeError('Input x is out of domain: arccos requires -1 <= x <= 1')
	}

	// Exact special case: arccos(1) = 0
	if (num === den) {
		return { num: 0n, den: 1n }
	}

	const guardDigits = 16
	const outputScale = 10n ** BigInt(precision)
	const guardScale = 10n ** BigInt(guardDigits)
	const workScale = outputScale * guardScale
	const workScaleSq = workScale * workScale

	let multiplier
	let uFixed

	if (2n * num >= den) {
		// x in [1/2, 1): compute (1 - x) / 2 directly from the exact rational to avoid cancellation
		multiplier = 2n
		uFixed = bigIntSqrt(((den - num) * workScaleSq) / (2n * den))
	} else {
		// x in [-1, 1/2): first half-angle step directly from exact rational (1 + x) / 2
		let yFixed = bigIntSqrt(((den + num) * workScaleSq) / (2n * den))
		multiplier = 4n
		while (2n * yFixed < workScale) {
			yFixed = bigIntSqrt(((workScale + yFixed) * workScale) / 2n)
			multiplier *= 2n
		}
		uFixed = bigIntSqrt(((workScale - yFixed) * workScale) / 2n)
	}

	const raw = multiplier * arcsinFixed(uFixed, workScale)
	const rounded = (raw + guardScale / 2n) / guardScale
	return reduceRational(rounded, outputScale)
}
