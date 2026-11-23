/**
 * Computes the product of all integers in the inclusive range [low, high]
 * using recursive divide-and-conquer multiplication over IEEE-754 float64 Numbers.
 *
 * @param {number} low - Lower bound of the integer range (inclusive).
 * @param {number} high - Upper bound of the integer range (inclusive).
 * @returns {number} Product low * (low + 1) * ... * high as an IEEE-754 float64 Number.
 */
function productRange(low, high) {
	if (low > high) return 1
	if (low === high) return low
	if (low + 1 === high) return low * high
	const mid = Math.floor((low + high) / 2)
	return productRange(low, mid) * productRange(mid + 1, high)
}

/**
 * Computes the discrete factorial n! over IEEE-754 float64 Numbers using a
 * recursive divide-and-conquer product tree.
 *
 * Results are exact for 0 <= n <= 22, finite IEEE-754 float64 approximations
 * for 23 <= n <= 170, and overflow to Infinity for finite integers n > 170.
 *
 * @param {number} n - Non-negative finite integer input.
 * @returns {number} The factorial n! as an IEEE-754 float64 Number (or Infinity if n > 170).
 * @throws {TypeError} If n is not of type "number".
 * @throws {RangeError} If n is not a finite non-negative integer.
 */
export function factorialFloatRecursive(n) {
	if (typeof n !== 'number') {
		throw new TypeError(`Expected a number, got ${typeof n}`)
	}
	if (!Number.isInteger(n)) {
		throw new RangeError(`Expected a finite integer, got ${n}`)
	}
	if (n < 0) {
		throw new RangeError(`Expected a non-negative integer, got ${n}`)
	}
	if (n <= 1) {
		return 1
	}
	if (n > 170) {
		return Infinity
	}
	return productRange(2, n)
}
