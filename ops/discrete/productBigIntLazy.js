/**
 * @fileoverview Lazy, streaming discrete product over exact BigInt integers.
 */

/**
 * Lazily validates values pulled from an iterable, yielding exact BigInt
 * integers one at a time without materializing the input sequence.
 *
 * @param {Iterable<bigint>} iterable - Input sequence of BigInt values.
 * @returns {Generator<bigint, void, void>} Stream of validated BigInt factors.
 * @throws {TypeError} If any consumed element is not a `bigint`.
 */
function* validatedBigIntStream(iterable) {
	let index = 0
	for (const value of iterable) {
		if (typeof value !== 'bigint') {
			const received = value === null ? 'null' : typeof value
			throw new TypeError(
				`productBigIntLazy: element at index ${index} must be a bigint, received ${received}`
			)
		}
		yield value
		index += 1
	}
}

/**
 * Lazily accumulates running products from a BigInt stream, terminating early
 * when the absorbing element `0n` is encountered and short-circuiting is enabled.
 *
 * @param {Iterable<bigint>} stream - Stream of validated BigInt values.
 * @param {boolean} shortCircuitZero - Whether to stop consuming immediately upon encountering `0n`.
 * @returns {Generator<bigint, void, void>} Stream of running partial products.
 */
function* runningProductStream(stream, shortCircuitZero) {
	let acc = 1n
	for (const factor of stream) {
		acc *= factor
		yield acc
		if (acc === 0n && shortCircuitZero) {
			return
		}
	}
}

/**
 * Computes the discrete product of an iterable of exact `BigInt` integers using
 * a streaming, generator-based pipeline that consumes inputs lazily in O(1)
 * auxiliary sequence space (without materializing the iterable).
 *
 * The product of exact integers is always an exact integer, so the result is
 * returned as an unscaled exact `bigint`. The empty product is `1n`
 * (the multiplicative identity).
 *
 * By default (`shortCircuitZero: true`), encountering `0n` immediately halts
 * consumption of the input iterable and closes its iterator (allowing infinite
 * iterables containing `0n` to terminate cleanly). Set `{ shortCircuitZero: false }`
 * to force validation of all remaining elements even after `0n`.
 *
 * @param {Iterable<bigint>} iterable - Any non-string iterable yielding `bigint` values
 *   (e.g., generator, Array, Set, or custom single-pass iterable).
 * @param {object} [options] - Optional configuration.
 * @param {boolean} [options.shortCircuitZero=true] - Stop consuming lazily upon encountering `0n`.
 * @returns {bigint} Exact discrete product of the sequence (`1n` for an empty iterable).
 * @throws {TypeError} If `iterable` is not a valid non-string iterable, if `options` is invalid,
 *   or if any consumed element is not a `bigint`.
 */
export function productBigIntLazy(iterable, options = {}) {
	if (
		iterable === null ||
		iterable === undefined ||
		typeof iterable === 'string' ||
		iterable instanceof String ||
		typeof iterable[Symbol.iterator] !== 'function'
	) {
		const received =
			iterable === null
				? 'null'
				: iterable instanceof String
					? 'String'
					: typeof iterable
		throw new TypeError(
			`productBigIntLazy: first argument must be a non-string iterable of bigint values, received ${received}`
		)
	}

	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		const received =
			options === null ? 'null' : Array.isArray(options) ? 'Array' : typeof options
		throw new TypeError(
			`productBigIntLazy: options must be a plain object if provided, received ${received}`
		)
	}

	const { shortCircuitZero = true } = options
	if (typeof shortCircuitZero !== 'boolean') {
		throw new TypeError(
			`productBigIntLazy: options.shortCircuitZero must be a boolean, received ${typeof shortCircuitZero}`
		)
	}

	let result = 1n
	for (const partial of runningProductStream(
		validatedBigIntStream(iterable),
		shortCircuitZero
	)) {
		result = partial
	}
	return result
}
