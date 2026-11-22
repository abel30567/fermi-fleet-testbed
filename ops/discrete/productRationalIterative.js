/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 * An exact rational number represented in lowest terms with `den > 0n`
 * (and `{ num: 0n, den: 1n }` for zero).
 */

/**
 * Computes the greatest common divisor of two BigInt values using the
 * iterative Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative GCD of `a` and `b`.
 */
function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const remainder = x % y
		x = y
		y = remainder
	}
	return x
}

/**
 * Validates that a single value is a well-formed rational object
 * `{ num: bigint, den: bigint }` with a non-zero denominator.
 *
 * @param {unknown} value
 * @param {number} index
 * @throws {TypeError} If `value` is not an object with BigInt `num` and `den` properties.
 * @throws {RangeError} If `value.den === 0n`.
 */
function validateRational(value, index) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(
			`Expected rational object { num: bigint, den: bigint } at index ${index}`
		)
	}
	if (typeof value.num !== 'bigint' || typeof value.den !== 'bigint') {
		throw new TypeError(
			`Expected BigInt num and den fields at index ${index}`
		)
	}
	if (value.den === 0n) {
		throw new RangeError(`Denominator must not be zero at index ${index}`)
	}
}

/**
 * Computes the exact discrete product of an array of rational numbers iteratively.
 *
 * Returns `{ num: 1n, den: 1n }` for an empty array (the multiplicative identity),
 * `{ num: 0n, den: 1n }` if any factor has a zero numerator, and otherwise the
 * exact product reduced to lowest terms with a strictly positive denominator.
 * Reduction and cross-cancellation are performed at every step to avoid
 * intermediate BigInt blowup. All elements are validated even when an earlier
 * factor is zero.
 *
 * @param {ReadonlyArray<Rational>} values - Array of exact rational factors.
 * @returns {Rational} The reduced exact rational product `{ num, den }` with `den > 0n`.
 * @throws {TypeError} If `values` is not an Array or any element lacks BigInt `num`/`den`.
 * @throws {RangeError} If any element has a zero denominator (`den === 0n`).
 */
export function productRationalIterative(values) {
	if (!Array.isArray(values)) {
		throw new TypeError('Expected values to be an Array of rational objects')
	}

	let accNum = 1n
	let accDen = 1n
	let isZero = false

	for (let i = 0; i < values.length; i++) {
		const item = values[i]
		validateRational(item, i)

		if (isZero) {
			continue
		}

		let num = item.num
		let den = item.den

		if (num === 0n) {
			accNum = 0n
			accDen = 1n
			isZero = true
			continue
		}

		if (den < 0n) {
			num = -num
			den = -den
		}

		const gSelf = gcdBigInt(num, den)
		if (gSelf > 1n) {
			num /= gSelf
			den /= gSelf
		}

		const g1 = gcdBigInt(accNum, den)
		const g2 = gcdBigInt(num, accDen)

		accNum = (accNum / g1) * (num / g2)
		accDen = (accDen / g2) * (den / g1)
	}

	return { num: accNum, den: accDen }
}
