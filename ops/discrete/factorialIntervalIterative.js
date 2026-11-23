/**
 * @fileoverview Discrete interval factorial over `[lo, hi]` using a straightforward
 * iterative product with IEEE-754 outward rounding guaranteeing sound enclosure.
 */

const f64 = new Float64Array(1);
const u64 = new BigUint64Array(f64.buffer);

/**
 * Bitmask clearing the lower 27 bits of an IEEE-754 float64 significand,
 * leaving at most 26 significant bits (25 explicit + 1 implicit).
 * For any positive normal `a` and integer `k <= 2^26`, both `aHi * k`
 * (at most 52 bits) and `(a - aHi) * k` (at most 53 bits) are exact.
 */
const HI_SIGNIFICAND_MASK = ~0x7ffffffn;

/**
 * Returns the smallest IEEE-754 float64 strictly greater than `x`
 * (or `Infinity` when `x === Number.MAX_VALUE` or `x === Infinity`).
 *
 * @param {number} x
 * @returns {number}
 */
function nextUp(x) {
	if (x === Infinity || Number.isNaN(x)) return x;
	if (x === 0) return Number.MIN_VALUE;
	f64[0] = x;
	u64[0] = x > 0 ? u64[0] + 1n : u64[0] - 1n;
	return f64[0];
}

/**
 * Returns the largest IEEE-754 float64 strictly less than `x`
 * (or `-Infinity` when `x === -Number.MAX_VALUE` or `x === -Infinity`).
 *
 * @param {number} x
 * @returns {number}
 */
function nextDown(x) {
	if (x === -Infinity || Number.isNaN(x)) return x;
	if (x === 0) return -Number.MIN_VALUE;
	f64[0] = x;
	u64[0] = x > 0 ? u64[0] - 1n : u64[0] + 1n;
	return f64[0];
}

/**
 * Computes the exact sign of `(a * k) - fl(a * k)` for a positive finite
 * float64 `a` and a positive integer `k` (with `k <= 2^26`) when `p = a * k`
 * is finite.
 *
 * Because `aHi <= a`, `aHi * k` cannot overflow when `p` is finite; by
 * Sterbenz's lemma `aHi * k - p` is exact; and `aLo * k` is exact.
 *
 * @param {number} a - Positive finite normal float64.
 * @param {number} k - Positive integer multiplier (`k <= 2^26`).
 * @param {number} p - Round-to-nearest product `a * k` (finite).
 * @returns {number} Negative if `p` rounded up, positive if `p` rounded down, 0 if exact.
 */
function mulResidual(a, k, p) {
	f64[0] = a;
	u64[0] &= HI_SIGNIFICAND_MASK;
	const aHi = f64[0];
	const aLo = a - aHi;
	return (aHi * k - p) + aLo * k;
}

/**
 * Multiplies positive finite `a` by positive integer `k` with IEEE-754
 * directed rounding toward `-Infinity`.
 *
 * When the exact product exceeds `Number.MAX_VALUE` (so `a * k === Infinity`),
 * downward rounding saturates at `Number.MAX_VALUE`, preserving `result <= a * k`.
 *
 * @param {number} a
 * @param {number} k
 * @returns {number} Largest float64 `<= a * k`.
 */
function mulDown(a, k) {
	const p = a * k;
	if (!Number.isFinite(p)) return Number.MAX_VALUE;
	const err = mulResidual(a, k, p);
	return err < 0 ? nextDown(p) : p;
}

/**
 * Multiplies positive finite `a` by positive integer `k` with IEEE-754
 * directed rounding toward `+Infinity`.
 *
 * When the exact product exceeds `Number.MAX_VALUE`, upward rounding yields
 * `Infinity`, preserving `a * k <= result`.
 *
 * @param {number} a
 * @param {number} k
 * @returns {number} Smallest float64 `>= a * k`.
 */
function mulUp(a, k) {
	const p = a * k;
	if (!Number.isFinite(p)) return Infinity;
	const err = mulResidual(a, k, p);
	return err > 0 ? nextUp(p) : p;
}

/**
 * Iteratively computes a guaranteed lower bound for `n!` (`<= n!`) using
 * downward-rounded multiplication at every step.
 *
 * @param {number} n - Non-negative finite integer.
 * @returns {number}
 */
function factorialDown(n) {
	let acc = 1;
	for (let k = 2; k <= n; k++) {
		acc = mulDown(acc, k);
		if (acc === Number.MAX_VALUE) {
			return Number.MAX_VALUE;
		}
	}
	return acc;
}

/**
 * Iteratively computes a guaranteed upper bound for `n!` (`>= n!`) using
 * upward-rounded multiplication at every step.
 *
 * @param {number} n - Non-negative integer or `Infinity`.
 * @returns {number}
 */
function factorialUp(n) {
	if (!Number.isFinite(n)) return Infinity;
	let acc = 1;
	for (let k = 2; k <= n; k++) {
		acc = mulUp(acc, k);
		if (acc === Infinity) {
			return Infinity;
		}
	}
	return acc;
}

/**
 * Computes the discrete interval factorial over `[lo, hi]` with IEEE-754
 * outward rounding guaranteeing enclosure.
 *
 * Evaluates `{ n! : n in Z, lo <= n <= hi }`, which corresponds to the
 * non-negative integer range `[Math.ceil(lo), Math.floor(hi)]`. Because `n!`
 * is monotonically non-decreasing for `n >= 0`, the lower bound is computed
 * iteratively for `Math.ceil(lo)` with downward rounding and the upper bound
 * is computed iteratively for `Math.floor(hi)` with upward rounding.
 *
 * For `n >= 171`, `n!` exceeds `Number.MAX_VALUE`; downward rounding saturates
 * at `Number.MAX_VALUE` and upward rounding overflows to `Infinity`, preserving
 * the enclosure invariant `outLo <= exact <= outHi` for every integer `n` in
 * `[lo, hi]`.
 *
 * @param {[number, number]} interval - Closed interval `[lo, hi]` with `0 <= lo <= hi`,
 *   finite `lo`, and at least one integer in `[lo, hi]`.
 * @returns {[number, number]} Outwardly rounded interval `[outLo, outHi]` enclosing `n!`
 *   for all integers `n` in `[lo, hi]`.
 * @throws {TypeError} If `interval` is not a 2-element array of non-NaN numbers.
 * @throws {RangeError} If `lo > hi`, `lo < 0`, `lo` is not finite, or `[lo, hi]`
 *   contains no integer values.
 */
export function factorialIntervalIterative(interval) {
	if (!Array.isArray(interval) || interval.length !== 2) {
		throw new TypeError('interval must be a 2-element array [lo, hi]');
	}

	const [lo, hi] = interval;

	if (typeof lo !== 'number' || typeof hi !== 'number' || Number.isNaN(lo) || Number.isNaN(hi)) {
		throw new TypeError('interval endpoints must be non-NaN numbers');
	}

	if (lo > hi) {
		throw new RangeError(`inverted interval: lo (${lo}) must be <= hi (${hi})`);
	}

	if (lo < 0) {
		throw new RangeError(`negative interval lower bound (${lo}): factorial requires n >= 0`);
	}

	if (!Number.isFinite(lo)) {
		throw new RangeError('interval lower bound must be finite');
	}

	const nLo = Math.ceil(lo);
	const nHi = Math.floor(hi);

	if (nLo > nHi) {
		throw new RangeError(`interval [${lo}, ${hi}] contains no integer values`);
	}

	return [factorialDown(nLo), factorialUp(nHi)];
}
