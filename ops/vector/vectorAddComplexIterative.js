/**
 * @typedef {Object} Complex
 * @property {number} re - The real part of the complex number (must be finite).
 * @property {number} im - The imaginary part of the complex number (must be finite).
 */

/**
 * Validates that a value is a well-formed complex number object `{ re, im }`
 * with finite numeric components.
 *
 * @param {unknown} value - The value to validate.
 * @param {string} vectorName - The parameter name for error reporting.
 * @param {number} index - The element index for error reporting.
 * @throws {TypeError} If the element is missing, not an object, or has non-numeric `re`/`im`.
 * @throws {RangeError} If `re` or `im` is not a finite number (`NaN`, `Infinity`, `-Infinity`).
 */
function assertComplexElement(value, vectorName, index) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(
			`${vectorName}[${index}] must be a complex number object { re, im }`,
		)
	}
	if (typeof value.re !== 'number' || typeof value.im !== 'number') {
		throw new TypeError(
			`${vectorName}[${index}] must have numeric re and im properties`,
		)
	}
	if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
		throw new RangeError(
			`${vectorName}[${index}] must have finite re and im values`,
		)
	}
}

/**
 * Adds two vectors of complex numbers element-wise using a straightforward
 * iterative loop.
 *
 * Each element is represented as a plain object `{ re, im }` where `re` and `im`
 * are finite JavaScript numbers. Neither input vector is mutated.
 *
 * @param {ReadonlyArray<Complex>} a - First input vector of complex numbers.
 * @param {ReadonlyArray<Complex>} b - Second input vector of complex numbers.
 * @returns {Complex[]} A new array where each element `i` is `{ re: a[i].re + b[i].re, im: a[i].im + b[i].im }`.
 * @throws {TypeError} If `a` or `b` is not an Array, is sparse, or contains invalid complex elements.
 * @throws {RangeError} If `a` and `b` have different lengths or contain non-finite `re`/`im` values.
 */
export function vectorAddComplexIterative(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument "a" must be an Array')
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument "b" must be an Array')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Vector lengths must match (received ${a.length} and ${b.length})`,
		)
	}

	const len = a.length
	const result = new Array(len)

	for (let i = 0; i < len; i++) {
		if (!(i in a)) {
			throw new TypeError(`a[${i}] is a sparse hole; expected { re, im }`)
		}
		if (!(i in b)) {
			throw new TypeError(`b[${i}] is a sparse hole; expected { re, im }`)
		}

		const elemA = a[i]
		const elemB = b[i]
		assertComplexElement(elemA, 'a', i)
		assertComplexElement(elemB, 'b', i)

		result[i] = {
			re: elemA.re + elemB.re,
			im: elemA.im + elemB.im,
		}
	}

	return result
}
