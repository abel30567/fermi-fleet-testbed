/**
 * Validates that a value is a finite complex number object `{ re, im }`.
 *
 * @param {unknown} value - The value to validate.
 * @param {number} index - Zero-based position of the value in the input sequence.
 * @throws {TypeError} If `value` is not a non-null, non-array object with numeric `re` and `im`.
 * @throws {RangeError} If `value.re` or `value.im` is `NaN` or not finite.
 */
function validateComplex(value, index) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`Argument at index ${index} must be a complex number object { re, im }`)
	}
	if (typeof value.re !== 'number' || typeof value.im !== 'number') {
		throw new TypeError(`Complex number at index ${index} must have numeric re and im properties`)
	}
	if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
		throw new RangeError(`Complex number at index ${index} must have finite re and im values`)
	}
}

/**
 * Adds one or more complex numbers represented as `{ re, im }` objects
 * using a straightforward iterative summation loop.
 *
 * Accepts either variadic complex number arguments `addComplexIterative(a, b, ...)`
 * or a single non-empty array of complex numbers `addComplexIterative([a, b, ...])`.
 *
 * @param {...({ re: number, im: number } | Array<{ re: number, im: number }>)} args
 *   Complex numbers to add, or a single array of complex numbers.
 * @returns {{ re: number, im: number }} The complex sum `{ re, im }`.
 * @throws {TypeError} If no arguments are given or any term is not a `{ re, im }` object with numeric fields.
 * @throws {RangeError} If an empty array is given or any component is `NaN` or non-finite.
 */
export function addComplexIterative(...args) {
	if (args.length === 0) {
		throw new TypeError('addComplexIterative requires at least one complex number')
	}

	const terms = args.length === 1 && Array.isArray(args[0]) ? args[0] : args

	if (terms.length === 0) {
		throw new RangeError('addComplexIterative requires at least one complex number')
	}

	let re = 0
	let im = 0

	for (let i = 0; i < terms.length; i += 1) {
		const term = terms[i]
		validateComplex(term, i)
		re += term.re
		im += term.im
	}

	return {
		re: re === 0 ? 0 : re,
		im: im === 0 ? 0 : im,
	}
}
