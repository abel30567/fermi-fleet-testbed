/**
 * Fixed-point scale factor (10^18) for exact BigInt trigonometric computations.
 *
 * A BigInt value `v` represents the exact rational number `v / SCALE`.
 * @type {bigint}
 */
export const SCALE = 10n ** 18n;

/**
 * Extra internal guard factor (22 guard decimal digits) so internal arithmetic
 * runs at 10^40 precision and final rounding to 10^18 is accurate to nearest integer.
 */
const GUARD = 10n ** 22n;
const WORK_SCALE = SCALE * GUARD; // 10n ** 40n
const REDUCE_THRESHOLD = WORK_SCALE >> 6n; // WORK_SCALE / 64n
const LARGE_X_LIMIT = 2n * SCALE * WORK_SCALE;
const TARGET_BITS = 140; // 2^-140 < 10^-42 (2 digits below WORK_SCALE)

/** @type {bigint | null} */
let cachedHalfPiWork = null;

/**
 * Returns the exact bit length of a positive BigInt.
 *
 * @param {bigint} n - Positive BigInt.
 * @returns {number} Number of bits in binary representation of `n`.
 */
function bitLength(n) {
	return n.toString(2).length;
}

/**
 * Computes nearest-integer division `round(num / den)` for non-negative `num`
 * and positive `den` (ties round away from zero).
 *
 * @param {bigint} num - Non-negative numerator.
 * @param {bigint} den - Positive denominator.
 * @returns {bigint} Rounded quotient.
 */
function divRoundPositive(num, den) {
	return (num + (den >> 1n)) / den;
}

/**
 * Recursive Newton-Raphson step converging monotonically from above to `floor(sqrt(n))`.
 *
 * @param {bigint} n - Radicand (`n >= 2n`).
 * @param {bigint} x - Current upper-bound estimate.
 * @returns {bigint} Exact integer square root `floor(sqrt(n))`.
 */
function isqrtNewtonRecursive(n, x) {
	const next = (x + n / x) >> 1n;
	if (next >= x) {
		return x;
	}
	return isqrtNewtonRecursive(n, next);
}

/**
 * Computes `floor(sqrt(n))` for a non-negative BigInt using recursive Newton-Raphson iteration.
 *
 * @param {bigint} n - Non-negative BigInt.
 * @returns {bigint} Exact integer square root `floor(sqrt(n))`.
 */
function isqrtRecursive(n) {
	if (n < 2n) {
		return n;
	}
	const initial = 1n << BigInt((bitLength(n) + 1) >> 1);
	return isqrtNewtonRecursive(n, initial);
}

/**
 * Divide-and-conquer binary splitting over the Gregory-Leibniz series for `arctan(p / q)`.
 *
 * For `a = -p^2` and `b = q^2`, computes exact BigInts `{ T, D, P, B }` over the half-open
 * index range `[lo, hi)` satisfying:
 *
 *   T / (D * B) = (1 / b) * sum_{k = lo}^{hi - 1} (a / b)^(k - lo) / (2k + 1)
 *
 * with `P = a^(hi - lo)`, `B = b^(hi - lo)`, and `D = prod_{k = lo}^{hi - 1} (2k + 1)`.
 *
 * @param {number} lo - Inclusive start term index.
 * @param {number} hi - Exclusive end term index (`hi > lo`).
 * @param {bigint} a - `-p * p`.
 * @param {bigint} b - `q * q`.
 * @returns {{ T: bigint, D: bigint, P: bigint, B: bigint }} Exact binary-splitting tuple.
 */
function binarySplitArctanTerms(lo, hi, a, b) {
	if (hi - lo === 1) {
		return {
			T: 1n,
			D: 2n * BigInt(lo) + 1n,
			P: a,
			B: b,
		};
	}

	const mid = (lo + hi) >>> 1;
	const left = binarySplitArctanTerms(lo, mid, a, b);
	const right = binarySplitArctanTerms(mid, hi, a, b);

	return {
		T: left.T * right.D * right.B + left.P * right.T * left.D,
		D: left.D * right.D,
		P: left.P * right.P,
		B: left.B * right.B,
	};
}

/**
 * Computes an exact rational approximation `{ num, den }` to `arctan(p / q)` for `0 < p < q`
 * (with `q / p >= 2`) via divide-and-conquer binary splitting, guaranteed accurate to `< 2^-140`.
 *
 * @param {bigint} p - Positive numerator (`0n < p < q`).
 * @param {bigint} q - Positive denominator (`q >= 2n * p`).
 * @returns {{ num: bigint, den: bigint }} Exact rational approximation `num / den`.
 */
function arctanRationalExact(p, q) {
	// Since q / p > 2^(bitLength(q) - bitLength(p) - 1), choose N so (p/q)^(2N+1) < 2^-TARGET_BITS.
	const lb = Math.max(1, bitLength(q) - bitLength(p) - 1);
	const terms = Math.max(1, Math.ceil((Math.ceil(TARGET_BITS / lb) - 1) / 2));

	const a = -(p * p);
	const b = q * q;
	const { T, D, B } = binarySplitArctanTerms(0, terms, a, b);

	// arctan(p / q) ≈ p * q * T / (D * B)
	return {
		num: p * q * T,
		den: D * B,
	};
}

/**
 * Computes `round(arctan(p / q) * WORK_SCALE)` for `0 < p < q` (`q >= 2n * p`).
 *
 * @param {bigint} p - Positive numerator.
 * @param {bigint} q - Positive denominator.
 * @returns {bigint} `arctan(p / q)` scaled by `WORK_SCALE`.
 */
function arctanRationalWork(p, q) {
	const { num, den } = arctanRationalExact(p, q);
	return divRoundPositive(num * WORK_SCALE, den);
}

/**
 * Lazily computes and caches `round((pi / 2) * WORK_SCALE)` using Machin's identity:
 *
 *   pi / 2 = 8 * arctan(1 / 5) - 2 * arctan(1 / 239)
 *
 * evaluated via the exact rational binary-splitting engine.
 *
 * @returns {bigint} `pi / 2` scaled by `WORK_SCALE`.
 */
function getHalfPiWork() {
	if (cachedHalfPiWork === null) {
		const r5 = arctanRationalExact(1n, 5n);
		const r239 = arctanRationalExact(1n, 239n);
		const num = 8n * r5.num * r239.den - 2n * r239.num * r5.den;
		const den = r5.den * r239.den;
		cachedHalfPiWork = divRoundPositive(num * WORK_SCALE, den);
	}
	return cachedHalfPiWork;
}

/**
 * Recursively reduces `u` (scaled by `WORK_SCALE`, `0 < u <= WORK_SCALE`) via the
 * half-angle tangent identity:
 *
 *   arctan(u) = 2 * arctan(u / (1 + sqrt(1 + u^2)))
 *
 * until `u <= WORK_SCALE / 64`, then evaluates the reduced argument via divide-and-conquer
 * binary splitting on the Gregory-Leibniz series.
 *
 * @param {bigint} uWork - Positive fixed-point input scaled by `WORK_SCALE` (`uWork <= WORK_SCALE`).
 * @returns {bigint} `arctan(uWork / WORK_SCALE)` scaled by `WORK_SCALE`.
 */
function arctanReducedWork(uWork) {
	if (uWork <= REDUCE_THRESHOLD) {
		return arctanRationalWork(uWork, WORK_SCALE);
	}
	const hyp = isqrtRecursive(WORK_SCALE * WORK_SCALE + uWork * uWork);
	const halfU = divRoundPositive(uWork * WORK_SCALE, WORK_SCALE + hyp);
	return 2n * arctanReducedWork(halfU);
}

/**
 * Computes `arctan(x)` over exact fixed-point BigInt values scaled by `SCALE = 10n ** 18n`.
 *
 * Input `x` represents the exact real value `x / SCALE`. The returned BigInt represents
 * `round(arctan(x / SCALE) * SCALE)` in radians, in the range `[-1570796326794896619n, 1570796326794896619n]`.
 *
 * Algorithm (genuinely recursive & divide-and-conquer, pure BigInt with 22 guard decimal digits):
 * 1. Odd symmetry recursion: `arctan(-x) = -arctan(x)`.
 * 2. Reciprocal reduction for `|x| > SCALE`: `arctan(r) = pi/2 - arctan(1/r)`, where `pi/2`
 *    is computed via Machin's formula `8*arctan(1/5) - 2*arctan(1/239)`.
 * 3. Recursive half-angle argument reduction for `|r| <= 1`:
 *    `arctan(r) = 2 * arctan(r / (1 + sqrt(1 + r^2)))` using recursive Newton-Raphson `isqrt`
 *    until `r <= 1/64` (at most 6 levels of recursion).
 * 4. Divide-and-conquer binary splitting on the Gregory-Leibniz series over exact BigInt
 *    rationals, followed by a single rounded scaling back to `10n ** 18n`.
 *
 * @param {bigint} x - Fixed-point BigInt input scaled by `SCALE` (`10n ** 18n`).
 * @returns {bigint} Fixed-point BigInt representing `arctan(x / SCALE)` in radians, scaled by `SCALE`.
 * @throws {TypeError} If `x` is not a `bigint`.
 */
export function arctanBigIntRecursive(x) {
	if (typeof x !== 'bigint') {
		throw new TypeError(`Expected x to be a BigInt, received ${typeof x}`);
	}

	if (x === 0n) {
		return 0n;
	}

	if (x < 0n) {
		return -arctanBigIntRecursive(-x);
	}

	if (x > SCALE) {
		const halfPiWork = getHalfPiWork();
		if (x > LARGE_X_LIMIT) {
			return divRoundPositive(halfPiWork, GUARD);
		}
		const invWork = divRoundPositive(SCALE * WORK_SCALE, x);
		const atanInvWork = invWork === 0n ? 0n : arctanReducedWork(invWork);
		return divRoundPositive(halfPiWork - atanInvWork, GUARD);
	}

	const uWork = x * GUARD;
	return divRoundPositive(arctanReducedWork(uWork), GUARD);
}
