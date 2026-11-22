const MAX_FINITE_FACTORIAL_N = 170

/**
 * Recursively computes the product of integers in the inclusive range [lo, hi]
 * using divide-and-conquer binary splitting.
 *
 * @param {number} lo - Lower bound (inclusive).
 * @param {number} hi - Upper bound (inclusive).
 * @returns {number} Product of all integers from lo to hi.
 */
function productRange(lo, hi) {
	if (lo > hi) {
		return 1
	}
	if (lo === hi) {
		return lo
	}
	const mid = (lo + hi) >>> 1
	return productRange(lo, mid) * productRange(mid + 1, hi)
}

/**
 * Computes n! for a validated non-negative integer n using divide-and-conquer
 * product splitting. Values above 170 overflow IEEE-754 float64 to Infinity.
 *
 * @param {number} n - Validated non-negative integer.
 * @returns {number} n! as a float64 number (or Infinity if n > 170).
 */
function factorialScalar(n) {
	if (n === 0 || n === 1) {
		return 1
	}
	if (n > MAX_FINITE_FACTORIAL_N) {
		return Infinity
	}
	return productRange(2, n)
}

/**
 * Recursively divides the index range [start, end) to validate elements and
 * compute element-wise factorials into the output Float64Array.
 *
 * @param {Float64Array} input - Source Float64Array.
 * @param {Float64Array} output - Destination Float64Array.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 */
function fillRecursive(input, output, start, end) {
	if (start >= end) {
		return
	}
	if (end - start === 1) {
		const value = input[start]
		if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
			throw new RangeError(
				`Invalid element at index ${start}: expected a finite non-negative integer, got ${value}`
			)
		}
		output[start] = factorialScalar(value)
		return
	}
	const mid = start + ((end - start) >>> 1)
	fillRecursive(input, output, start, mid)
	fillRecursive(input, output, mid, end)
}

/**
 * Computes the discrete factorial (n!) element-wise over a Float64Array using
 * a recursive divide-and-conquer implementation.
 *
 * Each element must be a finite, non-negative integer. Inputs strictly greater
 * than 170 overflow IEEE-754 float64 precision and produce `Infinity`.
 * Does not mutate the input array.
 *
 * @param {Float64Array} input - Float64Array of finite non-negative integers.
 * @returns {Float64Array} New Float64Array containing element-wise factorials.
 * @throws {TypeError} If `input` is not a `Float64Array`.
 * @throws {RangeError} If any element is negative, non-integer, NaN, or infinite.
 */
export function factorialTypedRecursive(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError(
			`Expected input to be a Float64Array, got ${input === null ? 'null' : typeof input}`
		)
	}
	const output = new Float64Array(input.length)
	fillRecursive(input, output, 0, input.length)
	return output
}
