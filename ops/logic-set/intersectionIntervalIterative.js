/**
 * Validates that a value is an array of closed real intervals `[lo, hi]`.
 *
 * @param {unknown} set - Candidate interval set.
 * @param {number} setIndex - Argument index for diagnostic error messages.
 * @throws {TypeError} If the set or any interval is not an array of two numbers.
 * @throws {RangeError} If any endpoint is `NaN` or if `lo > hi`.
 */
function validateIntervalSet(set, setIndex) {
	if (!Array.isArray(set)) {
		throw new TypeError(
			`Interval set at argument index ${setIndex} must be an array of [lo, hi] intervals.`
		)
	}

	for (let i = 0; i < set.length; i += 1) {
		const interval = set[i]
		if (!Array.isArray(interval) || interval.length !== 2) {
			throw new TypeError(
				`Interval at set ${setIndex}, index ${i} must be a [lo, hi] tuple of length 2.`
			)
		}

		const [lo, hi] = interval
		if (typeof lo !== 'number' || typeof hi !== 'number') {
			throw new TypeError(
				`Interval endpoints at set ${setIndex}, index ${i} must be numbers.`
			)
		}
		if (Number.isNaN(lo) || Number.isNaN(hi)) {
			throw new RangeError(
				`Interval endpoints at set ${setIndex}, index ${i} must not be NaN.`
			)
		}
		if (lo > hi) {
			throw new RangeError(
				`Invalid interval [${lo}, ${hi}] at set ${setIndex}, index ${i}: lo must be <= hi.`
			)
		}
	}
}

/**
 * Normalizes a validated set of closed real intervals `[lo, hi]` into a sorted
 * list of disjoint, non-touching closed intervals without mutating the input.
 *
 * @param {Array<[number, number]>} set - Validated array of `[lo, hi]` intervals.
 * @returns {Array<[number, number]>} Normalized sorted and merged intervals.
 */
function normalizeIntervalSet(set) {
	if (set.length === 0) {
		return []
	}

	const sorted = new Array(set.length)
	for (let i = 0; i < set.length; i += 1) {
		const lo = set[i][0] === 0 ? 0 : set[i][0]
		const hi = set[i][1] === 0 ? 0 : set[i][1]
		sorted[i] = [lo, hi]
	}

	sorted.sort((a, b) => {
		if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1
		if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1
		return 0
	})

	const merged = [sorted[0]]
	for (let i = 1; i < sorted.length; i += 1) {
		const current = merged[merged.length - 1]
		const [nextLo, nextHi] = sorted[i]
		if (nextLo <= current[1]) {
			if (nextHi > current[1]) {
				current[1] = nextHi
			}
		} else {
			merged.push([nextLo, nextHi])
		}
	}

	return merged
}

/**
 * Computes the intersection of two already normalized sets of closed intervals
 * using an iterative two-pointer scan.
 *
 * Because both inputs are sorted, disjoint, and non-touching, the returned
 * array is guaranteed to be normalized as well.
 *
 * @param {Array<[number, number]>} a - First normalized interval set.
 * @param {Array<[number, number]>} b - Second normalized interval set.
 * @returns {Array<[number, number]>} Normalized intersection of `a` and `b`.
 */
function intersectTwoNormalized(a, b) {
	const result = []
	let i = 0
	let j = 0

	while (i < a.length && j < b.length) {
		const [aLo, aHi] = a[i]
		const [bLo, bHi] = b[j]

		const lo = aLo > bLo ? aLo : bLo
		const hi = aHi < bHi ? aHi : bHi

		if (lo <= hi) {
			result.push([lo, hi])
		}

		if (aHi < bHi) {
			i += 1
		} else if (bHi < aHi) {
			j += 1
		} else {
			i += 1
			j += 1
		}
	}

	return result
}

/**
 * Computes the set intersection over two or more sets of closed real intervals
 * `[lo, hi]`, returning a normalized (sorted, merged, disjoint, non-touching)
 * array of closed intervals using an iterative two-pointer algorithm.
 *
 * Touching closed intervals `[a, b]` and `[b, c]` intersect at the degenerate
 * point interval `[b, b]`. Infinite bounds (`-Infinity`, `Infinity`) are
 * supported. Input sets and interval tuples are never mutated.
 *
 * @param {...Array<[number, number]>} intervalSets - Two or more sets of closed
 *   real intervals `[lo, hi]` with `lo <= hi`.
 * @returns {Array<[number, number]>} Normalized intersection of all input sets.
 * @throws {RangeError} If fewer than 2 interval sets are provided, if any
 *   endpoint is `NaN`, or if any interval has `lo > hi`.
 * @throws {TypeError} If any argument is not an array of `[lo, hi]` number pairs.
 */
export function intersectionIntervalIterative(...intervalSets) {
	if (intervalSets.length < 2) {
		throw new RangeError(
			'intersectionIntervalIterative requires at least 2 interval sets.'
		)
	}

	for (let s = 0; s < intervalSets.length; s += 1) {
		validateIntervalSet(intervalSets[s], s)
	}

	let acc = normalizeIntervalSet(intervalSets[0])
	for (let s = 1; s < intervalSets.length; s += 1) {
		if (acc.length === 0) {
			break
		}
		const next = normalizeIntervalSet(intervalSets[s])
		acc = intersectTwoNormalized(acc, next)
	}

	return acc
}
