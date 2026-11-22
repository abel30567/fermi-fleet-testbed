/**
 * @typedef {object} Complex
 * @property {number} re - Real part (finite number).
 * @property {number} im - Imaginary part (finite number).
 */

/**
 * Normalizes `-0` to `+0` while leaving all other numbers unchanged.
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
 * @param {unknown} value - Candidate complex number.
 * @param {number} index - Element index for error reporting.
 * @throws {TypeError} If `value` is not a non-null plain-style object with numeric `re` and `im`.
 * @throws {RangeError} If `re` or `im` is `NaN`, `Infinity`, or `-Infinity`.
 */
function validateComplex(value, index) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(
			`Expected element at index ${index} to be a complex object { re, im }`,
		)
	}
	if (typeof value.re !== 'number') {
		throw new TypeError(
			`Expected element at index ${index} to have a numeric "re" property`,
		)
	}
	if (typeof value.im !== 'number') {
		throw new TypeError(
			`Expected element at index ${index} to have a numeric "im" property`,
		)
	}
	if (!Number.isFinite(value.re)) {
		throw new RangeError(
			`Expected element at index ${index} to have a finite "re" property`,
		)
	}
	if (!Number.isFinite(value.im)) {
		throw new RangeError(
			`Expected element at index ${index} to have a finite "im" property`,
		)
	}
}

/**
 * Multiplies two complex numbers `(a.re + a.im*i) * (b.re + b.im*i)` and avoids `-0`.
 *
 * @param {Complex} a
 * @param {Complex} b
 * @returns {Complex}
 */
function multiplyComplex(a, b) {
	return {
		re: normalizeZero(a.re * b.re - a.im * b.im),
		im: normalizeZero(a.re * b.im + a.im * b.re),
	}
}

/**
 * Recursively computes the product of `values[start..end)` using a balanced
 * divide-and-conquer binary product tree.
 *
 * @param {Complex[]} values - Validated array of complex numbers.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @returns {Complex}
 */
function productRange(values, start, end) {
	const length = end - start
	if (length === 0) {
		return { re: 1, im: 0 }
	}
	if (length === 1) {
		const z = values[start]
		return {
			re: normalizeZero(z.re),
			im: normalizeZero(z.im),
		}
	}

	const mid = start + (length >>> 1)
	const left = productRange(values, start, mid)
	const right = productRange(values, mid, end)
	return multiplyComplex(left, right)
}

/**
 * Computes the discrete product of an array of complex numbers represented as `{ re, im }`
 * using a recursive divide-and-conquer product tree.
 *
 * Algorithm:
 * Splits the index interval `[start, end)` at the midpoint `mid = start + ((end - start) >>> 1)`,
 * recursively evaluates the left and right sub-products, and combines them via complex
 * multiplication `(a.re * b.re - a.im * b.im) + (a.re * b.im + a.im * b.re)i`.
 * This runs in `O(n)` complex multiplications with `O(log n)` recursion stack depth.
 * The empty product returns the multiplicative identity `{ re: 1, im: 0 }`.
 *
 * @param {Complex[]} values - Array of complex numbers `{ re, im }` with finite numeric parts.
 * @returns {Complex} The product `{ re, im }` with `-0` normalized to `0`.
 * @throws {TypeError} If `values` is not an array, contains holes, or any element is not an object with numeric `re` and `im`.
 * @throws {RangeError} If any element has a non-finite (`NaN`, `Infinity`, `-Infinity`) `re` or `im` property.
 */
export function productComplexRecursive(values) {
	if (!Array.isArray(values)) {
		throw new TypeError('Expected values to be an array of complex numbers')
	}

	for (let i = 0; i < values.length; i++) {
		if (!(i in values)) {
			throw new TypeError(
				`Expected element at index ${i} to be a complex object { re, im }`,
			)
		}
		validateComplex(values[i], i)
	}

	return productRange(values, 0, values.length)
}
