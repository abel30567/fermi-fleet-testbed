/**
 * Recursively sums a contiguous slice `[start, end)` of validated finite float64
 * numbers using pairwise (divide-and-conquer) summation.
 *
 * Pairwise summation halves the input range recursively, yielding O(log n)
 * recursion depth, O(n) arithmetic operations with zero slice allocations, and
 * a worst-case rounding error bound of O(eps * log2(n)) compared to O(eps * n)
 * for naive sequential left-to-right summation.
 *
 * @param {readonly number[]} values - Validated array of finite float64 numbers.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @returns {number} Pairwise float64 sum of `values[start..end-1]`.
 */
function pairwiseSum(values, start, end) {
	const length = end - start

	if (length === 0) {
		return 0
	}
	if (length === 1) {
		return values[start]
	}
	if (length === 2) {
		return values[start] + values[start + 1]
	}

	const mid = start + Math.floor(length / 2)
	return pairwiseSum(values, start, mid) + pairwiseSum(values, mid, end)
}

/**
 * Validates that every element of `values` is a finite IEEE-754 float64 Number.
 *
 * @param {readonly unknown[]} values - Input elements to validate.
 * @throws {TypeError} If any element is not a primitive `number` (including sparse array holes).
 * @throws {RangeError} If any element is non-finite (`NaN`, `Infinity`, or `-Infinity`).
 */
function validateFloat64List(values) {
	for (let i = 0; i < values.length; i++) {
		if (!(i in values)) {
			throw new TypeError(`Element at index ${i} is missing (sparse array holes are not allowed)`)
		}
		const value = values[i]
		if (typeof value !== 'number') {
			throw new TypeError(`Element at index ${i} must be a number, received ${value === null ? 'null' : typeof value}`)
		}
		if (!Number.isFinite(value)) {
			throw new RangeError(`Element at index ${i} must be a finite float64 number, received ${value}`)
		}
	}
}

/**
 * Adds IEEE-754 float64 numbers using recursive pairwise (divide-and-conquer)
 * summation.
 *
 * Accepts either:
 * - A single array of finite float64 numbers: `addFloatRecursive([a, b, c, ...])`
 * - Variadic finite float64 number arguments: `addFloatRecursive(a, b, c, ...)`
 * - Zero arguments or an empty array, returning the additive identity `0`.
 *
 * For two arguments `(a, b)`, delegates directly to the length-2 base case of
 * the recursive pairwise sum (`a + b`). Preserves IEEE-754 signed zero semantics
 * for non-empty inputs (e.g. `addFloatRecursive(-0)` and `addFloatRecursive(-0, -0)`
 * both return `-0`, while `addFloatRecursive(-0, 0)` returns `+0`).
 *
 * @param {...(number | readonly number[])} args - Either a single array of finite
 *   float64 numbers or variadic finite float64 numbers.
 * @returns {number} The pairwise float64 sum of the inputs (`0` if empty).
 * @throws {TypeError} If inputs contain non-numbers, sparse array holes, or mix
 *   an array argument with additional variadic arguments.
 * @throws {RangeError} If any input number is `NaN`, `Infinity`, or `-Infinity`.
 */
export function addFloatRecursive(...args) {
	if (args.length === 0) {
		return 0
	}

	const values = args.length === 1 && Array.isArray(args[0]) ? args[0] : args

	validateFloat64List(values)

	return pairwiseSum(values, 0, values.length)
}
