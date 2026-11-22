/**
 * Computes the Hermitian inner (dot) product of two complex vectors iteratively.
 *
 * Uses the standard physics/linear-algebra convention that is linear in the
 * first argument and conjugate-linear in the second argument:
 *
 *   ⟨a, b⟩ = Σ_{k=0}^{n-1} a[k] * conj(b[k])
 *          = Σ_{k=0}^{n-1} ((a[k].re * b[k].re + a[k].im * b[k].im)
 *                         + i * (a[k].im * b[k].re - a[k].re * b[k].im))
 *
 * For empty vectors, returns `{ re: 0, im: 0 }`.
 *
 * @typedef {{ re: number, im: number }} Complex
 *
 * @param {Complex[]} a - First complex vector.
 * @param {Complex[]} b - Second complex vector (conjugated in the sum).
 * @returns {Complex} The Hermitian dot product `{ re, im }`.
 * @throws {TypeError} If `a` or `b` is not an array, or if any element is not
 *   an object with numeric `re` and `im` properties.
 * @throws {RangeError} If `a` and `b` have different lengths, or if any `re`
 *   or `im` component is not a finite number (`NaN`, `Infinity`, `-Infinity`).
 */
export function dotProductComplexIterative(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument "a" must be an array of { re, im } complex numbers')
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument "b" must be an array of { re, im } complex numbers')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Vector length mismatch: a.length (${a.length}) !== b.length (${b.length})`
		)
	}

	let sumRe = 0
	let sumIm = 0

	for (let k = 0; k < a.length; k++) {
		const ak = validateComplex(a[k], 'a', k)
		const bk = validateComplex(b[k], 'b', k)

		// a[k] * conj(b[k]) = (aRe + i*aIm) * (bRe - i*bIm)
		//                   = (aRe*bRe + aIm*bIm) + i*(aIm*bRe - aRe*bIm)
		sumRe += ak.re * bk.re + ak.im * bk.im
		sumIm += ak.im * bk.re - ak.re * bk.im
	}

	return {
		re: sumRe === 0 ? 0 : sumRe,
		im: sumIm === 0 ? 0 : sumIm,
	}
}

/**
 * Validates that a value is a finite `{ re, im }` complex number object.
 *
 * @param {unknown} value - Candidate complex number.
 * @param {string} name - Vector parameter name for error reporting.
 * @param {number} index - Element index for error reporting.
 * @returns {Complex} The validated complex object.
 * @throws {TypeError} If value is not an object with numeric `re` and `im`.
 * @throws {RangeError} If `re` or `im` is not finite.
 */
function validateComplex(value, name, index) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(
			`Element ${name}[${index}] must be an object with numeric "re" and "im" properties`
		)
	}
	if (typeof value.re !== 'number' || typeof value.im !== 'number') {
		throw new TypeError(
			`Element ${name}[${index}] must have numeric "re" and "im" properties`
		)
	}
	if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
		throw new RangeError(
			`Element ${name}[${index}] components "re" and "im" must be finite numbers`
		)
	}
	return value
}
