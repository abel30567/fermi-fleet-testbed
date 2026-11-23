/**
 * Merges two disjoint sets into a single set using small-to-large insertion.
 *
 * @template T
 * @param {Set<T>} left
 * @param {Set<T>} right
 * @returns {Set<T>}
 */
function mergeDisjointSets(left, right) {
	if (left.size >= right.size) {
		for (const item of right) {
			left.add(item);
		}
		return left;
	}
	for (const item of left) {
		right.add(item);
	}
	return right;
}

/**
 * Recursively computes the set complement of `excludeSet` over `universeItems[start..end)`
 * using a divide-and-conquer strategy with O(log n) recursion depth.
 *
 * @template T
 * @param {readonly T[]} universeItems - Snapshot of the universe elements.
 * @param {ReadonlySet<T>} excludeSet - Set of elements to exclude.
 * @param {number} start - Inclusive start index into `universeItems`.
 * @param {number} end - Exclusive end index into `universeItems`.
 * @returns {Set<T>}
 */
function complementRange(universeItems, excludeSet, start, end) {
	const length = end - start;
	if (length <= 0) {
		return new Set();
	}
	if (length === 1) {
		const element = universeItems[start];
		return excludeSet.has(element) ? new Set() : new Set([element]);
	}

	const mid = start + Math.floor(length / 2);
	const left = complementRange(universeItems, excludeSet, start, mid);
	const right = complementRange(universeItems, excludeSet, mid, end);
	return mergeDisjointSets(left, right);
}

/**
 * Computes the logical NOT over plain booleans or the relative set complement
 * (`universe \ value`) over JavaScript `Set` objects using a recursive
 * divide-and-conquer implementation.
 *
 * - When `value` is a plain boolean, `universe` must be omitted (`undefined`),
 *   and the function returns `!value`.
 * - When `value` is a `Set`, `universe` must be a `Set`, and the function
 *   returns a new `Set` containing all elements of `universe` that are not in
 *   `value` (using JavaScript `Set` SameValueZero equality). Neither input
 *   `Set` is mutated.
 *
 * @template T
 * @overload
 * @param {boolean} value - Plain boolean to negate.
 * @returns {boolean} Logical negation of `value`.
 *
 * @overload
 * @param {ReadonlySet<T>} value - Set whose complement is computed.
 * @param {ReadonlySet<T>} universe - Universe set with respect to which the complement is taken.
 * @returns {Set<T>} New `Set` containing elements in `universe` not present in `value`.
 *
 * @param {boolean | ReadonlySet<T>} value - Plain boolean or `Set` to negate.
 * @param {ReadonlySet<T>} [universe] - Required universe `Set` when `value` is a `Set`; must be omitted for booleans.
 * @returns {boolean | Set<T>} Negated boolean or complement `Set`.
 * @throws {TypeError} If `value` is neither a plain boolean nor a `Set`, or if `universe` is invalid for the given `value`.
 */
export function notBoolRecursive(value, universe) {
	if (typeof value === 'boolean') {
		if (universe !== undefined) {
			throw new TypeError(
				'notBoolRecursive: universe must not be provided when negating a boolean',
			);
		}
		return !value;
	}

	if (value instanceof Set) {
		if (!(universe instanceof Set)) {
			throw new TypeError(
				'notBoolRecursive: universe must be a Set when negating a Set',
			);
		}
		const universeItems = Array.from(universe);
		return complementRange(universeItems, value, 0, universeItems.length);
	}

	throw new TypeError(
		'notBoolRecursive: value must be a plain boolean or a Set',
	);
}
