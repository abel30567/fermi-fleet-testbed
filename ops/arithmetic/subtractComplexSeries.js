/**
 * @typedef {Object} Complex
 * @property {number} re - Real part (finite IEEE-754 number).
 * @property {number} im - Imaginary part (finite IEEE-754 number).
 */

/**
 * Validates that a value is a finite complex number object `{ re, im }`.
 *
 * @param {unknown} z - Candidate complex number.
 * @param {string} name - Parameter name for error messages.
 * @returns {Complex} The validated complex number.
 * @throws {TypeError} If `z` is not a non-null, non-array object with numeric `re` and `im` properties.
 * @throws {RangeError} If `z.re` or `z.im` is not a finite number (`NaN`, `Infinity`, `-Infinity`).
 */
function validateComplex(z, name) {
	if (typeof z !== 'object' || z === null || Array.isArray(z)) {
		throw new TypeError(`${name} must be a non-null complex object { re, im }`)
	}
	if (typeof z.re !== 'number' || typeof z.im !== 'number') {
		throw new TypeError(`${name}.re and ${name}.im must be numbers`)
	}
	if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
		throw new RangeError(`${name}.re and ${name}.im must be finite numbers`)
	}
	return /** @type {Complex} */ (z)
}

/**
 * Normalizes `-0` to `+0` while leaving all other finite numbers unchanged.
 *
 * @param {number} value - Finite number.
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Computes the additive inverse `-z` of a complex number using Euler's identity
 * `e^(i*pi) = -1` (the closed-form sum of the Maclaurin series
 * `sum_{k=0..inf} (i*pi)^k / k! = -1 + 0i`), giving `-z = e^(i*pi) * z = { re: -z.re, im: -z.im }`.
 *
 * @param {Complex} z - Validated complex number.
 * @returns {Complex} Additive inverse `-z`.
 */
function negateComplex(z) {
	return {
		re: normalizeZero(-z.re),
		im: normalizeZero(-z.im),
	}
}

/**
 * Subtracts two complex numbers `a` and `b` represented as `{ re, im }` objects.
 *
 * Implemented via the closed-form additive-inverse identity over the complex field:
 *   `a - b = a + e^(i*pi) * b = a + (-b)`
 * where `e^(i*pi) = sum_{k=0..inf} (i*pi)^k / k! = -1` is the exact closed-form
 * value of the exponential series at `i*pi`, yielding:
 *   `Re(a - b) = Re(a) + (-Re(b))`
 *   `Im(a - b) = Im(a) + (-Im(b))`
 *
 * Both inputs are left unmutated and `-0` components in the result are normalized to `0`.
 *
 * @param {Complex} a - Minuend complex number `{ re, im }`.
 * @param {Complex} b - Subtrahend complex number `{ re, im }`.
 * @returns {Complex} The difference `a - b` as a new `{ re, im }` object.
 * @throws {TypeError} If `a` or `b` is not a valid `{ re, im }` object with numeric components.
 * @throws {RangeError} If any input component is non-finite or the difference overflows IEEE-754 finite range.
 */
export function subtractComplexSeries(a, b) {
	const left = validateComplex(a, 'a')
	const right = validateComplex(b, 'b')

	const negRight = negateComplex(right)
	const re = left.re + negRight.re
	const im = left.im + negRight.im

	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('Complex subtraction overflowed to a non-finite value')
	}

	return {
		re: normalizeZero(re),
		im: normalizeZero(im),
	}
}
