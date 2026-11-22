/**
 * Validates that a value is a finite complex number object of the form `{ re, im }`.
 *
 * @param {unknown} value - Candidate complex number.
 * @param {string} vectorName - Parameter name for error diagnostics.
 * @param {number} index - Element index within the vector.
 * @throws {TypeError} If `value` is not a plain-like object with numeric `re` and `im` properties.
 * @throws {RangeError} If `re` or `im` is not a finite number (`NaN`, `Infinity`, or `-Infinity`).
 */
function assertValidComplex(value, vectorName, index) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(
			`${vectorName}[${index}] must be a complex object { re, im }`,
		)
	}
	const { re, im } = value
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(
			`${vectorName}[${index}] must have numeric re and im properties`,
		)
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(
			`${vectorName}[${index}] must have finite re and im values`,
		)
	}
}

/**
 * Computes the elementwise vector sum of two equal-length complex vectors using
 * the closed-form Cartesian basis identity over C^n:
 *
 *   (a + b)_k = (Re(a_k) + Re(b_k)) + i * (Im(a_k) + Im(b_k))
 *
 * Neither input array nor any of its `{ re, im }` elements is mutated.
 *
 * @param {Array<{ re: number, im: number }>} a - First complex vector.
 * @param {Array<{ re: number, im: number }>} b - Second complex vector of equal length.
 * @returns {Array<{ re: number, im: number }>} New complex vector representing `a + b`.
 * @throws {TypeError} If `a` or `b` is not an array, or any element is not a valid `{ re, im }` object with numeric components.
 * @throws {RangeError} If `a` and `b` have different lengths, or any component is non-finite (`NaN`, `±Infinity`).
 */
export function vectorAddComplexSeries(a, b) {
	if (!Array.isArray(a) || !Array.isArray(b)) {
		throw new TypeError('Both arguments a and b must be arrays')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Vector length mismatch: a.length (${a.length}) !== b.length (${b.length})`,
		)
	}

	const n = a.length
	const result = new Array(n)

	for (let k = 0; k < n; k++) {
		const ak = a[k]
		const bk = b[k]
		assertValidComplex(ak, 'a', k)
		assertValidComplex(bk, 'b', k)

		result[k] = {
			re: ak.re + bk.re,
			im: ak.im + bk.im,
		}
	}

	return result
}
