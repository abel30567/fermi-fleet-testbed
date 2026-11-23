/**
 * Element-wise division of two Float64Array instances using a recursive
 * divide-and-conquer strategy.
 *
 * Splits the index range in half recursively (`O(log n)` call-stack depth)
 * until reaching single-element base cases, validating each divisor against
 * zero before writing to the newly allocated output `Float64Array`.
 * Neither input array is mutated.
 *
 * @param {Float64Array} dividends - Numerator values.
 * @param {Float64Array} divisors - Non-zero denominator values of the same length.
 * @returns {Float64Array} A new `Float64Array` where `result[i] = dividends[i] / divisors[i]`.
 * @throws {TypeError} If `dividends` or `divisors` is not a `Float64Array`.
 * @throws {RangeError} If `dividends` and `divisors` differ in length, or if any element of `divisors` is zero (`0` or `-0`).
 */
export function divideTypedRecursive(dividends, divisors) {
	if (!(dividends instanceof Float64Array)) {
		throw new TypeError('dividends must be a Float64Array')
	}
	if (!(divisors instanceof Float64Array)) {
		throw new TypeError('divisors must be a Float64Array')
	}
	if (dividends.length !== divisors.length) {
		throw new RangeError(
			`Length mismatch: dividends has length ${dividends.length}, divisors has length ${divisors.length}`,
		)
	}

	const result = new Float64Array(dividends.length)
	if (dividends.length === 0) {
		return result
	}

	divideRange(dividends, divisors, result, 0, dividends.length)
	return result
}

/**
 * Recursively computes element-wise division over the half-open range `[start, end)`.
 *
 * @param {Float64Array} dividends
 * @param {Float64Array} divisors
 * @param {Float64Array} result
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 */
function divideRange(dividends, divisors, result, start, end) {
	const count = end - start
	if (count <= 0) {
		return
	}
	if (count === 1) {
		const divisor = divisors[start]
		if (divisor === 0) {
			throw new RangeError(`Division by zero at index ${start}`)
		}
		result[start] = dividends[start] / divisor
		return
	}

	const mid = start + Math.floor(count / 2)
	divideRange(dividends, divisors, result, start, mid)
	divideRange(dividends, divisors, result, mid, end)
}
