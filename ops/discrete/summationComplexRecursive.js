/**
 * @typedef {Object} Complex
 * @property {number} re - The real part (finite number).
 * @property {number} im - The imaginary part (finite number).
 */

/**
 * Validates that a value is a complex number object `{ re, im }` with finite numeric parts.
 *
 * @param {unknown} item - Candidate complex number element.
 * @param {number} index - Element index for error reporting.
 * @throws {TypeError} If `item` is not a non-null object or `re`/`im` are not numbers.
 * @throws {RangeError} If `re` or `im` is not a finite number (`NaN`, `Infinity`, `-Infinity`).
 */
function validateComplexElement(item, index) {
	if (item === null || typeof item !== 'object' || Array.isArray(item)) {
		throw new TypeError(
			`Element at index ${index} must be a non-null object with numeric { re, im } properties`
		)
	}
	if (typeof item.re !== 'number' || typeof item.im !== 'number') {
		throw new TypeError(
			`Element at index ${index} must have numeric re and im properties`
		)
	}
	if (!Number.isFinite(item.re) || !Number.isFinite(item.im)) {
		throw new RangeError(
			`Element at index ${index} must have finite re and im values`
		)
	}
}

/**
 * Recursively computes the sum of complex numbers in `values[lo..hi)` using
 * divide-and-conquer (pairwise) summation.
 *
 * @param {readonly Complex[]} values - Validated array of complex numbers.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @returns {Complex} Sum of the subrange.
 */
function sumRangeRecursive(values, lo, hi) {
	const count = hi - lo
	if (count === 0) {
		return { re: 0, im: 0 }
	}
	if (count === 1) {
		const z = values[lo]
		return { re: z.re, im: z.im }
	}
	const mid = lo + (count >>> 1)
	const left = sumRangeRecursive(values, lo, mid)
	const right = sumRangeRecursive(values, mid, hi)
	return {
		re: left.re + right.re,
		im: left.im + right.im,
	}
}

/**
 * Computes the discrete summation of an array of complex numbers `{ re, im }`
 * using a recursive divide-and-conquer (pairwise summation) algorithm.
 *
 * Pairwise summation achieves O(log n) stack depth and reduces floating-point
 * rounding error growth from O(n) to O(log n) compared to naive linear summation.
 *
 * @param {readonly Complex[]} values - Array of complex numbers `{ re, im }`.
 * @returns {Complex} The complex sum `{ re, im }`. Returns `{ re: 0, im: 0 }` for an empty array.
 * @throws {TypeError} If `values` is not an array, or any element is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If any element has a non-finite (`NaN`, `Infinity`, `-Infinity`) `re` or `im` value.
 */
export function summationComplexRecursive(values) {
	if (!Array.isArray(values)) {
		throw new TypeError('Expected values to be an array of complex numbers')
	}
	for (let i = 0; i < values.length; i++) {
		validateComplexElement(values[i], i)
	}
	return sumRangeRecursive(values, 0, values.length)
}
