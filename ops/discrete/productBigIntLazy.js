/**
 * Lazily computes the streaming discrete product over an iterable of exact `BigInt` integers.
 *
 * Because the integers are closed under multiplication, every intermediate and final discrete
 * product of `BigInt` inputs is an exact `BigInt` integer (no `10n ** 18n` fixed-point scaling
 * is required since results are always exact integers with zero fractional part).
 *
 * Laziness guarantees:
 * - Calling `productBigIntLazy(iterable, initial)` validates `iterable` and `initial` eagerly,
 *   but does not invoke `iterable[Symbol.iterator]()` or pull any elements until the returned
 *   generator is iterated (`.next()` is called).
 * - Each call to `.next()` pulls at most one element from `iterable`, validates it, updates the
 *   running product in O(1) auxiliary state, and yields the new running product immediately.
 * - Infinite and arbitrarily large iterables are supported without materializing the sequence.
 * - Terminating iteration early (via `break` or `.return()`) closes the underlying iterator.
 *
 * Empty iterable behavior:
 * - For an empty iterable, the generator yields zero intermediate values and completes with
 *   return value `initial` (default `1n`, the multiplicative identity / empty product).
 * - For a non-empty finite iterable, the generator yields each running prefix product and
 *   completes with the final product as its return value.
 *
 * @param {Iterable<bigint>} iterable - Lazy or finite iterable yielding `BigInt` values.
 * @param {bigint} [initial=1n] - Starting multiplicative accumulator (defaults to `1n`).
 * @returns {Generator<bigint, bigint, void>} A generator yielding running discrete products as
 *   exact `BigInt` values and returning the final accumulated product upon completion.
 * @throws {TypeError} If `iterable` is not a non-string iterable, if `initial` is not a `BigInt`,
 *   or (lazily during iteration) if any yielded element of `iterable` is not a `BigInt`.
 */
export function productBigIntLazy(iterable, initial = 1n) {
	if (
		iterable === null ||
		(typeof iterable !== 'object' && typeof iterable !== 'function') ||
		typeof iterable[Symbol.iterator] !== 'function'
	) {
		throw new TypeError('iterable must be a non-string iterable of BigInt values')
	}

	if (typeof initial !== 'bigint') {
		throw new TypeError(`initial must be a BigInt; received ${initial === null ? 'null' : typeof initial}`)
	}

	return streamProduct(iterable, initial)
}

/**
 * Internal generator performing O(1)-state streaming multiplication.
 *
 * @param {Iterable<bigint>} iterable
 * @param {bigint} initial
 * @returns {Generator<bigint, bigint, void>}
 */
function* streamProduct(iterable, initial) {
	let acc = initial
	for (const value of iterable) {
		if (typeof value !== 'bigint') {
			throw new TypeError(
				`All elements must be BigInt values; received ${value === null ? 'null' : typeof value}`
			)
		}
		acc *= value
		yield acc
	}
	return acc
}
