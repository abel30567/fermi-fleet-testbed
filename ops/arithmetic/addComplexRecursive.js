/**
 * @typedef {Object} Complex
 * @property {number} re - The finite real component.
 * @property {number} im - The finite imaginary component.
 */

/**
 * Validates that a value is a complex number object `{ re, im }` with finite numeric components.
 *
 * @param {unknown} value - Candidate value to validate.
 * @param {number} index - Element index for diagnostic error messages.
 * @returns {Complex} The validated complex object.
 * @throws {TypeError} If `value` is not a non-null, non-array object with numeric `re` and `im` properties.
 * @throws {RangeError} If `value.re` or `value.im` is not a finite number (e.g. `NaN`, `Infinity`, `-Infinity`).
 */
function assertComplex(value, index) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`Expected complex object { re, im } at index ${index}, got ${value === null ? 'null' : Array.isArray(value) ? 'Array' : typeof value}`)
	}

	const { re, im } = value
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`Complex object at index ${index} must have numeric "re" and "im" properties`)
	}

	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`Complex object at index ${index} must have finite "re" and "im" values`)
	}

	return value
}

/**
 * Recursively sums `items[lo..hi)` using a divide-and-conquer pairwise summation tree.
 * Splitting the range in half bounds recursion depth to O(log n) and reduces
 * floating-point rounding error compared to naive left-to-right accumulation.
 *
 * @param {readonly Complex[]} items - Sequence of complex numbers.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @returns {Complex} Sum of elements in `[lo, hi)`.
 */
function sumRange(items, lo, hi) {
	const count = hi - lo
	if (count === 0) {
		return { re: 0, im: 0 }
	}
	if (count === 1) {
		const z = assertComplex(items[lo], lo)
		return { re: z.re, im: z.im }
	}

	const mid = lo + Math.floor(count / 2)
	const left = sumRange(items, lo, mid)
	const right = sumRange(items, mid, hi)
	return {
		re: left.re + right.re,
		im: left.im + right.im,
	}
}

/**
 * Adds complex numbers represented as `{ re, im }` objects using a recursive
 * divide-and-conquer pairwise summation tree.
 *
 * Accepts either a single array of complex numbers (`addComplexRecursive([z1, z2, ...])`)
 * or variadic complex arguments (`addComplexRecursive(z1, z2, ...)`).
 * Returns `{ re: 0, im: 0 }` when given an empty array or no arguments.
 *
 * @param {...(Complex | readonly Complex[])} args - Either a single array of `{ re, im }` objects or variadic `{ re, im }` objects.
 * @returns {Complex} The complex sum `{ re, im }`.
 * @throws {TypeError} If any input is not a valid `{ re, im }` object with numeric components.
 * @throws {RangeError} If any `re` or `im` component is `NaN` or non-finite.
 */
export function addComplexRecursive(...args) {
	if (args.length === 0) {
		return { re: 0, im: 0 }
	}

	const items = args.length === 1 && Array.isArray(args[0]) ? args[0] : args
	return sumRange(items, 0, items.length)
}
