/**
 * Precomputed 2-bit truth table for logical XOR indexed by state `(inA << 1) | inB`.
 * - state 0 (`0b00`): outside A, outside B -> 0
 * - state 1 (`0b01`): outside A, inside B  -> 1
 * - state 2 (`0b10`): inside A,  outside B -> 1
 * - state 3 (`0b11`): inside A,  inside B  -> 0
 */
const XOR_TABLE = Object.freeze([0, 1, 1, 0]);

/**
 * Precomputed 4x4 state transition table indexed by `[state][toggleMask]`.
 * Bit 1 (`0b10`) toggles membership in A; bit 0 (`0b01`) toggles membership in B.
 */
const STATE_TRANSITION = Object.freeze([
	Object.freeze([0, 1, 2, 3]),
	Object.freeze([1, 0, 3, 2]),
	Object.freeze([2, 3, 0, 1]),
	Object.freeze([3, 2, 1, 0]),
]);

/**
 * Precomputed sweep-line boundary action table indexed by `(prevOut << 1) | nextOut`.
 * - 0 (`0b00`): remain outside
 * - 1 (`0b01`): open a new output interval
 * - 2 (`0b10`): close the current output interval
 * - 3 (`0b11`): remain inside (merges adjacent segments automatically)
 */
const ACTION_NOOP = 0;
const ACTION_OPEN = 1;
const ACTION_CLOSE = 2;
const ACTION_TABLE = Object.freeze([
	ACTION_NOOP,
	ACTION_OPEN,
	ACTION_CLOSE,
	ACTION_NOOP,
]);

const MAX_CACHE_SIZE = 1024;

/** @type {Map<string, ReadonlyArray<readonly [number, number]>>} */
const memoCache = new Map();

/**
 * Validate and normalize a set of real intervals `[lo, hi]`.
 *
 * Intervals are treated as half-open `[lo, hi)` (equivalently real intervals modulo
 * isolated boundary points): degenerate zero-length intervals `[x, x]` are dropped,
 * and overlapping or touching intervals (`nextLo <= currHi`) are merged.
 *
 * @param {unknown} intervals - Candidate array of `[lo, hi]` interval pairs.
 * @param {string} paramName - Parameter name for error messages.
 * @returns {Array<[number, number]>} Sorted, disjoint, non-touching intervals with `lo < hi`.
 */
function normalizeIntervals(intervals, paramName) {
	if (!Array.isArray(intervals)) {
		throw new TypeError(`${paramName} must be an array of [lo, hi] intervals`);
	}

	/** @type {Array<[number, number]>} */
	const valid = [];

	for (let i = 0; i < intervals.length; i++) {
		const iv = intervals[i];
		if (!Array.isArray(iv) || iv.length !== 2) {
			throw new TypeError(`${paramName}[${i}] must be a [lo, hi] 2-element array`);
		}
		const rawLo = iv[0];
		const rawHi = iv[1];
		if (typeof rawLo !== 'number' || typeof rawHi !== 'number') {
			throw new TypeError(`${paramName}[${i}] endpoints must be numbers`);
		}
		if (!Number.isFinite(rawLo) || !Number.isFinite(rawHi)) {
			throw new RangeError(`${paramName}[${i}] endpoints must be finite real numbers`);
		}
		if (rawLo > rawHi) {
			throw new RangeError(`${paramName}[${i}] must satisfy lo <= hi (got [${rawLo}, ${rawHi}])`);
		}
		if (rawLo === rawHi) {
			// Zero-length interval has empty interior; omit during normalization.
			continue;
		}
		// Normalize -0 to +0 for deterministic output and canonical cache keys.
		const lo = rawLo === 0 ? 0 : rawLo;
		const hi = rawHi === 0 ? 0 : rawHi;
		valid.push([lo, hi]);
	}

	if (valid.length <= 1) {
		return valid;
	}

	valid.sort((p, q) => (p[0] !== q[0] ? p[0] - q[0] : p[1] - q[1]));

	/** @type {Array<[number, number]>} */
	const merged = [valid[0]];
	for (let i = 1; i < valid.length; i++) {
		const prev = merged[merged.length - 1];
		const curr = valid[i];
		if (curr[0] <= prev[1]) {
			if (curr[1] > prev[1]) {
				prev[1] = curr[1];
			}
		} else {
			merged.push(curr);
		}
	}

	return merged;
}

/**
 * Serialize a normalized interval set into a lossless canonical key.
 *
 * @param {Array<[number, number]>} norm - Normalized interval array.
 * @returns {string} Canonical serialization.
 */
function serializeNormalized(norm) {
	if (norm.length === 0) {
		return '';
	}
	const parts = new Array(norm.length);
	for (let i = 0; i < norm.length; i++) {
		parts[i] = `${norm[i][0]},${norm[i][1]}`;
	}
	return parts.join(';');
}

/**
 * Clone a frozen interval list so callers cannot mutate cached state.
 *
 * @param {ReadonlyArray<readonly [number, number]>} intervals - Cached intervals.
 * @returns {Array<[number, number]>} Fresh mutable copy.
 */
function cloneIntervals(intervals) {
	const out = new Array(intervals.length);
	for (let i = 0; i < intervals.length; i++) {
		out[i] = [intervals[i][0], intervals[i][1]];
	}
	return out;
}

/**
 * Compute normalized XOR of two normalized interval sets via a table-driven
 * two-pointer sweep over their sorted endpoints.
 *
 * Because each normalized set has strictly increasing endpoints (`lo_0 < hi_0 < lo_1 < ...`),
 * scanning both endpoint streams simultaneously takes O(|a| + |b|) time without re-sorting.
 *
 * @param {Array<[number, number]>} normA - Normalized intervals for A.
 * @param {Array<[number, number]>} normB - Normalized intervals for B.
 * @returns {Array<[number, number]>} Normalized, merged symmetric difference.
 */
function sweepXorTableDriven(normA, normB) {
	const lenA = normA.length * 2;
	const lenB = normB.length * 2;
	let idxA = 0;
	let idxB = 0;

	let state = 0;
	let openStart = 0;
	/** @type {Array<[number, number]>} */
	const result = [];

	while (idxA < lenA || idxB < lenB) {
		const xA = idxA < lenA ? normA[idxA >> 1][idxA & 1] : Infinity;
		const xB = idxB < lenB ? normB[idxB >> 1][idxB & 1] : Infinity;

		let x;
		let toggleMask = 0;

		if (xA < xB) {
			x = xA;
			toggleMask = 2; // bit 1: A toggles
			idxA++;
		} else if (xB < xA) {
			x = xB;
			toggleMask = 1; // bit 0: B toggles
			idxB++;
		} else {
			x = xA;
			toggleMask = 3; // both A and B toggle at x
			idxA++;
			idxB++;
		}

		const prevOut = XOR_TABLE[state];
		state = STATE_TRANSITION[state][toggleMask];
		const nextOut = XOR_TABLE[state];

		const action = ACTION_TABLE[(prevOut << 1) | nextOut];
		if (action === ACTION_OPEN) {
			openStart = x;
		} else if (action === ACTION_CLOSE) {
			result.push([openStart, x]);
		}
	}

	return result;
}

/**
 * Compute the logical XOR (symmetric difference) of two sets of real intervals `[lo, hi]`,
 * returning a normalized and merged array of disjoint, non-touching `[lo, hi]` intervals.
 *
 * Uses precomputed state-transition and truth tables (`XOR_TABLE`, `STATE_TRANSITION`,
 * `ACTION_TABLE`) for an O(|a| + |b|) post-normalization sweep, combined with bounded
 * commutative LRU memoization over canonical normalized inputs.
 *
 * Intervals are interpreted modulo isolated boundary points (equivalently half-open
 * `[lo, hi)`): zero-length intervals `[x, x]` normalize to empty, and adjacent intervals
 * `[a, b]` and `[b, c]` merge into `[a, c]`. Input arrays are never mutated.
 *
 * @param {Array<[number, number]>} a - First set of real intervals `[lo, hi]` with `lo <= hi`.
 * @param {Array<[number, number]>} b - Second set of real intervals `[lo, hi]` with `lo <= hi`.
 * @returns {Array<[number, number]>} Normalized, sorted, disjoint intervals representing `a XOR b`.
 * @throws {TypeError} If `a` or `b` is not an array, an element is not a 2-tuple, or an endpoint is not a number.
 * @throws {RangeError} If any endpoint is non-finite (`NaN`, `±Infinity`) or if `lo > hi`.
 */
export function xorIntervalMemo(a, b) {
	const normA = normalizeIntervals(a, 'a');
	const normB = normalizeIntervals(b, 'b');

	const keyA = serializeNormalized(normA);
	const keyB = serializeNormalized(normB);
	// Symmetric difference is commutative, so canonicalize pair order for cache sharing.
	const cacheKey = keyA <= keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;

	const cached = memoCache.get(cacheKey);
	if (cached !== undefined) {
		// Refresh LRU recency.
		memoCache.delete(cacheKey);
		memoCache.set(cacheKey, cached);
		return cloneIntervals(cached);
	}

	const computed = sweepXorTableDriven(normA, normB);
	const frozen = Object.freeze(computed.map(([lo, hi]) => Object.freeze([lo, hi])));

	if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value;
		memoCache.delete(oldestKey);
	}
	memoCache.set(cacheKey, frozen);

	return cloneIntervals(frozen);
}
