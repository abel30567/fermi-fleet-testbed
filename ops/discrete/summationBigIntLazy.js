/**
 * Fixed-point scale factor (`10n ** 18n`) used across BigInt fixed-point operations.
 *
 * Because discrete summation over exact BigInts is linear, summing integer terms
 * produces exact BigInt integers with no rounding, and summing fixed-point BigInts
 * pre-scaled by `FIXED_POINT_SCALE` (`10n ** 18n`) preserves the exact `10n ** 18n`
 * scale in every yielded partial sum.
 */
export const FIXED_POINT_SCALE = 1_000_000_000_000_000_000n;

/**
 * Validates that a value is a non-string iterable.
 *
 * @param {unknown} iterable
 * @throws {TypeError} If `iterable` is nullish, a string, or lacks `[Symbol.iterator]`.
 */
function assertIterable(iterable) {
	if (
		iterable == null ||
		typeof iterable === 'string' ||
		iterable instanceof String ||
		typeof iterable[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(
			'Expected iterable to be a non-string iterable sequence of BigInt values'
		);
	}
}

/**
 * Parses and validates the optional second argument (`initial` BigInt or options object).
 *
 * @param {bigint | { initial?: bigint, term?: (item: unknown, index: bigint) => bigint } | undefined} initialOrOptions
 * @returns {{ initial: bigint, term: ((item: unknown, index: bigint) => bigint) | undefined }}
 * @throws {TypeError} If options or any option field has an invalid type.
 */
function parseOptions(initialOrOptions) {
	if (initialOrOptions === undefined) {
		return { initial: 0n, term: undefined };
	}

	if (typeof initialOrOptions === 'bigint') {
		return { initial: initialOrOptions, term: undefined };
	}

	if (
		typeof initialOrOptions !== 'object' ||
		initialOrOptions === null ||
		Array.isArray(initialOrOptions)
	) {
		throw new TypeError(
			'Expected second argument to be a BigInt initial value or an options object'
		);
	}

	const { initial = 0n, term } = initialOrOptions;

	if (typeof initial !== 'bigint') {
		throw new TypeError('Expected options.initial to be a BigInt');
	}

	if (term !== undefined && typeof term !== 'function') {
		throw new TypeError('Expected options.term to be a function');
	}

	return { initial, term };
}

/**
 * Internal generator that lazily consumes `iterable` and yields exact running sums.
 *
 * @param {Iterable<unknown>} iterable
 * @param {bigint} initial
 * @param {((item: unknown, index: bigint) => bigint) | undefined} term
 * @returns {Generator<bigint, void, undefined>}
 */
function* runSummation(iterable, initial, term) {
	let sum = initial;
	let index = 0n;

	for (const item of iterable) {
		const value = term !== undefined ? term(item, index) : item;

		if (typeof value !== 'bigint') {
			throw new TypeError(
				term !== undefined
					? `Expected options.term to return a BigInt at index ${index}, got ${typeof value}`
					: `Expected BigInt element at index ${index}, got ${typeof value}`
			);
		}

		sum += value;
		index += 1n;
		yield sum;
	}
}

/**
 * Lazily computes the discrete summation (running partial sums) of a sequence
 * over exact `BigInt` values.
 *
 * Given an iterable producing terms `x_0, x_1, x_2, ...` (or mapped via
 * `options.term(item, index)`), this function returns a `Generator` that yields
 * the exact running partial sums:
 *
 * `S_n = initial + sum_{k=0}^{n} term_k`
 *
 * Representation & scaling:
 * - All arithmetic uses exact arbitrary-precision `BigInt` addition with zero
 *   overflow or floating-point rounding.
 * - Integer summations yield exact `BigInt` integers.
 * - For non-integer series represented in fixed-point scaled by
 *   `FIXED_POINT_SCALE` (`10n ** 18n`), linearity of summation guarantees that
 *   every yielded partial sum is exact at the same `10n ** 18n` scale.
 *
 * Laziness guarantees:
 * - Does not materialize the input iterable into an array.
 * - Does not invoke `iterable[Symbol.iterator]()` until the caller starts
 *   pulling values from the returned generator.
 * - Pulls exactly one input element per `.next()` call, supporting arbitrarily
 *   large or infinite iterables and propagating early termination (`return()`)
 *   to the underlying iterator.
 *
 * @param {Iterable<bigint> | Iterable<unknown>} iterable - Input sequence to sum lazily.
 * @param {bigint | { initial?: bigint, term?: (item: unknown, index: bigint) => bigint }} [initialOrOptions=0n]
 *   Optional initial BigInt accumulator (default `0n`) or options object:
 *   - `initial`: starting BigInt accumulator (default `0n`).
 *   - `term`: optional mapper `(item, index) => bigint` applied lazily to each element.
 * @returns {Generator<bigint, void, undefined>} Lazy generator yielding exact BigInt partial sums.
 * @throws {TypeError} If `iterable` is not a non-string iterable, if `initialOrOptions`
 *   is invalid, or (lazily during iteration) if any term is not a `BigInt`.
 */
export function summationBigIntLazy(iterable, initialOrOptions = 0n) {
	assertIterable(iterable);
	const { initial, term } = parseOptions(initialOrOptions);
	return runSummation(iterable, initial, term);
}
