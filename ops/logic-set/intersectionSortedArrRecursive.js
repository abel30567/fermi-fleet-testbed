/**
 * Default strict numeric comparator that avoids subtraction overflow
 * (e.g., for `Number.MAX_VALUE` and `-Number.MAX_VALUE`).
 *
 * @param {number} x
 * @param {number} y
 * @returns {-1 | 0 | 1}
 */
function defaultCompare(x, y) {
	return x < y ? -1 : x > y ? 1 : 0
}

/**
 * Wraps a user-supplied comparator to ensure it always returns a finite number.
 *
 * @template T
 * @param {(x: T, y: T) => number} compare
 * @returns {(x: T, y: T) => number}
 */
function wrapComparator(compare) {
	return (x, y) => {
		const result = compare(x, y)
		if (typeof result !== 'number' || !Number.isFinite(result)) {
			throw new TypeError('compare must return a finite number')
		}
		return result
	}
}

/**
 * Validates that an input is a dense, strictly ascending (sorted & de-duplicated) array.
 *
 * @template T
 * @param {unknown} arr
 * @param {string} name
 * @param {(x: T, y: T) => number} cmp
 * @param {boolean} isNumericDefault
 * @returns {void}
 */
function validateSortedUniqueArray(arr, name, cmp, isNumericDefault) {
	if (!Array.isArray(arr)) {
		throw new TypeError(`${name} must be an array`)
	}
	for (let i = 0; i < arr.length; i++) {
		if (!Object.hasOwn(arr, i)) {
			throw new TypeError(`${name} must not be a sparse array (hole at index ${i})`)
		}
		const val = arr[i]
		if (isNumericDefault) {
			if (typeof val !== 'number') {
				throw new TypeError(`${name}[${i}] must be a number, got ${typeof val}`)
			}
			if (!Number.isFinite(val)) {
				throw new RangeError(`${name}[${i}] must be a finite number, got ${val}`)
			}
		}
		if (i > 0) {
			const order = cmp(arr[i - 1], val)
			if (order === 0) {
				throw new RangeError(
					`${name} must be de-duplicated (duplicate element at indices ${i - 1} and ${i})`
				)
			}
			if (order > 0) {
				throw new RangeError(
					`${name} must be sorted in strictly ascending order (out of order at indices ${i - 1} and ${i})`
				)
			}
		}
	}
}

/**
 * Recursively finds the smallest index in `[lo, hi)` whose element is `>= target`
 * according to `cmp`, or `hi` if all elements in `[lo, hi)` are `< target`.
 *
 * @template T
 * @param {readonly T[]} arr
 * @param {number} lo
 * @param {number} hi
 * @param {T} target
 * @param {(x: T, y: T) => number} cmp
 * @returns {number}
 */
function lowerBoundRecursive(arr, lo, hi, target, cmp) {
	if (lo >= hi) {
		return lo
	}
	const mid = lo + ((hi - lo) >>> 1)
	if (cmp(arr[mid], target) < 0) {
		return lowerBoundRecursive(arr, mid + 1, hi, target, cmp)
	}
	return lowerBoundRecursive(arr, lo, mid, target, cmp)
}

/**
 * Recursive Baeza-Yates divide-and-conquer merge intersection over half-open slices
 * `a[aLo..aHi)` and `b[bLo..bHi)`.
 *
 * Always splits the shorter slice at its midpoint and partitions the other slice
 * via recursive binary search (`lowerBoundRecursive`). This guarantees
 * `O(log(min(m, n)))` recursion depth and `O(min(m, n) * log(max(m, n) / min(m, n) + 1))`
 * time complexity, while emitting common elements in strictly ascending order.
 *
 * @template T
 * @param {readonly T[]} a
 * @param {number} aLo
 * @param {number} aHi
 * @param {readonly T[]} b
 * @param {number} bLo
 * @param {number} bHi
 * @param {(x: T, y: T) => number} cmp
 * @param {boolean} normalizeZero
 * @param {T[]} out
 * @returns {void}
 */
function intersectDivideConquer(a, aLo, aHi, b, bLo, bHi, cmp, normalizeZero, out) {
	const aLen = aHi - aLo
	const bLen = bHi - bLo
	if (aLen <= 0 || bLen <= 0) {
		return
	}

	// Range-disjoint pruning: if all elements in one slice precede the other, stop immediately.
	if (cmp(a[aHi - 1], b[bLo]) < 0 || cmp(b[bHi - 1], a[aLo]) < 0) {
		return
	}

	if (aLen <= bLen) {
		const aMid = aLo + (aLen >>> 1)
		const pivot = a[aMid]
		const bPos = lowerBoundRecursive(b, bLo, bHi, pivot, cmp)

		intersectDivideConquer(a, aLo, aMid, b, bLo, bPos, cmp, normalizeZero, out)

		let bRightLo = bPos
		if (bPos < bHi && cmp(b[bPos], pivot) === 0) {
			out.push(normalizeZero && pivot === 0 ? 0 : pivot)
			bRightLo = bPos + 1
		}

		intersectDivideConquer(a, aMid + 1, aHi, b, bRightLo, bHi, cmp, normalizeZero, out)
	} else {
		const bMid = bLo + (bLen >>> 1)
		const pivot = b[bMid]
		const aPos = lowerBoundRecursive(a, aLo, aHi, pivot, cmp)

		intersectDivideConquer(a, aLo, aPos, b, bLo, bMid, cmp, normalizeZero, out)

		let aRightLo = aPos
		if (aPos < aHi && cmp(a[aPos], pivot) === 0) {
			const matched = a[aPos]
			out.push(normalizeZero && matched === 0 ? 0 : matched)
			aRightLo = aPos + 1
		}

		intersectDivideConquer(a, aRightLo, aHi, b, bMid + 1, bHi, cmp, normalizeZero, out)
	}
}

/**
 * Computes the set intersection (`a ∩ b`) of two strictly ascending (sorted,
 * de-duplicated) arrays using a recursive Baeza-Yates divide-and-conquer
 * merge-style algorithm.
 *
 * Algorithm:
 * - Validates that both `a` and `b` are dense, strictly ascending arrays.
 * - Recursively splits the shorter active subarray at its midpoint, locates the
 *   partition point in the longer subarray via recursive binary search, and
 *   recurses on the left and right subproblems in ascending order, pruning
 *   non-overlapping ranges in O(1).
 * - Time complexity: `O(min(m, n) * log(max(m, n) / min(m, n) + 1))` (which is
 *   `O(m + n)` when `m ≈ n` and `O(m log(n / m))` when `m << n`).
 * - Stack depth: `O(log(min(m, n)))`.
 *
 * @template T
 * @param {readonly T[]} a - First sorted, de-duplicated array (finite numbers by default).
 * @param {readonly T[]} b - Second sorted, de-duplicated array (finite numbers by default).
 * @param {(x: T, y: T) => number} [compare] - Optional strict weak ordering comparator returning a finite negative, zero, or positive number.
 * @returns {T[]} A new sorted, de-duplicated array containing elements present in both `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not a dense array, if `compare` is provided and not a function, if `compare` does not return a finite number, or (with the default comparator) if any element is not a number.
 * @throws {RangeError} If (with the default comparator) any element is `NaN` or `±Infinity`, or if `a` or `b` is not strictly ascending (unsorted or contains duplicates).
 */
export function intersectionSortedArrRecursive(a, b, compare) {
	const isNumericDefault = compare === undefined
	if (!isNumericDefault && typeof compare !== 'function') {
		throw new TypeError(`compare must be a function, got ${typeof compare}`)
	}

	const cmp = isNumericDefault ? defaultCompare : wrapComparator(compare)

	validateSortedUniqueArray(a, 'a', cmp, isNumericDefault)
	validateSortedUniqueArray(b, 'b', cmp, isNumericDefault)

	const out = []
	intersectDivideConquer(a, 0, a.length, b, 0, b.length, cmp, isNumericDefault, out)
	return out
}
