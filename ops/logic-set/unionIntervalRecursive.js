/**
 * Normalize a numeric endpoint so `-0` becomes `+0`.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value;
}

/**
 * Validate a single real interval `[lo, hi]` and return a normalized copy.
 *
 * @param {unknown} interval - Candidate `[lo, hi]` tuple.
 * @param {number} setIndex - Index of the containing set (for diagnostics).
 * @param {number} intervalIndex - Index of the interval within the set.
 * @returns {[number, number]} A validated, normalized `[lo, hi]` copy.
 * @throws {TypeError} If `interval` is not a 2-element array of numbers.
 * @throws {RangeError} If either endpoint is `NaN`, if `lo > hi`, or if the
 *   interval is a degenerate infinite point (`[-Infinity, -Infinity]` or
 *   `[Infinity, Infinity]`).
 */
function validateInterval(interval, setIndex, intervalIndex) {
	if (!Array.isArray(interval) || interval.length !== 2) {
		throw new TypeError(
			`Invalid interval at set ${setIndex}, index ${intervalIndex}: expected a [lo, hi] array of length 2.`,
		);
	}

	const lo = interval[0];
	const hi = interval[1];

	if (typeof lo !== 'number' || typeof hi !== 'number') {
		throw new TypeError(
			`Invalid interval endpoints at set ${setIndex}, index ${intervalIndex}: lo and hi must be numbers.`,
		);
	}

	if (Number.isNaN(lo) || Number.isNaN(hi)) {
		throw new RangeError(
			`Invalid interval endpoints at set ${setIndex}, index ${intervalIndex}: endpoints must not be NaN.`,
		);
	}

	if (lo > hi) {
		throw new RangeError(
			`Invalid interval at set ${setIndex}, index ${intervalIndex}: lo (${lo}) must be <= hi (${hi}).`,
		);
	}

	if (lo === Infinity || hi === -Infinity) {
		throw new RangeError(
			`Invalid interval at set ${setIndex}, index ${intervalIndex}: degenerate infinite interval [${lo}, ${hi}] is not a real interval.`,
		);
	}

	return [normalizeZero(lo), normalizeZero(hi)];
}

/**
 * Validate an array of real intervals and return freshly copied `[lo, hi]` pairs.
 *
 * @param {unknown} set - Candidate array of intervals.
 * @param {number} setIndex - Position of the set argument.
 * @returns {Array<[number, number]>}
 * @throws {TypeError} If `set` is not an array or contains invalid interval shapes/types.
 * @throws {RangeError} If any interval has invalid numeric bounds.
 */
function validateIntervalSet(set, setIndex) {
	if (!Array.isArray(set)) {
		throw new TypeError(
			`Invalid interval set at argument ${setIndex}: expected an array of [lo, hi] intervals.`,
		);
	}

	const validated = new Array(set.length);
	for (let i = 0; i < set.length; i++) {
		validated[i] = validateInterval(set[i], setIndex, i);
	}
	return validated;
}

/**
 * Append an interval to a normalized (sorted, disjoint, non-touching) list,
 * merging with the tail if it overlaps or touches.
 *
 * @param {Array<[number, number]>} result
 * @param {[number, number]} interval
 */
function appendOrMerge(result, interval) {
	const len = result.length;
	if (len === 0) {
		result.push([interval[0], interval[1]]);
		return;
	}

	const last = result[len - 1];
	if (interval[0] <= last[1]) {
		if (interval[1] > last[1]) {
			last[1] = interval[1];
		}
	} else {
		result.push([interval[0], interval[1]]);
	}
}

/**
 * Merge two already-normalized (sorted, disjoint, non-touching) interval lists
 * into a single normalized interval list in O(|left| + |right|) time.
 *
 * @param {Array<[number, number]>} left
 * @param {Array<[number, number]>} right
 * @returns {Array<[number, number]>}
 */
function mergeNormalized(left, right) {
	if (left.length === 0) {
		return right.map(([lo, hi]) => [lo, hi]);
	}
	if (right.length === 0) {
		return left.map(([lo, hi]) => [lo, hi]);
	}

	const result = [];
	let i = 0;
	let j = 0;

	while (i < left.length && j < right.length) {
		const a = left[i];
		const b = right[j];
		if (a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1])) {
			appendOrMerge(result, a);
			i++;
		} else {
			appendOrMerge(result, b);
			j++;
		}
	}

	while (i < left.length) {
		appendOrMerge(result, left[i]);
		i++;
	}

	while (j < right.length) {
		appendOrMerge(result, right[j]);
		j++;
	}

	return result;
}

/**
 * Recursively normalize and merge a slice of validated intervals using
 * divide-and-conquer (O(n log n) time, O(log n) recursion depth).
 *
 * @param {Array<[number, number]>} intervals
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @returns {Array<[number, number]>}
 */
function normalizeIntervalsRecursive(intervals, start, end) {
	const count = end - start;
	if (count <= 0) {
		return [];
	}
	if (count === 1) {
		const [lo, hi] = intervals[start];
		return [[lo, hi]];
	}

	const mid = start + (count >>> 1);
	const left = normalizeIntervalsRecursive(intervals, start, mid);
	const right = normalizeIntervalsRecursive(intervals, mid, end);
	return mergeNormalized(left, right);
}

/**
 * Recursively union a slice of already-normalized interval sets using
 * divide-and-conquer (O(N log k) time, O(log k) recursion depth).
 *
 * @param {Array<Array<[number, number]>>} normalizedSets
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @returns {Array<[number, number]>}
 */
function unionSetsRecursive(normalizedSets, start, end) {
	const count = end - start;
	if (count <= 0) {
		return [];
	}
	if (count === 1) {
		return normalizedSets[start].map(([lo, hi]) => [lo, hi]);
	}

	const mid = start + (count >>> 1);
	const left = unionSetsRecursive(normalizedSets, start, mid);
	const right = unionSetsRecursive(normalizedSets, mid, end);
	return mergeNormalized(left, right);
}

/**
 * Compute the set union over zero, one, or more sets of closed real intervals
 * `[lo, hi]`, returning a normalized (ascending, disjoint, non-touching) list
 * of merged intervals using a recursive divide-and-conquer algorithm.
 *
 * - Each input set is an array of `[lo, hi]` pairs where `lo <= hi`, neither
 *   endpoint is `NaN`, and degenerate infinite endpoints (`[-Infinity, -Infinity]`
 *   and `[Infinity, Infinity]`) are disallowed.
 * - Unbounded real intervals such as `[-Infinity, a]`, `[a, Infinity]`, and
 *   `[-Infinity, Infinity]` are supported.
 * - Overlapping and touching closed intervals (e.g. `[1, 3]` and `[3, 5]`)
 *   are coalesced into a single interval (`[1, 5]`).
 * - Negative zero (`-0`) endpoints are normalized to `0`.
 * - Inputs are never mutated and returned interval tuples are freshly allocated.
 *
 * @param {...Array<[number, number]>} sets - Zero or more arrays of real intervals `[lo, hi]`.
 * @returns {Array<[number, number]>} Normalized, merged union of all input interval sets.
 * @throws {TypeError} If any set is not an array, or any interval is not a 2-element number array.
 * @throws {RangeError} If any interval contains `NaN`, has `lo > hi`, or is a degenerate infinite interval.
 */
export function unionIntervalRecursive(...sets) {
	if (sets.length === 0) {
		return [];
	}

	// Validate all sets eagerly so malformed inputs never pass silently.
	const validatedSets = new Array(sets.length);
	for (let i = 0; i < sets.length; i++) {
		validatedSets[i] = validateIntervalSet(sets[i], i);
	}

	const normalizedSets = new Array(validatedSets.length);
	for (let i = 0; i < validatedSets.length; i++) {
		const validated = validatedSets[i];
		normalizedSets[i] = normalizeIntervalsRecursive(validated, 0, validated.length);
	}

	return unionSetsRecursive(normalizedSets, 0, normalizedSets.length);
}
