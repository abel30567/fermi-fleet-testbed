/**
 * Validates and normalizes an array of closed real intervals `[lo, hi]`,
 * appending freshly allocated copies into `target`.
 *
 * @param {unknown} set - Candidate interval set.
 * @param {string} paramName - Parameter name for descriptive error messages.
 * @param {Array<[number, number]>} target - Destination array for validated intervals.
 * @throws {TypeError} If `set` is not an array, an element is not an array, or an endpoint is not a number.
 * @throws {RangeError} If an interval does not have length 2, has a `NaN` endpoint, or has `lo > hi`.
 */
function collectIntervals(set, paramName, target) {
	if (!Array.isArray(set)) {
		throw new TypeError(`${paramName} must be an array of [lo, hi] intervals`)
	}

	for (let i = 0; i < set.length; i += 1) {
		const interval = set[i]
		if (!Array.isArray(interval)) {
			throw new TypeError(`${paramName}[${i}] must be a [lo, hi] array`)
		}
		if (interval.length !== 2) {
			throw new RangeError(`${paramName}[${i}] must have exactly 2 elements [lo, hi]`)
		}

		const lo = interval[0]
		const hi = interval[1]
		if (typeof lo !== 'number' || typeof hi !== 'number') {
			throw new TypeError(`${paramName}[${i}] endpoints must be numbers`)
		}
		if (Number.isNaN(lo) || Number.isNaN(hi)) {
			throw new RangeError(`${paramName}[${i}] endpoints must not be NaN`)
		}
		if (lo > hi) {
			throw new RangeError(`${paramName}[${i}] must satisfy lo <= hi (got [${lo}, ${hi}])`)
		}

		target.push([lo === 0 ? 0 : lo, hi === 0 ? 0 : hi])
	}
}

/**
 * Total-order comparator for closed intervals `[lo, hi]` that safely handles
 * `-Infinity`, `Infinity`, and extreme finite values without subtraction overflow.
 *
 * @param {[number, number]} a
 * @param {[number, number]} b
 * @returns {number}
 */
function compareIntervals(a, b) {
	if (a[0] < b[0]) return -1
	if (a[0] > b[0]) return 1
	if (a[1] < b[1]) return -1
	if (a[1] > b[1]) return 1
	return 0
}

/**
 * Computes the logical OR (set union) of two sets of closed real intervals `[lo, hi]`,
 * returning a normalized array of sorted, disjoint, non-touching closed intervals.
 *
 * Supports finite values, `-Infinity`/`Infinity` bounds, and point intervals `[x, x]`.
 * Input arrays and their interval tuples are never mutated.
 *
 * @param {Array<[number, number]>} setA - First set of closed intervals `[lo, hi]`.
 * @param {Array<[number, number]>} setB - Second set of closed intervals `[lo, hi]`.
 * @returns {Array<[number, number]>} Normalized sorted union of `setA` and `setB`.
 * @throws {TypeError} If either argument is not an array of numeric `[lo, hi]` tuples.
 * @throws {RangeError} If any tuple does not have length 2, contains `NaN`, or has `lo > hi`.
 */
export function orIntervalIterative(setA, setB) {
	const combined = []
	collectIntervals(setA, 'setA', combined)
	collectIntervals(setB, 'setB', combined)

	if (combined.length === 0) {
		return []
	}

	combined.sort(compareIntervals)

	const merged = [[combined[0][0], combined[0][1]]]
	for (let i = 1; i < combined.length; i += 1) {
		const [lo, hi] = combined[i]
		const current = merged[merged.length - 1]
		if (lo <= current[1]) {
			if (hi > current[1]) {
				current[1] = hi
			}
		} else {
			merged.push([lo, hi])
		}
	}

	return merged
}
