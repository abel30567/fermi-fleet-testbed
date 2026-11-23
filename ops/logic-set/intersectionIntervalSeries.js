/**
 * Normalizes `-0` to `+0` so canonical interval bounds avoid signed-zero quirks.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Validates a set of closed real intervals `[lo, hi]` and returns its canonical
 * normalized form: sorted in strictly ascending order with overlapping and
 * touching intervals merged into pairwise-disjoint closed intervals.
 *
 * @param {unknown} intervalSet
 * @param {number} argIndex - Zero-based argument index for error messages.
 * @returns {Array<[number, number]>}
 */
function validateAndNormalizeSet(intervalSet, argIndex) {
	if (!Array.isArray(intervalSet)) {
		throw new TypeError(
			`Argument ${argIndex} must be an array of [lo, hi] intervals`,
		)
	}

	const validated = new Array(intervalSet.length)
	for (let i = 0; i < intervalSet.length; i++) {
		const interval = intervalSet[i]
		if (!Array.isArray(interval) || interval.length !== 2) {
			throw new TypeError(
				`Interval at argument ${argIndex}, index ${i} must be a [lo, hi] pair`,
			)
		}

		const [rawLo, rawHi] = interval
		if (typeof rawLo !== 'number' || typeof rawHi !== 'number') {
			throw new TypeError(
				`Interval bounds at argument ${argIndex}, index ${i} must be numbers`,
			)
		}
		if (!Number.isFinite(rawLo) || !Number.isFinite(rawHi)) {
			throw new RangeError(
				`Interval bounds at argument ${argIndex}, index ${i} must be finite real numbers`,
			)
		}
		if (rawLo > rawHi) {
			throw new RangeError(
				`Interval lower bound (${rawLo}) must not exceed upper bound (${rawHi}) at argument ${argIndex}, index ${i}`,
			)
		}

		validated[i] = [normalizeZero(rawLo), normalizeZero(rawHi)]
	}

	if (validated.length <= 1) {
		return validated
	}

	validated.sort((a, b) => {
		if (a[0] < b[0]) return -1
		if (a[0] > b[0]) return 1
		if (a[1] < b[1]) return -1
		if (a[1] > b[1]) return 1
		return 0
	})

	const merged = [validated[0]]
	for (let i = 1; i < validated.length; i++) {
		const prev = merged[merged.length - 1]
		const [lo, hi] = validated[i]
		if (lo <= prev[1]) {
			if (hi > prev[1]) {
				prev[1] = hi
			}
		} else {
			merged.push([lo, hi])
		}
	}

	return merged
}

/**
 * Computes the set intersection over two or more sets of closed real intervals
 * `[lo, hi]`, returning a normalized and merged array of pairwise-disjoint
 * closed intervals sorted in ascending order.
 *
 * Each input set `S_r` is first reduced to its canonical disjoint representation
 * `S_r = ⋃_i [l_{r,i}, u_{r,i}]`, whose indicator function admits the exact
 * finite Heaviside step series:
 *
 *   1_{S_r}(x) = ∑_i ( H_+(x - l_{r,i}) - H_-(x - u_{r,i}) )
 *
 * where `H_+(t) = 1` for `t >= 0` and `H_-(t) = 1` for `t > 0`.
 * By the indicator-product identity over `k` normalized sets,
 *
 *   1_{⋂_{r=1}^k S_r}(x) = ∏_{r=1}^k 1_{S_r}(x) = 1( ∑_{r=1}^k 1_{S_r}(x) = k ).
 *
 * Evaluating the cumulative sum of the combined step-jump series (ordering `+1`
 * left-closed entries before `-1` right-closed exits at coinciding coordinates)
 * yields the exact closed-form intersection, preserving degenerate point
 * intervals `[p, p]` and guaranteeing sorted, disjoint, merged output in
 * O(N log N) time without mutating any inputs.
 *
 * @param {Array<[number, number]>} firstSet - First set of closed real intervals `[lo, hi]`.
 * @param {Array<[number, number]>} secondSet - Second set of closed real intervals `[lo, hi]`.
 * @param {...Array<[number, number]>} otherSets - Optional additional interval sets to intersect.
 * @returns {Array<[number, number]>} Normalized, sorted, disjoint closed intervals in the intersection.
 * @throws {TypeError} If fewer than two sets are provided, any set is not an array,
 *   any interval is not a 2-element array, or any endpoint is not a number.
 * @throws {RangeError} If any endpoint is non-finite (`NaN`, `±Infinity`) or `lo > hi`.
 *
 * @example
 * intersectionIntervalSeries([[1, 5], [7, 10]], [[3, 8]])
 * // => [[3, 5], [7, 8]]
 *
 * @example
 * intersectionIntervalSeries([[1, 3]], [[3, 5]])
 * // => [[3, 3]]
 */
export function intersectionIntervalSeries(firstSet, secondSet, ...otherSets) {
	if (arguments.length < 2) {
		throw new TypeError(
			'intersectionIntervalSeries requires at least two interval sets',
		)
	}

	const rawSets = [firstSet, secondSet, ...otherSets]
	const setCount = rawSets.length
	const normalizedSets = new Array(setCount)
	let hasEmpty = false

	for (let r = 0; r < setCount; r++) {
		const normalized = validateAndNormalizeSet(rawSets[r], r)
		normalizedSets[r] = normalized
		if (normalized.length === 0) {
			hasEmpty = true
		}
	}

	if (hasEmpty) {
		return []
	}

	/** @type {Array<[number, 1 | -1]>} */
	const stepSeries = []
	for (let r = 0; r < setCount; r++) {
		const intervals = normalizedSets[r]
		for (let i = 0; i < intervals.length; i++) {
			const [lo, hi] = intervals[i]
			stepSeries.push([lo, 1], [hi, -1])
		}
	}

	// Sort by coordinate ascending; at identical coordinates, process +1 (closed
	// left entry) before -1 (closed right exit) so boundary touches and point
	// intervals [p, p] reach depth === setCount before exiting.
	stepSeries.sort((a, b) => {
		if (a[0] < b[0]) return -1
		if (a[0] > b[0]) return 1
		return b[1] - a[1]
	})

	/** @type {Array<[number, number]>} */
	const result = []
	let depth = 0
	let activeStart = 0

	for (let i = 0; i < stepSeries.length; i++) {
		const [x, delta] = stepSeries[i]
		if (delta === 1) {
			depth += 1
			if (depth === setCount) {
				activeStart = x
			}
		} else {
			if (depth === setCount) {
				result.push([activeStart, x])
			}
			depth -= 1
		}
	}

	return result
}
