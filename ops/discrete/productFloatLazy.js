/**
 * Lazily computes running discrete partial products over an iterable of finite
 * IEEE-754 float64 numbers using a generator.
 *
 * Input container and `initial` factor are validated eagerly when called.
 * The input `iterable` is then consumed strictly on demand: each call to
 * `.next()` pulls at most one element from `iterable`, validates that it is a
 * finite `number`, multiplies it into the running float64 accumulator, and
 * yields the updated partial product.
 *
 * When the iterable is exhausted, the generator completes with the final
 * accumulated product as its return value (equal to `initial`, defaulting to
 * `1`, for an empty iterable). Standard IEEE-754 float64 arithmetic semantics
 * apply to intermediate products (including signed zero, underflow to `±0`,
 * and overflow to `±Infinity`).
 *
 * @param {Iterable<number>} iterable - Non-string iterable yielding finite float64 numbers.
 * @param {number} [initial=1] - Starting finite float64 accumulator (multiplicative identity by default).
 * @returns {Generator<number, number, void>} Generator yielding each running partial product and returning the final product.
 * @throws {TypeError} If `iterable` is not a non-string iterable, `initial` is not a number, or a consumed element is not a number.
 * @throws {RangeError} If `initial` is not finite (`NaN`, `Infinity`, `-Infinity`) or a consumed element is not finite.
 */
export function productFloatLazy(iterable, initial = 1) {
	if (
		iterable == null ||
		typeof iterable === 'string' ||
		typeof iterable[Symbol.iterator] !== 'function'
	) {
		throw new TypeError('iterable must be a non-string iterable')
	}
	if (typeof initial !== 'number') {
		throw new TypeError(`initial must be a finite float64 number, got ${typeof initial}`)
	}
	if (!Number.isFinite(initial)) {
		throw new RangeError(`initial must be a finite float64 number, got ${initial}`)
	}

	return (function* generatePartialProducts() {
		let acc = initial
		let index = 0
		for (const value of iterable) {
			if (typeof value !== 'number') {
				throw new TypeError(
					`Element at index ${index} must be a number, got ${typeof value}`,
				)
			}
			if (!Number.isFinite(value)) {
				throw new RangeError(
					`Element at index ${index} must be a finite float64 number, got ${value}`,
				)
			}
			acc *= value
			index += 1
			yield acc
		}
		return acc
	})()
}
