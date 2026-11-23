/**
 * Normalizes negative zero to positive zero.
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
 * @param {unknown} z
 * @returns {{ re: number, im: number }}
 */
function validateComplex(z) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError('base must be a complex number object with numeric re and im properties')
	}
	if (typeof z.re !== 'number' || typeof z.im !== 'number') {
		throw new TypeError('base.re and base.im must be numbers')
	}
	if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
		throw new RangeError('base.re and base.im must be finite numbers')
	}
	return z
}

/**
 * Validates that the exponent is a safe integer.
 *
 * @param {unknown} exponent
 * @returns {number}
 */
function validateExponent(exponent) {
	if (typeof exponent !== 'number') {
		throw new TypeError('exponent must be a number')
	}
	if (!Number.isSafeInteger(exponent)) {
		throw new RangeError('exponent must be a safe integer')
	}
	return exponent
}

/**
 * Multiplies two complex numbers.
 *
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @returns {{ re: number, im: number }}
 */
function multiplyComplex(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

/**
 * Computes the multiplicative inverse `1 / z` using scaled division to avoid overflow/underflow.
 *
 * @param {{ re: number, im: number }} z
 * @returns {{ re: number, im: number }}
 */
function invertComplex(z) {
	if (Math.abs(z.re) >= Math.abs(z.im)) {
		const ratio = z.im / z.re
		const denom = z.re + z.im * ratio
		return {
			re: 1 / denom,
			im: -ratio / denom,
		}
	}
	const ratio = z.re / z.im
	const denom = z.im + z.re * ratio
	return {
		re: ratio / denom,
		im: -1 / denom,
	}
}

/**
 * Raises a complex number `{ re, im }` to an integer exponent using a straightforward
 * iterative repeated-multiplication algorithm.
 *
 * For `exponent === 0`, returns `{ re: 1, im: 0 }` (including for `{ re: 0, im: 0 }`).
 * For negative exponents, computes the multiplicative inverse of `base` and iteratively
 * multiplies it `|exponent|` times.
 *
 * @param {{ re: number, im: number }} base - The complex base `{ re, im }` with finite components.
 * @param {number} exponent - A safe integer exponent.
 * @returns {{ re: number, im: number }} The complex result `base ** exponent`.
 * @throws {TypeError} If `base` is not an object with numeric `re` and `im`, or `exponent` is not a number.
 * @throws {RangeError} If `base` components are non-finite, `exponent` is not a safe integer,
 *   or `base` is zero while `exponent` is negative.
 */
export function powerComplexIterative(base, exponent) {
	const validatedBase = validateComplex(base)
	const validatedExponent = validateExponent(exponent)

	if (validatedBase.re === 0 && validatedBase.im === 0 && validatedExponent < 0) {
		throw new RangeError('Cannot raise zero complex number to a negative exponent')
	}

	if (validatedExponent === 0) {
		return { re: 1, im: 0 }
	}

	const factor =
		validatedExponent < 0
			? invertComplex(validatedBase)
			: { re: validatedBase.re, im: validatedBase.im }

	const steps = Math.abs(validatedExponent)
	let result = { re: 1, im: 0 }

	for (let i = 0; i < steps; i++) {
		result = multiplyComplex(result, factor)
	}

	return {
		re: normalizeZero(result.re),
		im: normalizeZero(result.im),
	}
}
