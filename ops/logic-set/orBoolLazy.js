/**
 * Validates that the input is a non-string iterable.
 *
 * @param {unknown} iterable - Candidate iterable of booleans.
 * @throws {TypeError} If the input is null, undefined, a string, or not iterable.
 */
function assertIterable(iterable) {
	if (
		iterable === null ||
		iterable === undefined ||
		typeof iterable === 'string' ||
		typeof iterable[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(
			`Expected a non-string iterable of booleans, got ${
				iterable === null ? 'null' : typeof iterable
			}`
		)
	}
}

/**
 * Lazily yields cumulative logical OR steps over an iterable of booleans
 * (such as an Array, Set, Generator, or custom iterable).
 *
 * Consumes the source iterable one element at a time and short-circuits
 * immediately after yielding `true`, closing the upstream iterator without
 * pulling any remaining elements.
 *
 * @param {Iterable<boolean>} iterable - Iterable yielding plain boolean values.
 * @returns {Generator<boolean, void, undefined>} Streaming generator of cumulative OR values.
 * @throws {TypeError} If `iterable` is not a non-string iterable, or if any consumed
 *   element is not a plain boolean (`typeof value === 'boolean'`).
 */
export function* orBoolSteps(iterable) {
	assertIterable(iterable)

	let index = 0
	for (const value of iterable) {
		if (typeof value !== 'boolean') {
			throw new TypeError(
				`Expected boolean at index ${index}, got ${
					value === null ? 'null' : typeof value
				}`
			)
		}
		index += 1
		if (value) {
			yield true
			return
		}
		yield false
	}
}

/**
 * Computes the logical OR over an iterable of plain booleans (including Arrays,
 * JS `Set` objects, generators, and custom iterables) using a lazy,
 * generator-based evaluation strategy.
 *
 * - Identity for an empty iterable is `false`.
 * - Short-circuits as soon as `true` is encountered, never pulling subsequent
 *   values from the source iterable and properly closing the underlying iterator.
 * - Validates both the iterable container and every consumed element strictly
 *   as a plain boolean (`typeof value === 'boolean'`).
 *
 * @param {Iterable<boolean>} iterable - Iterable of plain boolean values.
 * @returns {boolean} `true` if at least one consumed element is `true`, otherwise `false`.
 * @throws {TypeError} If `iterable` is not a non-string iterable, or if any consumed
 *   element is not a plain boolean.
 */
export function orBoolLazy(iterable) {
	assertIterable(iterable)

	let acc = false
	for (const step of orBoolSteps(iterable)) {
		acc = step
		if (acc) {
			return true
		}
	}
	return acc
}
