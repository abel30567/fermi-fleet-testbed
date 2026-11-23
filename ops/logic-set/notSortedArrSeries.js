/**
 * Default strict total-order comparator for homogeneous numbers, strings, or bigints.
 *
 * @template {number | string | bigint} T
 * @param {T} x
 * @param {T} y
 * @returns {-1 | 0 | 1}
 */
function defaultCompare(x, y) {
	if (x < y) return -1;
	if (x > y) return 1;
	return 0;
}

/**
 * Invokes a user-supplied comparator and validates that it returns a non-NaN number.
 *
 * @template T
 * @param {(x: T, y: T) => number} cmp
 * @param {T} x
 * @param {T} y
 * @returns {number}
 */
function callCompare(cmp, x, y) {
	const result = cmp(x, y);
	if (typeof result !== 'number' || Number.isNaN(result)) {
		throw new TypeError('compare must return a non-NaN number');
	}
	return result;
}

/**
 * Validates that an input is a dense, strictly ascending (sorted and de-duplicated) array.
 * When using the default comparator, also verifies that elements are homogeneous
 * comparable primitives (non-NaN number, string, or bigint).
 *
 * @template T
 * @param {unknown} arr
 * @param {string} name
 * @param {(x: T, y: T) => number} cmp
 * @param {boolean} isDefault
 * @param {string | null} expectedType
 * @returns {string | null}
 */
function validateSortedDeduplicated(arr, name, cmp, isDefault, expectedType) {
	if (!Array.isArray(arr)) {
		throw new TypeError(`${name} must be an Array`);
	}

	let elementType = expectedType;

	for (let i = 0; i < arr.length; i++) {
		if (!(i in arr)) {
			throw new TypeError(`${name} must not be a sparse array (hole at index ${i})`);
		}

		const value = arr[i];

		if (isDefault) {
			const t = typeof value;
			if (t !== 'number' && t !== 'string' && t !== 'bigint') {
				throw new TypeError(
					`${name}[${i}] must be a number, string, or bigint when using the default comparator`,
				);
			}
			if (t === 'number' && Number.isNaN(value)) {
				throw new TypeError(`${name}[${i}] must not be NaN`);
			}
			if (elementType === null) {
				elementType = t;
			} else if (t !== elementType) {
				throw new TypeError(
					`Inconsistent element types: expected ${elementType}, received ${t} at ${name}[${i}]`,
				);
			}
		}

		if (i > 0) {
			const order = isDefault
				? defaultCompare(arr[i - 1], value)
				: callCompare(cmp, arr[i - 1], value);

			if (order === 0) {
				throw new RangeError(`${name} must be de-duplicated (duplicate element at index ${i})`);
			}
			if (order > 0) {
				throw new RangeError(
					`${name} must be strictly sorted in ascending order (out-of-order at index ${i})`,
				);
			}
		}
	}

	return elementType;
}

/**
 * Two-pointer merge computing the set intersection `left ∩ right` in O(|left| + |right|).
 * Preserves the canonical element reference from `left` on equality.
 *
 * @template T
 * @param {readonly T[]} left
 * @param {readonly T[]} right
 * @param {(x: T, y: T) => number} cmp
 * @param {boolean} isDefault
 * @returns {T[]}
 */
function mergeIntersect(left, right, cmp, isDefault) {
	const result = [];
	let i = 0;
	let j = 0;

	while (i < left.length && j < right.length) {
		const order = isDefault
			? defaultCompare(left[i], right[j])
			: callCompare(cmp, left[i], right[j]);

		if (order < 0) {
			i++;
		} else if (order > 0) {
			j++;
		} else {
			result.push(left[i]);
			i++;
			j++;
		}
	}

	return result;
}

/**
 * Two-pointer merge computing the symmetric difference `left △ right` in O(|left| + |right|).
 * Equal elements cancel under XOR / alternating-series multiplicity (1 - 1 = 0).
 *
 * @template T
 * @param {readonly T[]} left
 * @param {readonly T[]} right
 * @param {(x: T, y: T) => number} cmp
 * @param {boolean} isDefault
 * @returns {T[]}
 */
function mergeSymDiff(left, right, cmp, isDefault) {
	const result = [];
	let i = 0;
	let j = 0;

	while (i < left.length && j < right.length) {
		const order = isDefault
			? defaultCompare(left[i], right[j])
			: callCompare(cmp, left[i], right[j]);

		if (order < 0) {
			result.push(left[i]);
			i++;
		} else if (order > 0) {
			result.push(right[j]);
			j++;
		} else {
			i++;
			j++;
		}
	}

	while (i < left.length) {
		result.push(left[i]);
		i++;
	}

	while (j < right.length) {
		result.push(right[j]);
		j++;
	}

	return result;
}

/**
 * Computes the logical NOT (set complement) of a sorted, de-duplicated array `a`
 * with respect to a sorted, de-duplicated `universe` array.
 *
 * Mathematical foundation (Boolean ring / alternating inclusion-exclusion series identity):
 *
 *     ¬A = U \ A = U △ (U ∩ A)
 *
 * Equivalently, in closed-form indicator-series notation:
 *
 *     1_{¬A}(x) = Σ_{k=0}^{1} (-1)^k · 1_{U ∩ A^{(k)}}(x)
 *               = 1_U(x) - 1_{U ∩ A}(x)
 *               = 1_U(x) ⊕ (1_U(x) · 1_A(x))
 *
 * Both the intersection `U ∩ A` and symmetric difference `U △ (U ∩ A)` are evaluated via
 * linear two-pointer merge algorithms, yielding a strictly sorted, de-duplicated result
 * in O(|universe| + |a|) time and O(|universe|) auxiliary space without mutating inputs.
 *
 * @template T
 * @param {readonly T[]} a - Strictly sorted, de-duplicated array representing set A.
 * @param {readonly T[]} universe - Strictly sorted, de-duplicated array representing universal set U.
 * @param {(x: T, y: T) => number} [compare] - Optional strict total-order comparator.
 *   Defaults to ascending comparison for homogeneous numbers (excluding NaN), strings, or bigints.
 * @returns {T[]} New strictly sorted, de-duplicated array representing ¬A = U \ A.
 * @throws {TypeError} If `a` or `universe` is not a dense Array, `compare` is invalid, or
 *   elements are incompatible with the default comparator (e.g. NaN, mixed types, non-primitives).
 * @throws {RangeError} If `a` or `universe` is not strictly ascending (unsorted or has duplicates).
 */
export function notSortedArrSeries(a, universe, compare) {
	if (compare !== undefined && typeof compare !== 'function') {
		throw new TypeError('compare must be a function when provided');
	}

	const isDefault = compare === undefined;
	const cmp = isDefault ? defaultCompare : compare;

	const detectedType = validateSortedDeduplicated(a, 'a', cmp, isDefault, null);
	validateSortedDeduplicated(universe, 'universe', cmp, isDefault, detectedType);

	// Boolean-ring / inclusion-exclusion identity: ¬A = U △ (U ∩ A)
	const intersection = mergeIntersect(universe, a, cmp, isDefault);
	return mergeSymDiff(universe, intersection, cmp, isDefault);
}
