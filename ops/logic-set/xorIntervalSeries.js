/**
 * Logical XOR (symmetric difference `A △ B = (A \ B) ∪ (B \ A)`) over sets of
 * real intervals `[lo, hi]`, normalized and merged into sorted, strictly
 * disjoint, non-touching intervals.
 *
 * Mathematical formulation (Heaviside step-series / indicator identity):
 * Each normalized interval set `S = ⋃_k [lo_k, hi_k]` has indicator function
 *   `1_S(x) = ∑_k (H(x - lo_k) - H(x - hi_k))`
 * on non-boundary points. The symmetric difference satisfies
 *   `1_{A ⊕ B}(x) = |1_A(x) - 1_B(x)|`.
 * Sweeping across the sorted discontinuity endpoints evaluates `1_A(x)` and
 * `1_B(x)` exactly via running step deltas and extracts the maximal intervals
 * where `|1_A(x) - 1_B(x)| === 1`.
 */

/**
 * Compare two extended real numbers without arithmetic overflow or `NaN` from
 * `Infinity - Infinity`.
 *
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function compareNumbers(x, y) {
	return x < y ? -1 : x > y ? 1 : 0;
}

/**
 * Validate and normalize an array of real intervals into sorted, disjoint,
 * non-touching positive-length intervals `[lo, hi]` with `lo < hi`.
 * Degenerate zero-length intervals (`lo === hi`) have empty interior and are
 * omitted. Negative zero (`-0`) bounds are normalized to `0`.
 *
 * @param {Array<[number, number]>} intervals
 * @param {string} name
 * @returns {Array<[number, number]>}
 */
function normalizeIntervals(intervals, name) {
	if (!Array.isArray(intervals)) {
		throw new TypeError(`${name} must be an array of [lo, hi] interval pairs`);
	}

	/** @type {Array<[number, number]>} */
	const valid = [];

	for (let i = 0; i < intervals.length; i++) {
		const entry = intervals[i];
		if (!Array.isArray(entry) || entry.length !== 2) {
			throw new TypeError(
				`${name}[${i}] must be a 2-element [lo, hi] array`
			);
		}

		const rawLo = entry[0];
		const rawHi = entry[1];

		if (typeof rawLo !== 'number' || typeof rawHi !== 'number') {
			throw new TypeError(
				`${name}[${i}] bounds must be numbers`
			);
		}

		if (Number.isNaN(rawLo) || Number.isNaN(rawHi)) {
			throw new RangeError(
				`${name}[${i}] bounds must not be NaN`
			);
		}

		if (rawLo > rawHi) {
			throw new RangeError(
				`${name}[${i}] lower bound (${rawLo}) must not exceed upper bound (${rawHi})`
			);
		}

		if (rawLo === Infinity || rawHi === -Infinity) {
			throw new RangeError(
				`${name}[${i}] cannot be a degenerate interval at infinity`
			);
		}

		if (rawLo === rawHi) {
			continue;
		}

		const lo = rawLo === 0 ? 0 : rawLo;
		const hi = rawHi === 0 ? 0 : rawHi;
		valid.push([lo, hi]);
	}

	if (valid.length <= 1) {
		return valid;
	}

	valid.sort((u, v) => compareNumbers(u[0], v[0]) || compareNumbers(u[1], v[1]));

	/** @type {Array<[number, number]>} */
	const merged = [valid[0]];
	for (let i = 1; i < valid.length; i++) {
		const prev = merged[merged.length - 1];
		const [lo, hi] = valid[i];
		if (lo <= prev[1]) {
			if (hi > prev[1]) {
				prev[1] = hi;
			}
		} else {
			merged.push([lo, hi]);
		}
	}

	return merged;
}

/**
 * Computes the logical XOR (symmetric difference `A △ B = (A \ B) ∪ (B \ A)`)
 * of two sets of real intervals `[lo, hi]`, returning a normalized array of
 * sorted, strictly disjoint, non-touching intervals.
 *
 * Inputs may be unsorted, overlapping, touching, or empty, and may use
 * `-Infinity` / `Infinity` as infinite endpoints. Input arrays are not mutated.
 *
 * @param {Array<[number, number]>} a - First set of real intervals `[[lo, hi], ...]`.
 * @param {Array<[number, number]>} b - Second set of real intervals `[[lo, hi], ...]`.
 * @returns {Array<[number, number]>} Normalized symmetric difference intervals.
 * @throws {TypeError} If `a` or `b` is not an array, an element is not a 2-element array, or bounds are not numbers.
 * @throws {RangeError} If any bound is `NaN`, `lo > hi`, or an interval is degenerate at `±Infinity`.
 */
export function xorIntervalSeries(a, b) {
	const normA = normalizeIntervals(a, 'a');
	const normB = normalizeIntervals(b, 'b');

	if (normA.length === 0) {
		return normB.map(([lo, hi]) => [lo, hi]);
	}
	if (normB.length === 0) {
		return normA.map(([lo, hi]) => [lo, hi]);
	}

	/** @type {Array<{ x: number, dA: number, dB: number }>} */
	const events = new Array((normA.length + normB.length) * 2);
	let idx = 0;

	for (let i = 0; i < normA.length; i++) {
		const [lo, hi] = normA[i];
		events[idx++] = { x: lo, dA: 1, dB: 0 };
		events[idx++] = { x: hi, dA: -1, dB: 0 };
	}

	for (let i = 0; i < normB.length; i++) {
		const [lo, hi] = normB[i];
		events[idx++] = { x: lo, dA: 0, dB: 1 };
		events[idx++] = { x: hi, dA: 0, dB: -1 };
	}

	events.sort((u, v) => compareNumbers(u.x, v.x));

	/** @type {Array<[number, number]>} */
	const result = [];
	let inA = 0;
	let inB = 0;
	let active = 0;
	let start = 0;

	let i = 0;
	while (i < events.length) {
		const x = events[i].x;
		while (i < events.length && events[i].x === x) {
			inA += events[i].dA;
			inB += events[i].dB;
			i++;
		}

		// Indicator identity: 1_{A ⊕ B}(x) = |1_A(x) - 1_B(x)|
		const nextActive = Math.abs(inA - inB);

		if (active === 0 && nextActive === 1) {
			start = x;
		} else if (active === 1 && nextActive === 0) {
			result.push([start, x]);
		}

		active = nextActive;
	}

	return result;
}
