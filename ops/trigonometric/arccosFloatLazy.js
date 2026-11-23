/**
 * Lazily computes the principal arccosine (in radians, range [0, π]) for each
 * IEEE-754 float64 number in an iterable sequence.
 *
 * Validation of the iterable container is performed eagerly when
 * `arccosFloatLazy` is called; elements are pulled, validated, and transformed
 * lazily one at a time as the returned generator is consumed.
 *
 * @param {Iterable<number>} values - An iterable sequence (e.g., Array,
 *   Float64Array, Set, Generator, or custom iterable) of finite IEEE-754
 *   float64 numbers within the closed domain [-1, 1]. Strings are rejected.
 * @returns {Generator<number, void, undefined>} A lazy generator yielding
 *   `Math.acos(x)` in radians for each element `x` of `values`.
 * @throws {TypeError} Synchronously if `values` is not a non-string iterable.
 * @throws {TypeError} Lazily during iteration if a yielded element is not a
 *   primitive `number`.
 * @throws {RangeError} Lazily during iteration if a yielded element is `NaN`,
 *   infinite, or outside the real arccosine domain `[-1, 1]`.
 */
export function arccosFloatLazy(values) {
	if (
		values == null ||
		typeof values === 'string' ||
		values instanceof String ||
		typeof values[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(
			'arccosFloatLazy expects a non-string iterable of numbers'
		)
	}

	return arccosStream(values)
}

/**
 * Internal generator that lazily consumes and validates elements from `values`.
 *
 * @param {Iterable<number>} values
 * @returns {Generator<number, void, undefined>}
 */
function* arccosStream(values) {
	let index = 0
	for (const x of values) {
		if (typeof x !== 'number') {
			throw new TypeError(
				`arccosFloatLazy element at index ${index} must be a number, received ${
					x === null ? 'null' : typeof x
				}`
			)
		}
		if (!Number.isFinite(x) || x < -1 || x > 1) {
			throw new RangeError(
				`arccosFloatLazy element at index ${index} must be a finite number in [-1, 1], received ${x}`
			)
		}
		yield Math.acos(x)
		index += 1
	}
}
