/**
 * Validate that a value is a complex number object `{ re, im }` with finite numeric components.
 *
 * @param {unknown} value - Candidate complex number to validate.
 * @param {number} index - Zero-based operand position for error reporting.
 * @returns {{ re: number, im: number }} Validated complex number.
 * @throws {TypeError} If `value` is not a non-null, non-array object with numeric `re` and `im`.
 * @throws {RangeError} If `re` or `im` is not a finite number (`NaN`, `Infinity`, `-Infinity`).
 */
function assertComplex(value, index) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`Operand at index ${index} must be a complex number object { re, im }`)
	}
	if (typeof value.re !== 'number' || typeof value.im !== 'number') {
		throw new TypeError(`Operand at index ${index} must have numeric "re" and "im" properties`)
	}
	if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
		throw new RangeError(`Operand at index ${index} must have finite "re" and "im" values`)
	}
	return value
}

/**
 * Normalize negative zero (`-0`) to positive zero (`0`).
 *
 * @param {number} n - Finite number to normalize.
 * @returns {number} Normalized number.
 */
function normalizeZero(n) {
	return n === 0 ? 0 : n
}

/**
 * Subtract two or more complex numbers `{ re, im }` using a straightforward iterative loop.
 *
 * Computes `(((first - second) - third) - ...)` left-to-right without mutating any input object.
 *
 * @param {{ re: number, im: number }} minuend - Initial complex number.
 * @param {{ re: number, im: number }} subtrahend - First complex number to subtract.
 * @param {...{ re: number, im: number }} rest - Optional additional complex numbers to subtract iteratively.
 * @returns {{ re: number, im: number }} Resulting complex number difference `{ re, im }`.
 * @throws {TypeError} If fewer than two operands are provided or any operand is not a `{ re, im }` object with numeric components.
 * @throws {RangeError} If any operand component is non-finite or the resulting difference overflows to a non-finite value.
 */
export function subtractComplexIterative(minuend, subtrahend, ...rest) {
	if (arguments.length < 2) {
		throw new TypeError('subtractComplexIterative requires at least two complex number operands')
	}

	const operands = [minuend, subtrahend, ...rest]
	const first = assertComplex(operands[0], 0)

	let re = first.re
	let im = first.im

	for (let i = 1; i < operands.length; i++) {
		const term = assertComplex(operands[i], i)
		re -= term.re
		im -= term.im
		if (!Number.isFinite(re) || !Number.isFinite(im)) {
			throw new RangeError(`Complex subtraction overflowed to a non-finite value at operand index ${i}`)
		}
	}

	return {
		re: normalizeZero(re),
		im: normalizeZero(im),
	}
}
