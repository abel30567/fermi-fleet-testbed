/**
 * Computes the discrete factorial `n!` over IEEE-754 float64 numbers using a
 * recursive divide-and-conquer range product.
 *
 * Uses strict input validation and handles base cases (`0! = 1`, `1! = 1`) as
 * well as float64 overflow (`n > 170` returns `Infinity`, since `170!` is the
 * largest factorial representable as a finite IEEE-754 double).
 *
 * @param {number} n Non-negative finite integer.
 * @returns {number} The factorial `n!` as an IEEE-754 float64 number (`Infinity` for `n > 170`).
 * @throws {TypeError} If `n` is not of type `number`.
 * @throws {RangeError} If `n` is `NaN`, non-finite, negative, or not an integer.
 */
export function factorialFloatRecursive(n) {
	if (typeof n !== 'number') {
		throw new TypeError(`Expected a number, received ${typeof n}`)
	}
	if (Number.isNaN(n)) {
		throw new RangeError('Expected a finite non-negative integer, received NaN')
	}
	if (!Number.isFinite(n) || !Number.isInteger(n)) {
		throw new RangeError(`Expected a finite integer, received ${n}`)
	}
	if (n < 0) {
		throw new RangeError(`Expected a non-negative integer, received ${n}`)
	}
	if (n <= 1) {
		return 1
	}
	if (n > 170) {
		return Infinity
	}

	return rangeProduct(2, n)
}

/**
 * Recursively computes the product of all integers in `[lo, hi]` via
 * divide-and-conquer splitting.
 *
 * @param {number} lo Lower inclusive integer bound.
 * @param {number} hi Upper inclusive integer bound (`hi >= lo`).
 * @returns {number} Product of integers from `lo` through `hi`.
 */
function rangeProduct(lo, hi) {
	if (lo === hi) {
		return lo
	}
	if (hi - lo === 1) {
		return lo * hi
	}
	const mid = Math.floor((lo + hi) / 2)
	return rangeProduct(lo, mid) * rangeProduct(mid + 1, hi)
}
