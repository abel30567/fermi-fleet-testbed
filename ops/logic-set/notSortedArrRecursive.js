/**
 * Validates that a value is a strictly ascending (sorted and de-duplicated)
 * array of finite numbers.
 *
 * @param {unknown} value - Candidate array to validate.
 * @param {string} name - Parameter name for descriptive error messages.
 * @throws {TypeError} If `value` is not an array or contains a non-number element.
 * @throws {RangeError} If `value` contains a non-finite number, duplicate elements, or unsorted elements.
 */
function validateSortedUniqueArray(value, name) {
	if (!Array.isArray(value)) {
		throw new TypeError(`${name} must be an array`)
	}

	let prev = -Infinity
	for (let i = 0; i < value.length; i++) {
		if (!(i in value)) {
			throw new TypeError(`${name} must not be a sparse array (missing element at index ${i})`)
		}
		const el = value[i]
		if (typeof el !== 'number') {
			throw new TypeError(`${name}[${i}] must be a finite number, got ${typeof el}`)
		}
		if (!Number.isFinite(el)) {
			throw new RangeError(`${name}[${i}] must be a finite number, got ${el}`)
		}
		if (i > 0) {
			if (el === prev) {
				throw new RangeError(
					`${name} must be strictly ascending (sorted and de-duplicated); found duplicate ${el} at index ${i}`,
				)
			}
			if (el < prev) {
				throw new RangeError(
					`${name} must be strictly ascending (sorted and de-duplicated); found ${el} after ${prev} at index ${i}`,
				)
			}
		}
		prev = el
	}
}

/**
 * Recursive binary search finding the smallest index in `[lo, hi)` whose element
 * is greater than or equal to `target`, or `hi` if every element is smaller.
 *
 * @param {number[]} arr - Strictly ascending array of finite numbers.
 * @param {number} lo - Inclusive lower index bound.
 * @param {number} hi - Exclusive upper index bound.
 * @param {number} target - Pivot value to locate.
 * @returns {number} Lower-bound index in `[lo, hi]`.
 */
function lowerBoundRecursive(arr, lo, hi, target) {
	if (lo >= hi) {
		return lo
	}
	const mid = lo + Math.floor((hi - lo) / 2)
	if (arr[mid] < target) {
		return lowerBoundRecursive(arr, mid + 1, hi, target)
	}
	return lowerBoundRecursive(arr, lo, mid, target)
}

/**
 * Recursively computes the relative complement `universe[uLo..uHi) \ set[aLo..aHi)`
 * using divide-and-conquer merge-style partitioning and appends results in-order to `out`.
 *
 * Splits `universe` at its midpoint `pivot`, partitions `set` around `pivot` via
 * recursive binary search, and recurses on the independent left (`< pivot`) and
 * right (`> pivot`) subproblems. Recursion depth is bounded by `O(log |universe|)`.
 *
 * @param {number[]} set - Strictly ascending array of elements to exclude.
 * @param {number} aLo - Inclusive lower bound in `set`.
 * @param {number} aHi - Exclusive upper bound in `set`.
 * @param {number[]} universe - Strictly ascending universe array.
 * @param {number} uLo - Inclusive lower bound in `universe`.
 * @param {number} uHi - Exclusive upper bound in `universe`.
 * @param {number[]} out - Output array accumulating complement elements in ascending order.
 */
function complementDivideAndConquer(set, aLo, aHi, universe, uLo, uHi, out) {
	if (uLo >= uHi) {
		return
	}

	const uMid = uLo + Math.floor((uHi - uLo) / 2)
	const pivot = universe[uMid]

	if (aLo >= aHi) {
		if (uHi - uLo === 1) {
			out.push(pivot === 0 ? 0 : pivot)
			return
		}
		complementDivideAndConquer(set, aLo, aHi, universe, uLo, uMid, out)
		out.push(pivot === 0 ? 0 : pivot)
		complementDivideAndConquer(set, aLo, aHi, universe, uMid + 1, uHi, out)
		return
	}

	const aMid = lowerBoundRecursive(set, aLo, aHi, pivot)
	const pivotInSet = aMid < aHi && set[aMid] === pivot
	const aRightLo = pivotInSet ? aMid + 1 : aMid

	complementDivideAndConquer(set, aLo, aMid, universe, uLo, uMid, out)

	if (!pivotInSet) {
		out.push(pivot === 0 ? 0 : pivot)
	}

	complementDivideAndConquer(set, aRightLo, aHi, universe, uMid + 1, uHi, out)
}

/**
 * Computes the logical set complement (`NOT`) of a sorted, de-duplicated array `set`
 * relative to a sorted, de-duplicated `universe` array:
 *
 *   `not(set, universe) = universe \ set = { x ∈ universe | x ∉ set }`
 *
 * Uses a recursive divide-and-conquer merge-style partitioning algorithm:
 * the `universe` range is bisected at its midpoint `pivot`, the `set` range is
 * partitioned at `pivot` via recursive binary search (`lowerBoundRecursive`), and
 * the left and right subproblems are solved recursively in-order.
 *
 * Time complexity: `O(|universe| + |set|)` (including input validation); core D&C
 * runs in `O(min(|universe|, |set|) * log(1 + max / min) + |output|)` with
 * `O(log |universe| + log |set|)` call-stack depth.
 *
 * @param {number[]} set - Strictly ascending (sorted, de-duplicated) array of finite numbers to complement.
 * @param {number[]} universe - Strictly ascending (sorted, de-duplicated) array of finite numbers defining the universe.
 * @returns {number[]} A new strictly ascending, de-duplicated array containing all elements of `universe` not in `set`.
 * @throws {TypeError} If `set` or `universe` is not an array, is sparse, or contains non-number elements.
 * @throws {RangeError} If `set` or `universe` contains non-finite numbers (`NaN`, `±Infinity`), duplicates, or out-of-order elements.
 */
export function notSortedArrRecursive(set, universe) {
	validateSortedUniqueArray(set, 'set')
	validateSortedUniqueArray(universe, 'universe')

	const out = []
	complementDivideAndConquer(set, 0, set.length, universe, 0, universe.length, out)
	return out
}
