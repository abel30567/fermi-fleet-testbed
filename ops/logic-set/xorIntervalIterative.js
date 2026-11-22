/**
 * Compare two real numbers (including ±Infinity) in ascending order.
 * Avoids subtraction overflow and Infinity - Infinity === NaN.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function compareNumbers(a, b) {
	return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Validate and normalize an array of real intervals `[lo, hi]` into a new array
 * of sorted, strictly disjoint, non-touching intervals.
 *
 * @param {unknown} intervals - Candidate array of `[lo, hi]` interval tuples.
 * @param {string} name - Parameter name for error diagnostics.
 * @returns {Array<[number, number]>} Normalized intervals with `lo_i <= hi_i < lo_{i+1}`.
 * @throws {TypeError} If `intervals` is not an array, an element is not an array,
 *   or an endpoint is not a number.
 * @throws {RangeError} If an interval does not have length 2, has a `NaN` endpoint,
 *   has `lo > hi`, or is an invalid infinite singleton (`[Infinity, Infinity]` or `[-Infinity, -Infinity]`).
 */
function normalizeIntervals(intervals, name) {
	if (!Array.isArray(intervals)) {
		throw new TypeError(`${name} must be an array of [lo, hi] intervals`);
	}

	const copy = new Array(intervals.length);
	for (let i = 0; i < intervals.length; i++) {
		const interval = intervals[i];
		if (!Array.isArray(interval)) {
			throw new TypeError(`${name}[${i}] must be a [lo, hi] array`);
		}
		if (interval.length !== 2) {
			throw new RangeError(`${name}[${i}] must have length 2`);
		}

		const rawLo = interval[0];
		const rawHi = interval[1];
		if (typeof rawLo !== 'number' || typeof rawHi !== 'number') {
			throw new TypeError(`${name}[${i}] endpoints must be numbers`);
		}
		if (Number.isNaN(rawLo) || Number.isNaN(rawHi)) {
			throw new RangeError(`${name}[${i}] endpoints must not be NaN`);
		}
		if (rawLo > rawHi) {
			throw new RangeError(`${name}[${i}] lower bound (${rawLo}) must be <= upper bound (${rawHi})`);
		}
		if (rawLo === Infinity || rawHi === -Infinity) {
			throw new RangeError(`${name}[${i}] cannot represent a degenerate infinite endpoint`);
		}

		// Canonicalize -0 to 0 to keep output deterministic.
		const lo = rawLo === 0 ? 0 : rawLo;
		const hi = rawHi === 0 ? 0 : rawHi;
		copy[i] = [lo, hi];
	}

	if (copy.length === 0) {
		return [];
	}

	copy.sort((a, b) => compareNumbers(a[0], b[0]) || compareNumbers(a[1], b[1]));

	const merged = [copy[0]];
	for (let i = 1; i < copy.length; i++) {
		const current = copy[i];
		const last = merged[merged.length - 1];
		if (current[0] <= last[1]) {
			if (current[1] > last[1]) {
				last[1] = current[1];
			}
		} else {
			merged.push(current);
		}
	}

	return merged;
}

/**
 * Compute the logical XOR (symmetric difference `(A \ B) ∪ (B \ A)`) over two
 * sets of closed real intervals `[lo, hi]`, returning a normalized and merged
 * array of disjoint intervals sorted in ascending order.
 *
 * Uses an iterative sweep-line endpoint partition:
 * 1. Validates, sorts, and merges each input set independently without mutating inputs.
 * 2. Partitions the real line at all distinct endpoints from both normalized sets.
 * 3. Sweeps monotonically across isolated degenerate points `[x, x]` and elementary
 *    subintervals `[p_i, p_{i+1}]`, keeping elements present in exactly one set and
 *    merging adjacent retained subintervals in place.
 *
 * Supports finite and infinite bounds (`-Infinity` lower bound, `+Infinity` upper bound).
 *
 * @param {Array<[number, number]>} setA - First set of real intervals `[lo, hi]`.
 * @param {Array<[number, number]>} setB - Second set of real intervals `[lo, hi]`.
 * @returns {Array<[number, number]>} Sorted, disjoint, merged intervals representing `setA Δ setB`.
 * @throws {TypeError} If either argument is not an array of `[lo, hi]` numeric tuples.
 * @throws {RangeError} If any interval has invalid length, `NaN` endpoints, `lo > hi`,
 *   or an invalid infinite singleton endpoint.
 */
export function xorIntervalIterative(setA, setB) {
	const normA = normalizeIntervals(setA, 'setA');
	const normB = normalizeIntervals(setB, 'setB');

	if (normA.length === 0 && normB.length === 0) {
		return [];
	}

	const rawPts = [];
	for (let i = 0; i < normA.length; i++) {
		rawPts.push(normA[i][0], normA[i][1]);
	}
	for (let i = 0; i < normB.length; i++) {
		rawPts.push(normB[i][0], normB[i][1]);
	}

	rawPts.sort(compareNumbers);

	const pts = [];
	for (let i = 0; i < rawPts.length; i++) {
		if (i === 0 || rawPts[i] !== rawPts[i - 1]) {
			pts.push(rawPts[i]);
		}
	}

	const result = [];
	let ia = 0;
	let ib = 0;

	for (let i = 0; i < pts.length; i++) {
		const p = pts[i];

		while (ia < normA.length && normA[ia][1] < p) {
			ia++;
		}
		while (ib < normB.length && normB[ib][1] < p) {
			ib++;
		}

		const pointInA = ia < normA.length && normA[ia][0] <= p;
		const pointInB = ib < normB.length && normB[ib][0] <= p;
		const isDegenerateA = pointInA && normA[ia][0] === p && normA[ia][1] === p;
		const isDegenerateB = pointInB && normB[ib][0] === p && normB[ib][1] === p;

		if ((isDegenerateA && !pointInB) || (isDegenerateB && !pointInA)) {
			result.push([p, p]);
		}

		if (i + 1 < pts.length) {
			const left = p;
			const right = pts[i + 1];

			while (ia < normA.length && normA[ia][1] <= left) {
				ia++;
			}
			while (ib < normB.length && normB[ib][1] <= left) {
				ib++;
			}

			const segInA = ia < normA.length && normA[ia][0] <= left && normA[ia][1] >= right;
			const segInB = ib < normB.length && normB[ib][0] <= left && normB[ib][1] >= right;

			if (segInA !== segInB) {
				if (result.length > 0 && result[result.length - 1][1] === left) {
					result[result.length - 1][1] = right;
				} else {
					result.push([left, right]);
				}
			}
		}
	}

	return result;
}
