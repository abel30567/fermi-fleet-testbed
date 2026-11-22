/**
 * Compute the greatest common divisor of two BigInts using the iterative Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative greatest common divisor.
 */
function gcdBigInt(a, b) {
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
 * Reduce a rational number num/den to lowest terms with den > 0n (and 0n/1n for zero).
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function normalizeRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator must be non-zero')
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = gcdBigInt(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Validate and normalize a single rational coefficient object.
 *
 * @param {unknown} value
 * @param {number} index
 * @returns {{ num: bigint, den: bigint }}
 */
function validateRational(value, index) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(`coeffs[${index}] must be a rational object { num: BigInt, den: BigInt }`)
	}
	if (typeof value.num !== 'bigint' || typeof value.den !== 'bigint') {
		throw new TypeError(`coeffs[${index}].num and coeffs[${index}].den must be BigInts`)
	}
	if (value.den === 0n) {
		throw new RangeError(`coeffs[${index}].den must be non-zero`)
	}
	return normalizeRational(value.num, value.den)
}

/**
 * Remove redundant trailing zero terms while keeping at least one term (for the zero polynomial).
 *
 * @param {Array<{ num: bigint, den: bigint }>} poly
 * @returns {Array<{ num: bigint, den: bigint }>}
 */
function trimTrailingZeros(poly) {
	while (poly.length > 1 && poly[poly.length - 1].num === 0n) {
		poly.pop()
	}
	return poly
}

/**
 * Compute the exact symbolic derivative of a univariate polynomial over exact rationals
 * using a straightforward iterative implementation.
 *
 * Polynomial coefficients are given in ascending power order `[c0, c1, c2, ...]`
 * representing `p(x) = sum_{i=0}^{n} c_i * x^i`, where each coefficient is an exact
 * rational `{ num: BigInt, den: BigInt }`.
 *
 * Each returned coefficient is reduced to lowest terms with `den > 0n` (and `0n / 1n` for zero).
 * Trailing zero terms are trimmed so that constant polynomials differentiate to
 * `[{ num: 0n, den: 1n }]`.
 *
 * @param {Array<{ num: bigint, den: bigint }>} coeffs - Non-empty array of exact rational coefficients.
 * @param {number} [order=1] - Non-negative integer differentiation order.
 * @returns {Array<{ num: bigint, den: bigint }>} Exact rational coefficients of the `order`-th derivative.
 * @throws {TypeError} If `coeffs` is not an array of `{ num: BigInt, den: BigInt }` objects or `order` is not a number.
 * @throws {RangeError} If `coeffs` is empty, any denominator is `0n`, or `order` is not a non-negative safe integer.
 */
export function derivativeRationalIterative(coeffs, order = 1) {
	if (!Array.isArray(coeffs)) {
		throw new TypeError('coeffs must be an array of rational objects')
	}
	if (coeffs.length === 0) {
		throw new RangeError('coeffs must be a non-empty array')
	}
	if (typeof order !== 'number' || Number.isNaN(order)) {
		throw new TypeError('order must be a non-negative integer')
	}
	if (!Number.isInteger(order) || !Number.isSafeInteger(order) || order < 0) {
		throw new RangeError('order must be a non-negative safe integer')
	}

	let current = new Array(coeffs.length)
	for (let i = 0; i < coeffs.length; i++) {
		current[i] = validateRational(coeffs[i], i)
	}
	trimTrailingZeros(current)

	for (let step = 0; step < order; step++) {
		if (current.length <= 1) {
			current = [{ num: 0n, den: 1n }]
			break
		}
		const next = new Array(current.length - 1)
		for (let i = 1; i < current.length; i++) {
			const c = current[i]
			next[i - 1] = normalizeRational(c.num * BigInt(i), c.den)
		}
		current = trimTrailingZeros(next)
	}

	return current
}
