/**
 * Computes the factorial `n!` over IEEE-754 float64 Numbers using a
 * straightforward iterative loop.
 *
 * Returns exact integer values for `0 <= n <= 22`, IEEE-754 float64
 * approximations for `23 <= n <= 170`, and `Infinity` for integers `n >= 171`
 * where the result overflows `Number.MAX_VALUE`.
 *
 * @param {number} n - Non-negative integer input.
 * @returns {number} The factorial `n!` as an IEEE-754 float64 Number.
 * @throws {TypeError} If `n` is not a number.
 * @throws {RangeError} If `n` is negative, non-integer, `NaN`, or non-finite.
 */
export function factorialFloatIterative(n) {
	if (typeof n !== 'number') {
		throw new TypeError(`Expected a number, received ${typeof n}`)
	}
	if (!Number.isInteger(n) || n < 0) {
		throw new RangeError(`Expected a non-negative integer, received ${n}`)
	}

	let result = 1
	for (let i = 2; i <= n; i++) {
		result *= i
		if (!Number.isFinite(result)) {
			return Infinity
		}
	}
	return result
}
