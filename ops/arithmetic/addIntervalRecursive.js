/**
 * @fileoverview Outward-rounded IEEE-754 interval addition using a recursive
 * divide-and-conquer summation strategy.
 *
 * Guarantees mathematical enclosure: for intervals [a_i, b_i] and any real
 * numbers x_i in [a_i, b_i], the returned interval [lo, hi] satisfies
 *   lo <= sum(x_i) <= hi
 * under exact real arithmetic.
 *
 * Outward rounding is performed via Dekker's error-free FastTwoSum paired with
 * bit-exact IEEE-754 nextDown/nextUp adjustments, producing tightest possible
 * directed-rounding bounds for each binary merge without needlessly widening
 * exact sums.
 */

const _buf = new ArrayBuffer(8);
const _f64 = new Float64Array(_buf);
const _u64 = new BigUint64Array(_buf);

/**
 * Returns the least IEEE-754 binary64 value strictly greater than `x`.
 *
 * @param {number} x
 * @returns {number}
 */
function nextUp(x) {
	if (Number.isNaN(x) || x === Infinity) {
		return x;
	}
	if (x === -Infinity) {
		return -Number.MAX_VALUE;
	}
	if (x === 0) {
		return Number.MIN_VALUE;
	}
	_f64[0] = x;
	const bits = _u64[0];
	_u64[0] = x > 0 ? bits + 1n : bits - 1n;
	const res = _f64[0];
	return res === 0 ? 0 : res;
}

/**
 * Returns the greatest IEEE-754 binary64 value strictly less than `x`.
 *
 * @param {number} x
 * @returns {number}
 */
function nextDown(x) {
	const res = -nextUp(-x);
	return res === 0 ? 0 : res;
}

/**
 * Computes exact IEEE-754 round-toward-negative-infinity addition: fl_down(a + b).
 *
 * Uses Dekker's FastTwoSum on operands ordered by magnitude (|x| >= |y|), which
 * is exact without intermediate overflow or underflow error for all finite
 * binary64 inputs whose sum does not overflow.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function addDown(a, b) {
	if (!Number.isFinite(a) || !Number.isFinite(b)) {
		if ((a === Infinity && b === -Infinity) || (a === -Infinity && b === Infinity)) {
			return -Infinity;
		}
		return a + b;
	}

	let x = a;
	let y = b;
	if (Math.abs(x) < Math.abs(y)) {
		x = b;
		y = a;
	}

	const s = x + y;
	if (s === Infinity) {
		return Number.MAX_VALUE;
	}
	if (s === -Infinity) {
		return -Infinity;
	}

	const z = s - x;
	const e = y - z;
	const res = e < 0 ? nextDown(s) : s;
	return res === 0 ? 0 : res;
}

/**
 * Computes exact IEEE-754 round-toward-positive-infinity addition: fl_up(a + b).
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function addUp(a, b) {
	if (!Number.isFinite(a) || !Number.isFinite(b)) {
		if ((a === Infinity && b === -Infinity) || (a === -Infinity && b === Infinity)) {
			return Infinity;
		}
		return a + b;
	}

	let x = a;
	let y = b;
	if (Math.abs(x) < Math.abs(y)) {
		x = b;
		y = a;
	}

	const s = x + y;
	if (s === Infinity) {
		return Infinity;
	}
	if (s === -Infinity) {
		return -Number.MAX_VALUE;
	}

	const z = s - x;
	const e = y - z;
	const res = e > 0 ? nextUp(s) : s;
	return res === 0 ? 0 : res;
}

/**
 * Validates that a value is a well-formed finite interval [lo, hi] with lo <= hi.
 *
 * @param {unknown} interval
 * @param {string} label
 * @returns {[number, number]} Normalized copy of the interval.
 */
function validateInterval(interval, label) {
	if (!Array.isArray(interval)) {
		throw new TypeError(`${label} must be an interval array [lo, hi]`);
	}
	if (interval.length !== 2) {
		throw new RangeError(`${label} must have length 2, received length ${interval.length}`);
	}
	const [lo, hi] = interval;
	if (typeof lo !== 'number' || typeof hi !== 'number') {
		throw new TypeError(`${label} endpoints must be numbers`);
	}
	if (Number.isNaN(lo) || Number.isNaN(hi)) {
		throw new RangeError(`${label} endpoints must not be NaN`);
	}
	if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
		throw new RangeError(`${label} endpoints must be finite numbers`);
	}
	if (lo > hi) {
		throw new RangeError(`${label} lower bound (${lo}) must not exceed upper bound (${hi})`);
	}
	return [lo === 0 ? 0 : lo, hi === 0 ? 0 : hi];
}

/**
 * Adds two intervals with exact outward rounding.
 *
 * @param {[number, number]} a
 * @param {[number, number]} b
 * @returns {[number, number]}
 */
function addPair(a, b) {
	return [addDown(a[0], b[0]), addUp(a[1], b[1])];
}

/**
 * Recursively sums a contiguous slice of intervals using divide-and-conquer
 * pairwise summation, keeping rounding depth at O(log n).
 *
 * @param {Array<[number, number]>} intervals
 * @param {number} start Inclusive start index
 * @param {number} end Exclusive end index
 * @returns {[number, number]}
 */
function sumDivideAndConquer(intervals, start, end) {
	const count = end - start;
	if (count === 1) {
		return [intervals[start][0], intervals[start][1]];
	}
	if (count === 2) {
		return addPair(intervals[start], intervals[start + 1]);
	}
	const mid = start + (count >> 1);
	const left = sumDivideAndConquer(intervals, start, mid);
	const right = sumDivideAndConquer(intervals, mid, end);
	return addPair(left, right);
}

/**
 * Adds two or more intervals `[lo, hi]` (passed either as separate arguments or
 * as a single non-empty array of intervals) using recursive divide-and-conquer
 * pairwise summation with outward IEEE-754 rounding to guarantee enclosure.
 *
 * Overflow of finite sums is enclosed using `Number.MAX_VALUE` / `Infinity`
 * (or `-Infinity` / `-Number.MAX_VALUE`) rather than losing soundness.
 *
 * @param {[number, number] | Array<[number, number]>} first
 *   Either the first `[lo, hi]` interval (when passing multiple arguments) or a
 *   non-empty array of `[lo, hi]` intervals.
 * @param {...[number, number]} rest Additional `[lo, hi]` intervals.
 * @returns {[number, number]} Outward-rounded enclosing sum interval `[lo, hi]`.
 * @throws {TypeError} If arguments or endpoints have invalid types.
 * @throws {RangeError} If no intervals are provided, an interval does not have
 *   length 2, endpoints are non-finite/NaN, or `lo > hi`.
 *
 * @example
 * addIntervalRecursive([0.1, 0.1], [0.2, 0.2]);
 * // => [0.3, 0.30000000000000004]
 *
 * @example
 * addIntervalRecursive([[1, 2], [3, 4], [5, 6]]);
 * // => [9, 12]
 */
export function addIntervalRecursive(...args) {
	if (args.length === 0) {
		throw new RangeError('Expected at least two intervals or a non-empty array of intervals');
	}

	let rawIntervals;
	if (args.length === 1) {
		const single = args[0];
		if (!Array.isArray(single)) {
			throw new TypeError('Single argument must be an array of [lo, hi] intervals');
		}
		if (single.length === 0) {
			throw new RangeError('Interval array must not be empty');
		}
		rawIntervals = single;
	} else {
		rawIntervals = args;
	}

	const validated = new Array(rawIntervals.length);
	for (let i = 0; i < rawIntervals.length; i++) {
		validated[i] = validateInterval(rawIntervals[i], `Interval at index ${i}`);
	}

	return sumDivideAndConquer(validated, 0, validated.length);
}
