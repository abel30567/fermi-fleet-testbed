/**
 * Validates that a value is a complex number object `{ re, im }` with finite numeric components.
 *
 * @param {unknown} value - Candidate complex number value.
 * @param {string} label - Parameter label for descriptive error messages.
 * @returns {{ re: number, im: number }} Validated complex number components.
 * @throws {TypeError} If `value` is not a non-null, non-array object with numeric `re` and `im` properties.
 * @throws {RangeError} If `re` or `im` is not a finite number (`NaN`, `Infinity`, or `-Infinity`).
 */
function validateComplex(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be an object with numeric { re, im } properties`)
	}

	const { re, im } = value

	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`${label}.re and ${label}.im must be numbers`)
	}

	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`${label}.re and ${label}.im must be finite numbers`)
	}

	return { re, im }
}

/**
 * Normalizes `-0` to `+0` while leaving all other finite numbers unchanged.
 *
 * @param {number} n - Finite number to normalize.
 * @returns {number} Normalized number without negative zero.
 */
function normalizeZero(n) {
	return n === 0 ? 0 : n
}

/**
 * Multiplies two or more complex numbers represented as `{ re, im }` objects
 * using a straightforward iterative implementation.
 *
 * For two complex numbers `z1 = a + bi` and `z2 = c + di`, their product is:
 * `(a * c - b * d) + (a * d + b * c)i`.
 *
 * When additional complex operands are supplied, the product is accumulated
 * iteratively from left to right in `O(n)` time and `O(1)` auxiliary space.
 * Input objects are never mutated, and `-0` components are normalized to `0`.
 *
 * @param {{ re: number, im: number }} a - First complex operand.
 * @param {{ re: number, im: number }} b - Second complex operand.
 * @param {...{ re: number, im: number }} rest - Optional additional complex operands.
 * @returns {{ re: number, im: number }} The complex product `{ re, im }`.
 * @throws {TypeError} If fewer than two operands are provided, or any operand is not a valid `{ re, im }` object with numeric components.
 * @throws {RangeError} If any operand component is non-finite (`NaN`, `±Infinity`), or if multiplication overflows to a non-finite value.
 */
export function multiplyComplexIterative(a, b, ...rest) {
	const first = validateComplex(a, 'a')
	const second = validateComplex(b, 'b')

	const operands = [first, second]
	for (let i = 0; i < rest.length; i += 1) {
		operands.push(validateComplex(rest[i], `operand[${i + 2}]`))
	}

	let accRe = operands[0].re
	let accIm = operands[0].im

	for (let i = 1; i < operands.length; i += 1) {
		const { re: curRe, im: curIm } = operands[i]
		const nextRe = accRe * curRe - accIm * curIm
		const nextIm = accRe * curIm + accIm * curRe

		if (!Number.isFinite(nextRe) || !Number.isFinite(nextIm)) {
			throw new RangeError('Complex multiplication overflowed to a non-finite number')
		}

		accRe = nextRe
		accIm = nextIm
	}

	return {
		re: normalizeZero(accRe),
		im: normalizeZero(accIm),
	}
}
