/**
 * Computes the factorial `n!` over IEEE-754 double-precision floating-point
 * numbers (`Number`) using a straightforward iterative loop.
 *
 * IEEE-754 float64 behavior:
 * - Returns exact values for `0 <= n <= 22` (since every `n!` in this range
 *   fits within 53 bits of significand precision once trailing binary zeros
 *   are factored into the exponent; safe integers up to `Number.MAX_SAFE_INTEGER`
 *   cover `0 <= n <= 18`).
 * - Returns rounded finite float64 approximations for `23 <= n <= 170`
 *   (`170! ≈ 7.257415615307999e+306 < Number.MAX_VALUE`).
 * - Overflows to `Infinity` for any integer `n > 170` (early-exiting as soon
 *   as overflow occurs so arbitrarily large valid integers terminate in O(1)
 *   steps).
 *
 * @param {number} n - A non-negative finite integer.
 * @returns {number} The factorial `n!` as an IEEE-754 float64 number, or
 *   `Infinity` when `n > 170`.
 * @throws {TypeError} If `n` is not of type `number`.
 * @throws {RangeError} If `n` is `NaN`, non-finite (`±Infinity`), a
 *   non-integer, or negative.
 */
export function factorialFloatIterative(n) {
	if (typeof n !== 'number') {
		throw new TypeError(`Expected n to be a number, got ${typeof n}`)
	}
	if (!Number.isFinite(n)) {
		throw new RangeError(`Expected n to be a finite number, got ${n}`)
	}
	if (!Number.isInteger(n)) {
		throw new RangeError(`Expected n to be an integer, got ${n}`)
	}
	if (n < 0) {
		throw new RangeError(`Expected n to be a non-negative integer, got ${n}`)
	}

	let result = 1
	for (let i = 2; i <= n; i += 1) {
		result *= i
		if (!Number.isFinite(result)) {
			return Infinity
		}
	}
	return result
}
