/**
 * Computes the discrete summation of a sequence of IEEE-754 float64 numbers
 * using a straightforward left-to-right iterative accumulator.
 *
 * @param {Iterable<number>} values - Non-string iterable of finite IEEE-754 float64 numbers.
 * @returns {number} The iterative float64 sum of all elements (`0` for an empty iterable).
 * @throws {TypeError} If `values` is not a non-string iterable, or if any element is not a `number`.
 * @throws {RangeError} If any element is `NaN`, `Infinity`, or `-Infinity`.
 */
export function summationFloatIterative(values) {
	if (
		values == null ||
		typeof values === 'string' ||
		typeof values[Symbol.iterator] !== 'function'
	) {
		throw new TypeError('values must be a non-string iterable of numbers')
	}

	let sum = 0
	let index = 0
	for (const value of values) {
		if (typeof value !== 'number') {
			throw new TypeError(
				`Expected a number at index ${index}, received ${value === null ? 'null' : typeof value}`,
			)
		}
		if (!Number.isFinite(value)) {
			throw new RangeError(
				`Expected a finite IEEE-754 float64 number at index ${index}, received ${value}`,
			)
		}
		sum += value
		index += 1
	}

	return sum
}
