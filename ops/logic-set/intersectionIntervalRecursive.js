/**
 * Computes the normalized, merged set intersection of two sets of closed real
 * intervals `[lo, hi]` using a recursive divide-and-conquer algorithm.
 *
 * Each input set may be unnormalized (unsorted, overlapping, touching, or
 * containing duplicate intervals). Both sets are first validated, sorted via
 * recursive merge sort, and merged via divide-and-conquer into strictly
 * disjoint, sorted intervals. The two normalized sets are then intersected
 * recursively by splitting the larger set around its median interval, locating
 * the overlapping slice of the other set with recursive binary search, and
 * recursing on the left and right subproblems.
 *
 * The returned array is newly allocated, sorted in ascending order, and
 * strictly disjoint (`result[i][1] < result[i + 1][0]`). Input arrays and
 * tuples are never mutated, and `-0` endpoints are normalized to `0`.
 *
 * @param {Array<[number, number]>} setA - First set of closed finite intervals `[lo, hi]` with `lo <= hi`.
 * @param {Array<[number, number]>} setB - Second set of closed finite intervals `[lo, hi]` with `lo <= hi`.
 * @returns {Array<[number, number]>} Normalized, merged intersection intervals.
 * @throws {TypeError} If either set is not an array, an element is not a 2-tuple array, or an endpoint is not a number.
 * @throws {RangeError} If any endpoint is non-finite (`NaN`, `Infinity`, `-Infinity`) or `lo > hi`.
 */
export function intersectionIntervalRecursive(setA, setB) {
	const cleanA = validateIntervalSet(setA, 'setA')
	const cleanB = validateIntervalSet(setB, 'setB')

	if (cleanA.length === 0 || cleanB.length === 0) {
		return []
	}

	const normA = normalizeIntervalsRecursive(cleanA)
	const normB = normalizeIntervalsRecursive(cleanB)

	const result = []
	intersectDivideAndConquer(normA, 0, normA.length, normB, 0, normB.length, result)
	return result
}

/**
 * Validates an interval set and returns a shallow-cloned array of sanitized
 * `[lo, hi]` pairs with `-0` normalized to `0`.
 *
 * @param {unknown} set
 * @param {string} name
 * @returns {Array<[number, number]>}
 */
function validateIntervalSet(set, name) {
	if (!Array.isArray(set)) {
		throw new TypeError(`${name} must be an array of [lo, hi] intervals`)
	}

	const sanitized = new Array(set.length)
	for (let i = 0; i < set.length; i++) {
		const interval = set[i]
		if (!Array.isArray(interval) || interval.length !== 2) {
			throw new TypeError(`${name}[${i}] must be a 2-element [lo, hi] array`)
		}

		const lo = interval[0]
		const hi = interval[1]
		if (typeof lo !== 'number' || typeof hi !== 'number') {
			throw new TypeError(`${name}[${i}] endpoints must be numbers`)
		}
		if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
			throw new RangeError(`${name}[${i}] endpoints must be finite real numbers`)
		}
		if (lo > hi) {
			throw new RangeError(`${name}[${i}] has lo (${lo}) > hi (${hi})`)
		}

		sanitized[i] = [lo === 0 ? 0 : lo, hi === 0 ? 0 : hi]
	}

	return sanitized
}

/**
 * Compares two intervals lexicographically by `(lo, hi)` without subtraction
 * overflow.
 *
 * @param {[number, number]} a
 * @param {[number, number]} b
 * @returns {-1 | 0 | 1}
 */
function compareIntervals(a, b) {
	if (a[0] < b[0]) return -1
	if (a[0] > b[0]) return 1
	if (a[1] < b[1]) return -1
	if (a[1] > b[1]) return 1
	return 0
}

/**
 * Sorts an interval array in ascending `(lo, hi)` order using recursive
 * merge sort.
 *
 * @param {Array<[number, number]>} intervals
 * @param {number} start
 * @param {number} end
 * @returns {Array<[number, number]>}
 */
function mergeSortIntervals(intervals, start, end) {
	const len = end - start
	if (len <= 0) return []
	if (len === 1) return [intervals[start]]

	const mid = start + (len >>> 1)
	const left = mergeSortIntervals(intervals, start, mid)
	const right = mergeSortIntervals(intervals, mid, end)

	const merged = new Array(left.length + right.length)
	let i = 0
	let j = 0
	let k = 0
	while (i < left.length && j < right.length) {
		if (compareIntervals(left[i], right[j]) <= 0) {
			merged[k++] = left[i++]
		} else {
			merged[k++] = right[j++]
		}
	}
	while (i < left.length) merged[k++] = left[i++]
	while (j < right.length) merged[k++] = right[j++]
	return merged
}

/**
 * Recursively merges a sorted slice of intervals into strictly disjoint,
 * non-touching intervals via divide-and-conquer.
 *
 * @param {Array<[number, number]>} sorted
 * @param {number} start
 * @param {number} end
 * @returns {Array<[number, number]>}
 */
function mergeSortedRecursive(sorted, start, end) {
	const len = end - start
	if (len <= 0) return []
	if (len === 1) return [[sorted[start][0], sorted[start][1]]]

	const mid = start + (len >>> 1)
	const left = mergeSortedRecursive(sorted, start, mid)
	const right = mergeSortedRecursive(sorted, mid, end)

	// Because all intervals in `left` start <= all intervals in `right`, only
	// the last interval of `left` can overlap or touch a prefix of `right`.
	const lastLeft = left[left.length - 1]
	let r = 0
	while (r < right.length && right[r][0] <= lastLeft[1]) {
		if (right[r][1] > lastLeft[1]) {
			lastLeft[1] = right[r][1]
		}
		r++
	}
	for (let k = r; k < right.length; k++) {
		left.push(right[k])
	}
	return left
}

/**
 * Normalizes an interval set (sorts and merges overlapping/touching intervals)
 * recursively.
 *
 * @param {Array<[number, number]>} intervals
 * @returns {Array<[number, number]>}
 */
function normalizeIntervalsRecursive(intervals) {
	const sorted = mergeSortIntervals(intervals, 0, intervals.length)
	return mergeSortedRecursive(sorted, 0, sorted.length)
}

/**
 * Recursive binary search returning the smallest index `idx` in `[lo, hi]`
 * such that `idx === hi || intervals[idx][1] >= target`.
 *
 * @param {Array<[number, number]>} intervals - Normalized (strictly disjoint, sorted) intervals.
 * @param {number} lo
 * @param {number} hi
 * @param {number} target
 * @returns {number}
 */
function findFirstEndingAtOrAfter(intervals, lo, hi, target) {
	if (lo >= hi) return lo
	const mid = lo + ((hi - lo) >>> 1)
	if (intervals[mid][1] < target) {
		return findFirstEndingAtOrAfter(intervals, mid + 1, hi, target)
	}
	return findFirstEndingAtOrAfter(intervals, lo, mid, target)
}

/**
 * Recursive binary search returning the smallest index `idx` in `[lo, hi]`
 * such that `idx === hi || intervals[idx][0] > target`.
 *
 * @param {Array<[number, number]>} intervals - Normalized (strictly disjoint, sorted) intervals.
 * @param {number} lo
 * @param {number} hi
 * @param {number} target
 * @returns {number}
 */
function findFirstStartingAfter(intervals, lo, hi, target) {
	if (lo >= hi) return lo
	const mid = lo + ((hi - lo) >>> 1)
	if (intervals[mid][0] <= target) {
		return findFirstStartingAfter(intervals, mid + 1, hi, target)
	}
	return findFirstStartingAfter(intervals, lo, mid, target)
}

/**
 * Recursively collects the intersections of a single pivot interval `[pLo, pHi]`
 * with every interval in the guaranteed-overlapping slice `intervals[lo..hi)`.
 *
 * @param {number} pLo
 * @param {number} pHi
 * @param {Array<[number, number]>} intervals
 * @param {number} lo
 * @param {number} hi
 * @param {Array<[number, number]>} out
 */
function collectPivotIntersections(pLo, pHi, intervals, lo, hi, out) {
	if (lo >= hi) return
	if (hi - lo === 1) {
		const iv = intervals[lo]
		const start = pLo > iv[0] ? pLo : iv[0]
		const end = pHi < iv[1] ? pHi : iv[1]
		out.push([start, end])
		return
	}
	const mid = lo + ((hi - lo) >>> 1)
	collectPivotIntersections(pLo, pHi, intervals, lo, mid, out)
	collectPivotIntersections(pLo, pHi, intervals, mid, hi, out)
}

/**
 * Divide-and-conquer intersection over two normalized (sorted, strictly
 * disjoint) interval slices `A[aLo..aHi)` and `B[bLo..bHi)`.
 *
 * Always splits the larger slice at its midpoint so recursion depth is
 * `O(log(|A|) + log(|B|))`. Because both inputs are strictly disjoint, an
 * in-order traversal (left subproblem, pivot intersections, right subproblem)
 * emits results directly in sorted, strictly disjoint order.
 *
 * @param {Array<[number, number]>} A
 * @param {number} aLo
 * @param {number} aHi
 * @param {Array<[number, number]>} B
 * @param {number} bLo
 * @param {number} bHi
 * @param {Array<[number, number]>} out
 */
function intersectDivideAndConquer(A, aLo, aHi, B, bLo, bHi, out) {
	if (aLo >= aHi || bLo >= bHi) return

	// Bounding-box pruning: disjoint subranges have empty intersection.
	if (A[aHi - 1][1] < B[bLo][0] || B[bHi - 1][1] < A[aLo][0]) return

	// Always bisect the larger slice for logarithmic stack depth.
	if (bHi - bLo > aHi - aLo) {
		intersectDivideAndConquer(B, bLo, bHi, A, aLo, aHi, out)
		return
	}

	const mid = aLo + ((aHi - aLo) >>> 1)
	const [pLo, pHi] = A[mid]

	// Partition B around pivot [pLo, pHi]:
	//   B[bLo..first)   have hi < pLo (strictly left of pivot)
	//   B[first..last)  intersect [pLo, pHi]
	//   B[last..bHi)    have lo > pHi (strictly right of pivot)
	const first = findFirstEndingAtOrAfter(B, bLo, bHi, pLo)
	const last = findFirstStartingAfter(B, first, bHi, pHi)

	// At most one interval (B[first]) can straddle pLo into A[aLo..mid).
	const leftBHi = first < bHi && B[first][0] < pLo ? first + 1 : first
	// At most one interval (B[last - 1]) can straddle pHi into A[mid + 1..aHi).
	const rightBLo = last > first && B[last - 1][1] > pHi ? last - 1 : last

	// 1. Left subproblem: all results lie strictly below pLo.
	intersectDivideAndConquer(A, aLo, mid, B, bLo, leftBHi, out)

	// 2. Pivot intersections: all results lie within [pLo, pHi].
	collectPivotIntersections(pLo, pHi, B, first, last, out)

	// 3. Right subproblem: all results lie strictly above pHi.
	intersectDivideAndConquer(A, mid + 1, aHi, B, rightBLo, bHi, out)
}
