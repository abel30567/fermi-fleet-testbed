/**
 * Computes the exact m-th derivative of a polynomial / power series with BigInt
 * coefficients using the closed-form falling-factorial power rule, and
 * optionally evaluates it at a BigInt point using Horner's method.
 *
 * The input polynomial is represented in ascending-power order:
 *   P(x) = sum_{k=0}^{n} coeffs[k] * x^k
 *
 * Its m-th derivative is:
 *   P^(m)(x) = sum_{j=0}^{n-m} (coeffs[j + m] * (j + m)! / j!) * x^j
 *
 * All arithmetic is performed in exact arbitrary-precision BigInt with zero
 * dependencies and no floating-point rounding.
 *
 * @param {readonly bigint[]} coeffs - Polynomial coefficients where `coeffs[k]`
 *   is the coefficient of `x^k`. Must be a dense array of `bigint` values.
 * @param {bigint} [x] - Optional evaluation point. If omitted (`undefined`),
 *   the exact derivative coefficient array (trimmed of trailing zeros, with
 *   `[0n]` for the zero polynomial) is returned. If provided as a `bigint`,
 *   the derivative is evaluated at `x` via Horner's method and a single
 *   `bigint` is returned.
 * @param {number} [order=1] - Derivative order (non-negative safe integer).
 *   Order `0` returns the normalized polynomial (or evaluates it at `x`).
 * @returns {bigint[] | bigint} The derivative coefficient array when `x` is
 *   omitted, or the evaluated derivative value as a `bigint` when `x` is
 *   provided.
 * @throws {TypeError} If `coeffs` is not a dense array of `bigint`s, `x` is
 *   neither `undefined` nor a `bigint`, or `order` is not a `number`.
 * @throws {RangeError} If `order` is not a non-negative safe integer.
 */
export function derivativeBigIntSeries(coeffs, x = undefined, order = 1) {
	if (!Array.isArray(coeffs)) {
		throw new TypeError('coeffs must be an array of BigInt coefficients')
	}
	for (let i = 0; i < coeffs.length; i++) {
		if (!(i in coeffs) || typeof coeffs[i] !== 'bigint') {
			throw new TypeError(`coeffs[${i}] must be a BigInt`)
		}
	}
	if (x !== undefined && typeof x !== 'bigint') {
		throw new TypeError('x must be a BigInt or undefined')
	}
	if (typeof order !== 'number') {
		throw new TypeError('order must be a non-negative safe integer')
	}
	if (!Number.isSafeInteger(order) || order < 0) {
		throw new RangeError('order must be a non-negative safe integer')
	}

	// Determine effective length (ignoring trailing zero coefficients).
	let effectiveLen = coeffs.length
	while (effectiveLen > 0 && coeffs[effectiveLen - 1] === 0n) {
		effectiveLen--
	}

	// Zero polynomial or order exceeds polynomial degree.
	if (effectiveLen === 0 || order >= effectiveLen) {
		return x === undefined ? [0n] : 0n
	}

	let derivCoeffs
	if (order === 0) {
		derivCoeffs = coeffs.slice(0, effectiveLen)
	} else {
		const outLen = effectiveLen - order
		derivCoeffs = new Array(outLen)

		// Falling factorial factor F(j) = (j + order)! / j!.
		// Base case j = 0: F(0) = order!
		let fallingFactorial = 1n
		for (let i = 2n; i <= BigInt(order); i++) {
			fallingFactorial *= i
		}

		// Recurrence: F(j + 1) = F(j) * (j + order + 1) / (j + 1), always exact.
		const orderBig = BigInt(order)
		for (let j = 0; j < outLen; j++) {
			derivCoeffs[j] = coeffs[j + order] * fallingFactorial
			if (j + 1 < outLen) {
				const jNext = BigInt(j + 1)
				fallingFactorial = (fallingFactorial * (jNext + orderBig)) / jNext
			}
		}

		// Trim any trailing zeros (defensive; top term is non-zero since coeffs[effectiveLen - 1] !== 0n).
		while (derivCoeffs.length > 1 && derivCoeffs[derivCoeffs.length - 1] === 0n) {
			derivCoeffs.pop()
		}
	}

	if (x === undefined) {
		return derivCoeffs
	}

	// Evaluate derivative at x using Horner's method.
	let acc = 0n
	for (let i = derivCoeffs.length - 1; i >= 0; i--) {
		acc = acc * x + derivCoeffs[i]
	}
	return acc
}
