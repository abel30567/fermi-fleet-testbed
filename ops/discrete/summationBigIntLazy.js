/**
 * Lazily computes discrete running (partial) sums over exact `BigInt` values
 * using a streaming generator.
 *
 * Elements are pulled one at a time from `iterable` on demand—nothing is
 * buffered in memory—so arbitrarily large or infinite sequences can be summed
 * incrementally with O(1) auxiliary space. Exact `BigInt` addition also
 * preserves arbitrary fixed-point scaling (such as `10n ** 18n` for
 * non-integer fixed-point quantities) without floating-point rounding error.
 *
 * When the input iterable finishes, the generator returns the final exact
 * `BigInt` sum (or `initial` if the iterable is empty). Early termination via
 * `break` or `.return()` closes the underlying source iterator cleanly.
 *
 * @param {Iterable<*>} iterable - A synchronous iterable of `BigInt` values
 *   (or arbitrary values when `termFn` is provided). Strings are rejected.
 * @param {((value: *, index: bigint) => bigint) | null} [termFn=null] - Optional
 *   mapping function applied lazily to each element `(value, index)` before
 *   accumulation; must return a `BigInt`.
 * @param {bigint} [initial=0n] - Initial `BigInt` accumulator value.
 * @returns {Generator<bigint, bigint, void>} A generator yielding each running
 *   partial sum and returning the final exact `BigInt` total.
 * @throws {TypeError} If `iterable` is not a valid non-string iterable,
 *   `termFn` is neither nullish nor a function, `initial` is not a `BigInt`,
 *   or any term is not a `BigInt`.
 */
export function summationBigIntLazy(iterable, termFn = null, initial = 0n) {
	if (
		iterable == null ||
		typeof iterable === 'string' ||
		typeof iterable[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(
			'summationBigIntLazy: expected iterable to be a non-string synchronous iterable'
		)
	}

	if (termFn !== null && termFn !== undefined && typeof termFn !== 'function') {
		throw new TypeError(
			'summationBigIntLazy: expected termFn to be a function, null, or undefined'
		)
	}

	if (typeof initial !== 'bigint') {
		throw new TypeError(
			`summationBigIntLazy: expected initial to be a bigint, received ${typeof initial}`
		)
	}

	return summationGenerator(iterable, termFn ?? null, initial)
}

/**
 * Internal generator performing lazy BigInt summation.
 *
 * @param {Iterable<*>} iterable
 * @param {((value: *, index: bigint) => bigint) | null} termFn
 * @param {bigint} initial
 * @returns {Generator<bigint, bigint, void>}
 */
function* summationGenerator(iterable, termFn, initial) {
	let acc = initial
	let index = 0n

	for (const item of iterable) {
		const term = termFn !== null ? termFn(item, index) : item
		if (typeof term !== 'bigint') {
			throw new TypeError(
				`summationBigIntLazy: expected bigint term at index ${index}, received ${
					term === null ? 'null' : typeof term
				}`
			)
		}
		acc += term
		index += 1n
		yield acc
	}

	return acc
}
