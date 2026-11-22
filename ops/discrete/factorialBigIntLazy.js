/**
 * Computes the product of all consecutive BigInt integers in the inclusive range `[lo, hi]`
 * using balanced binary splitting to minimize BigInt multiplication cost.
 *
 * @param {bigint} lo - Lower bound (inclusive, `lo >= 1n`).
 * @param {bigint} hi - Upper bound (inclusive).
 * @returns {bigint} The exact product `lo * (lo + 1n) * ... * hi`, or `1n` if `lo > hi`.
 */
function productRange(lo, hi) {
	if (lo > hi) {
		return 1n
	}
	if (lo === hi) {
		return lo
	}
	if (hi - lo === 1n) {
		return lo * hi
	}
	const mid = lo + ((hi - lo) >> 1n)
	return productRange(lo, mid) * productRange(mid + 1n, hi)
}

/**
 * Internal generator that lazily consumes `inputs` and yields exact BigInt factorials.
 *
 * @param {Iterable<bigint>} inputs
 * @returns {Generator<bigint, void, undefined>}
 */
function* streamFactorials(inputs) {
	let lastN = -1n
	let lastFact = 1n

	for (const n of inputs) {
		if (typeof n !== 'bigint') {
			throw new TypeError(`Expected a BigInt element, received ${n === null ? 'null' : typeof n}`)
		}
		if (n < 0n) {
			throw new RangeError(`Factorial is undefined for negative BigInt: ${n}`)
		}

		let result
		if (n === 0n || n === 1n) {
			result = 1n
		} else if (lastN >= 0n && n === lastN) {
			result = lastFact
		} else if (lastN >= 0n && n > lastN) {
			result = lastFact * productRange(lastN + 1n, n)
		} else {
			result = productRange(1n, n)
		}

		lastN = n
		lastFact = result
		yield result
	}
}

/**
 * Lazily computes the discrete factorial `n!` over exact `BigInt` integers for each
 * non-negative `BigInt` element in an iterable sequence.
 *
 * **Representation & Scaling:**
 * For every non-negative integer `n >= 0n`, `n!` is strictly an exact integer, so exact
 * unscaled `BigInt` values are yielded directly (no `10n ** 18n` fixed-point scaling is
 * required because no result is non-integer).
 *
 * **Laziness & Memory Guarantees:**
 * - The iterable `inputs` is never eagerly materialized; elements are pulled one at a time
 *   only when `.next()` is invoked on the returned generator.
 * - Supports finite and infinite iterables as well as early termination (closing the
 *   underlying iterator cleanly via the `for..of` protocol).
 * - Maintains only O(1) incremental state (`lastN`, `lastFact`) so monotonic or repeated
 *   streams reuse prior products without unbounded memoization memory growth, while large
 *   jumps use balanced binary-splitting products.
 *
 * @param {Iterable<bigint>} inputs - A finite or infinite non-string iterable of non-negative `BigInt` values.
 * @returns {Generator<bigint, void, undefined>} A lazy generator yielding `n!` as an exact `BigInt` for each input `n`.
 * @throws {TypeError} Eagerly if `inputs` is not a non-string iterable object.
 * @throws {TypeError} Lazily during iteration if an element of `inputs` is not a `BigInt`.
 * @throws {RangeError} Lazily during iteration if an element of `inputs` is negative (`< 0n`).
 */
export function factorialBigIntLazy(inputs) {
	if (
		inputs === null ||
		typeof inputs !== 'object' ||
		typeof inputs[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(
			`Expected a non-string iterable of BigInt values, received ${inputs === null ? 'null' : typeof inputs}`
		)
	}

	return streamFactorials(inputs)
}
