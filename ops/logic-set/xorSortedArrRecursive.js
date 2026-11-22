/**
 * Validates that a value is a strictly ascending (sorted and de-duplicated)
 * array of finite numbers.
 *
 * @param {unknown} arr - Candidate input array.
 * @param {string} name - Parameter name for descriptive error messages.
 * @throws {TypeError} If `arr` is not an array or contains a non-number element.
 * @throws {RangeError} If `arr` contains a non-finite number, duplicate values, or out-of-order elements.
 */
function validateSortedUniqueArray(arr, name) {
	if (!Array.isArray(arr)) {
		throw new TypeError(`Expected "${name}" to be an array, received ${arr === null ? 'null' : typeof arr}`)
	}

	for (let i = 0; i < arr.length; i++) {
		if (!(i in arr)) {
			throw new TypeError(`Expected finite number at ${name}[${i}], received sparse hole`)
		}
		const val = arr[i]
		if (typeof val !== 'number') {
			throw new TypeError(`Expected finite number at ${name}[${i}], received ${val === null ? 'null' : typeof val}`)
		}
		if (!Number.isFinite(val)) {
			throw new RangeError(`Expected finite number at ${name}[${i}], received ${val}`)
		}
		if (i > 0) {
			const prev = arr[i - 1]
			if (val === prev) {
				throw new RangeError(`Array "${name}" must be de-duplicated (duplicate value ${val} at index ${i})`)
			}
			if (val < prev) {
				throw new RangeError(
					`Array "${name}" must be sorted in strictly ascending order (${prev} > ${val} at index ${i})`,
				)
			}
		}
	}
}

/**
 * Appends `arr[lo..hi)` into `out`, normalizing `-0` to `0`.
 *
 * @param {readonly number[]} arr - Source array.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @param {number[]} out - Destination accumulator array.
 */
function appendRange(arr, lo, hi, out) {
	for (let i = lo; i < hi; i++) {
		const value = arr[i]
		out.push(value === 0 ? 0 : value)
	}
}

/**
 * Recursively finds the first index in `arr[lo..hi)` whose element is `>= target`.
 *
 * @param {readonly number[]} arr - Strictly ascending array of finite numbers.
 * @param {number} lo - Inclusive lower bound index.
 * @param {number} hi - Exclusive upper bound index.
 * @param {number} target - Target value to search for.
 * @returns {number} First index `i` in `[lo, hi]` such that `i === hi || arr[i] >= target`.
 */
function lowerBoundRecursive(arr, lo, hi, target) {
	if (lo >= hi) {
		return lo
	}
	const mid = lo + ((hi - lo) >>> 1)
	if (arr[mid] < target) {
		return lowerBoundRecursive(arr, mid + 1, hi, target)
	}
	return lowerBoundRecursive(arr, lo, mid, target)
}

/**
 * Divide-and-conquer recursive merge-style symmetric difference over
 * `a[aLo..aHi)` and `b[bLo..bHi)`, appending elements in strictly ascending order to `out`.
 *
 * @param {readonly number[]} a - First strictly ascending array.
 * @param {number} aLo - Inclusive start index in `a`.
 * @param {number} aHi - Exclusive end index in `a`.
 * @param {readonly number[]} b - Second strictly ascending array.
 * @param {number} bLo - Inclusive start index in `b`.
 * @param {number} bHi - Exclusive end index in `b`.
 * @param {number[]} out - Output accumulator array.
 */
function xorRange(a, aLo, aHi, b, bLo, bHi, out) {
	const aLen = aHi - aLo
	const bLen = bHi - bLo

	if (aLen === 0) {
		appendRange(b, bLo, bHi, out)
		return
	}
	if (bLen === 0) {
		appendRange(a, aLo, aHi, out)
		return
	}

	// Disjoint-range short-circuits
	if (a[aHi - 1] < b[bLo]) {
		appendRange(a, aLo, aHi, out)
		appendRange(b, bLo, bHi, out)
		return
	}
	if (b[bHi - 1] < a[aLo]) {
		appendRange(b, bLo, bHi, out)
		appendRange(a, aLo, aHi, out)
		return
	}

	// Always partition the larger subarray to guarantee O(log(max(n, m))) recursion depth
	if (aLen < bLen) {
		xorRange(b, bLo, bHi, a, aLo, aHi, out)
		return
	}

	const aMid = aLo + (aLen >>> 1)
	const pivot = a[aMid]
	const bSplit = lowerBoundRecursive(b, bLo, bHi, pivot)

	// Recurse on elements strictly less than pivot
	xorRange(a, aLo, aMid, b, bLo, bSplit, out)

	if (bSplit < bHi && b[bSplit] === pivot) {
		// Pivot exists in both arrays: exclude it and recurse on elements strictly greater than pivot
		xorRange(a, aMid + 1, aHi, b, bSplit + 1, bHi, out)
	} else {
		// Pivot exists only in `a`: include it and recurse on elements strictly greater than pivot
		out.push(pivot === 0 ? 0 : pivot)
		xorRange(a, aMid + 1, aHi, b, bSplit, bHi, out)
	}
}

/**
 * Computes the logical XOR (symmetric difference, `A Δ B`) of two sorted,
 * de-duplicated arrays of finite numbers using a recursive divide-and-conquer
 * merge-style algorithm.
 *
 * Algorithm:
 * At each recursive step over subranges `a[aLo..aHi)` and `b[bLo..bHi)`, the
 * larger subrange is split at its midpoint `pivot`, and the opposite subrange
 * is partitioned around `pivot` using recursive binary search (`lowerBoundRecursive`).
 * Elements strictly less than `pivot` are resolved recursively first, `pivot`
 * is either emitted (if absent from the other subrange) or cancelled (if present
 * in both), and elements strictly greater than `pivot` are resolved recursively
 * last. This guarantees `O(log(max(|a|, |b|)))` recursion depth and returns a
 * new strictly ascending, de-duplicated array without mutating the inputs.
 *
 * @param {readonly number[]} a - First sorted, de-duplicated array of finite numbers.
 * @param {readonly number[]} b - Second sorted, de-duplicated array of finite numbers.
 * @returns {number[]} New sorted, de-duplicated array containing elements present in exactly one of `a` or `b`.
 * @throws {TypeError} If `a` or `b` is not an array or contains non-number / sparse elements.
 * @throws {RangeError} If `a` or `b` contains non-finite numbers, duplicate values, or is not strictly ascending.
 */
export function xorSortedArrRecursive(a, b) {
	validateSortedUniqueArray(a, 'a')
	validateSortedUniqueArray(b, 'b')

	const result = []
	xorRange(a, 0, a.length, b, 0, b.length, result)
	return result
}
