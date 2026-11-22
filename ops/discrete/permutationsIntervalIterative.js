const _f64 = new Float64Array(1);
const _u64 = new BigUint64Array(_f64.buffer);

// Veltkamp splitting constant for IEEE-754 binary64: 2^27 + 1.
const SPLIT = 134217729;

// Safe upper thresholds to guarantee Dekker TwoProd cannot overflow.
// 2^996 ≈ 6.69e299; Number.MAX_VALUE ≈ 1.797e308.
const TWO_PROD_OPERAND_LIMIT = 1e299;
const TWO_PROD_PRODUCT_LIMIT = 1e307;

/**
 * Returns the smallest IEEE-754 double strictly greater than `x`
 * (or `Infinity` if `x === Infinity`).
 *
 * @param {number} x
 * @returns {number}
 */
function nextUp(x) {
	if (Number.isNaN(x) || x === Infinity) return x;
	if (x === -Infinity) return -Number.MAX_VALUE;
	if (x === 0) return Number.MIN_VALUE;

	_f64[0] = x;
	if (x > 0) {
		_u64[0] += 1n;
	} else {
		_u64[0] -= 1n;
	}
	return _f64[0] === 0 ? 0 : _f64[0];
}

/**
 * Returns the largest IEEE-754 double strictly less than `x`
 * (or `-Infinity` if `x === -Infinity`).
 *
 * @param {number} x
 * @returns {number}
 */
function nextDown(x) {
	if (Number.isNaN(x) || x === -Infinity) return x;
	if (x === Infinity) return Number.MAX_VALUE;
	if (x === 0) return -Number.MIN_VALUE;

	_f64[0] = x;
	if (x > 0) {
		_u64[0] -= 1n;
	} else {
		_u64[0] += 1n;
	}
	return _f64[0] === 0 ? 0 : _f64[0];
}

/**
 * Multiplies two finite numbers `a >= 1` and `b >= 1` with directed rounding
 * toward negative infinity, guaranteeing `mulDown(a, b) <= a * b` (exact real).
 *
 * Uses Dekker's exact TwoProd error-free transformation when safely away from
 * overflow so exact products suffer zero spurious ULP widening, and falls back
 * to conservative ULP stepping near `Number.MAX_VALUE`.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function mulDown(a, b) {
	if (a === 1) return b;
	if (b === 1) return a;

	const p = a * b;
	if (!Number.isFinite(p)) {
		return Number.MAX_VALUE;
	}

	if (
		a <= TWO_PROD_OPERAND_LIMIT &&
		b <= TWO_PROD_OPERAND_LIMIT &&
		p <= TWO_PROD_PRODUCT_LIMIT
	) {
		const ca = SPLIT * a;
		const aHi = ca - (ca - a);
		const aLo = a - aHi;

		const cb = SPLIT * b;
		const bHi = cb - (cb - b);
		const bLo = b - bHi;

		const err = (aHi * bHi - p + aHi * bLo + aLo * bHi) + aLo * bLo;
		return err < 0 ? nextDown(p) : p;
	}

	return nextDown(p);
}

/**
 * Multiplies `a >= 1` (possibly `Infinity`) and finite `b >= 1` with directed
 * rounding toward positive infinity, guaranteeing `mulUp(a, b) >= a * b`.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function mulUp(a, b) {
	if (a === Infinity) return Infinity;
	if (a === 1) return b;
	if (b === 1) return a;

	const p = a * b;
	if (!Number.isFinite(p)) {
		return Infinity;
	}

	if (
		a <= TWO_PROD_OPERAND_LIMIT &&
		b <= TWO_PROD_OPERAND_LIMIT &&
		p <= TWO_PROD_PRODUCT_LIMIT
	) {
		const ca = SPLIT * a;
		const aHi = ca - (ca - a);
		const aLo = a - aHi;

		const cb = SPLIT * b;
		const bHi = cb - (cb - b);
		const bLo = b - bHi;

		const err = (aHi * bHi - p + aHi * bLo + aLo * bHi) + aLo * bLo;
		return err > 0 ? nextUp(p) : p;
	}

	return nextUp(p);
}

/**
 * Validates that `interval` is a well-formed non-negative safe-integer interval `[lo, hi]`.
 *
 * @param {unknown} interval
 * @param {string} name
 * @returns {[number, number]}
 */
function validateIntegerInterval(interval, name) {
	if (!Array.isArray(interval) || interval.length !== 2) {
		throw new TypeError(`${name} must be a [lo, hi] array of length 2`);
	}

	const [lo, hi] = interval;
	if (typeof lo !== 'number' || typeof hi !== 'number') {
		throw new TypeError(`${name} endpoints must be numbers`);
	}
	if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
		throw new RangeError(`${name} endpoints must be finite numbers`);
	}
	if (!Number.isInteger(lo) || !Number.isInteger(hi)) {
		throw new RangeError(`${name} endpoints must be integers`);
	}
	if (!Number.isSafeInteger(lo) || !Number.isSafeInteger(hi)) {
		throw new RangeError(`${name} endpoints must be safe integers`);
	}
	if (lo > hi) {
		throw new RangeError(`${name} must satisfy lo <= hi (got [${lo}, ${hi}])`);
	}
	if (lo < 0) {
		throw new RangeError(`${name} endpoints must be non-negative (got [${lo}, ${hi}])`);
	}

	return [lo === 0 ? 0 : lo, hi === 0 ? 0 : hi];
}

/**
 * Computes a rigorous outward-rounded lower bound for P(n, k) = n! / (n - k)!
 * using iterative product accumulation.
 *
 * @param {number} n
 * @param {number} k
 * @returns {number}
 */
function permutationsLowerBound(n, k) {
	let acc = 1;
	for (let i = 0; i < k; i++) {
		acc = mulDown(acc, n - i);
		if (acc === Number.MAX_VALUE) {
			break;
		}
	}
	return acc;
}

/**
 * Computes a rigorous outward-rounded upper bound for P(n, k) = n! / (n - k)!
 * using iterative product accumulation.
 *
 * @param {number} n
 * @param {number} k
 * @returns {number}
 */
function permutationsUpperBound(n, k) {
	let acc = 1;
	for (let i = 0; i < k; i++) {
		acc = mulUp(acc, n - i);
		if (acc === Infinity) {
			break;
		}
	}
	return acc;
}

/**
 * Computes an outward-rounded IEEE-754 interval enclosure `[lo, hi]` for the
 * discrete permutation count `P(n, k) = n! / (n - k)! = prod_{i=0}^{k-1} (n - i)`
 * over integer intervals `nInterval = [nLo, nHi]` and `kInterval = [kLo, kHi]`.
 *
 * Mathematical semantics:
 * - Every integer pair `(n, k)` in `[nLo, nHi] x [kLo, kHi]` must lie in the
 *   domain `0 <= k <= n`, which requires `0 <= kLo <= kHi <= nLo <= nHi`.
 * - Over `0 <= k <= n`, `P(n, k)` is monotonically non-decreasing in both `n`
 *   and `k`:
 *     - Increasing `n` strictly increases every factor `(n - i)` for `k >= 1`
 *       (and leaves `P(n, 0) = 1` constant).
 *     - Increasing `k` by `1` multiplies by `(n - k) >= 1`.
 * - Consequently, the exact mathematical range over the integer box is
 *   `[P(nLo, kLo), P(nHi, kHi)]`.
 * - Each endpoint is accumulated iteratively with true IEEE-754 outward
 *   rounding (`mulDown` / `mulUp` via Dekker TwoProd and ULP stepping
 *   `nextDown` / `nextUp`), rigorously guaranteeing:
 *     `lo <= P(n, k) <= hi` for all integers `n in [nLo, nHi]`, `k in [kLo, kHi]`,
 *   with `lo <= hi`. If the exact value exceeds `Number.MAX_VALUE`, the lower
 *   bound saturates at `Number.MAX_VALUE` and the upper bound at `Infinity`.
 *
 * @param {[number, number]} nInterval - Non-negative safe-integer interval `[nLo, nHi]` with `nLo <= nHi`.
 * @param {[number, number]} kInterval - Non-negative safe-integer interval `[kLo, kHi]` with `kLo <= kHi <= nLo`.
 * @returns {[number, number]} Outward-rounded interval `[lo, hi]` enclosing `{ P(n, k) }`.
 * @throws {TypeError} If `nInterval` or `kInterval` is not a 2-element array of numbers.
 * @throws {RangeError} If any endpoint is non-finite, non-integer, unsafe integer, negative,
 *   if `lo > hi` for either interval, or if `kHi > nLo` (domain violation `k > n` in box).
 */
export function permutationsIntervalIterative(nInterval, kInterval) {
	const [nLo, nHi] = validateIntegerInterval(nInterval, 'nInterval');
	const [kLo, kHi] = validateIntegerInterval(kInterval, 'kInterval');

	if (kHi > nLo) {
		throw new RangeError(
			`Domain violation: kInterval upper bound (${kHi}) must be <= nInterval lower bound (${nLo}) so that k <= n for all pairs in the box`
		);
	}

	const lo = permutationsLowerBound(nLo, kLo);
	const hi = permutationsUpperBound(nHi, kHi);

	return [lo, hi];
}
