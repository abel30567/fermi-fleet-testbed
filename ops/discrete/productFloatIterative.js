/**
 * Computes the discrete product of an iterable of finite IEEE-754 float64
 * numbers using a straightforward iterative multiplication loop.
 *
 * Follows the empty-product convention: an empty iterable returns `1`
 * (the multiplicative identity). Intermediate overflow to `±Infinity`,
 * underflow to `±0`, and signed-zero sign propagation follow standard
 * IEEE-754 float64 arithmetic.
 *
 * @param {Iterable<number>} values - Iterable of finite IEEE-754 float64 numbers.
 * @returns {number} The discrete product of all elements in `values`.
 * @throws {TypeError} If `values` is not a non-string iterable or contains a non-number element.
 * @throws {RangeError} If any element in `values` is `NaN`, `Infinity`, or `-Infinity`.
 */
export function productFloatIterative(values) {
	if (
		values === null ||
		values === undefined ||
		typeof values === 'string' ||
		typeof values[Symbol.iterator] !== 'function'
	) {
		throw new TypeError('values must be an iterable of finite numbers')
	}

	let product = 1
	let index = 0
	for (const value of values) {
		if (typeof value !== 'number') {
			throw new TypeError(
				`Expected a number at index ${index}, got ${typeof value}`,
			)
		}
		if (!Number.isFinite(value)) {
			throw new RangeError(
				`Expected a finite number at index ${index}, got ${value}`,
			)
		}
		product *= value
		index += 1
	}

	return product
}
