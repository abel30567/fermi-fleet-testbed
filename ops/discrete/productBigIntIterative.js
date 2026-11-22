/**
 * Computes the discrete product of an iterable of exact BigInt integers using
 * a straightforward iterative loop.
 *
 * Scaling semantics:
 * Because the product of exact integers is always an exact integer, the result
 * is returned directly as an exact unscaled `bigint` (no 10^18 fixed-point
 * scaling is applied). By standard algebraic convention, the empty product
 * evaluates to the multiplicative identity `1n`.
 *
 * @param {Iterable<bigint>} values - Iterable of exact `bigint` values (e.g. `Array<bigint>`, `Set<bigint>`, `BigInt64Array`, generator).
 * @returns {bigint} Exact discrete product of all elements in `values`, or `1n` if `values` is empty.
 * @throws {TypeError} If `values` is not a non-string iterable object or if any element is not a `bigint`.
 */
export function productBigIntIterative(values) {
	if (
		values === null ||
		typeof values !== 'object' ||
		typeof values[Symbol.iterator] !== 'function'
	) {
		throw new TypeError('Expected values to be an iterable of bigint values');
	}

	let product = 1n;
	let index = 0;

	for (const value of values) {
		if (typeof value !== 'bigint') {
			const received = value === null ? 'null' : typeof value;
			throw new TypeError(
				`Expected bigint at index ${index}, received ${received}`
			);
		}
		if (product !== 0n) {
			product *= value;
		}
		index += 1;
	}

	return product;
}
