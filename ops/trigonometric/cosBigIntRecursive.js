/**
 * Fixed-point scale factor (`10^18`).
 * Angles in radians and cosine results are represented as exact BigInts scaled by `SCALE`.
 * For example, `SCALE` represents `1.0`, and `0n` represents `0.0`.
 */
export const SCALE = 10n ** 18n;

/**
 * `π` rounded to the nearest `10^-18` fixed-point BigInt (`3.141592653589793238`).
 */
export const PI_SCALED = 3141592653589793238n;

/**
 * `π / 2` rounded to the nearest `10^-18` fixed-point BigInt (`1.570796326794896619`).
 */
export const HALF_PI_SCALED = 1570796326794896619n;

/**
 * `2π` rounded to the nearest `10^-18` fixed-point BigInt (`6.283185307179586477`).
 */
export const TWO_PI_SCALED = 6283185307179586477n;

const SCALE_DIGITS = 18;
const GUARD_DIGITS = 40;
const WORK_DIGITS = SCALE_DIGITS + GUARD_DIGITS; // 58 decimal digits
const GUARD_SCALE = 10n ** BigInt(GUARD_DIGITS);
const WORK_SCALE = 10n ** BigInt(WORK_DIGITS);

// Bit-shift applied before recursive halving so up to 12 halvings remain bit-exact.
const HALVE_SHIFT = 12n;
const EXACT_SCALE = WORK_SCALE << HALVE_SHIFT;
// Threshold θ <= 2^-10 (~0.000977 rad), reached within at most 11 halvings for θ <= π/2.
const HALVE_THRESHOLD = EXACT_SCALE >> 10n;
// 10 terms of (1 - cos(θ)) Taylor series at θ <= 2^-10 has truncation error < 5e-88.
const TAYLOR_TERMS = 10;

const MIN_PI_DIGITS = 80;
const PI_EXTRA_GUARD = 12;

/** @type {{ digits: number, value: bigint } | null} */
let cachedPi = null;

/**
 * Exact symmetric round-half-to-even division for BigInts (`denominator > 0n`).
 *
 * @param {bigint} numerator
 * @param {bigint} denominator - Must be strictly positive.
 * @returns {bigint}
 */
function roundDiv(numerator, denominator) {
	if (numerator < 0n) {
		return -roundDiv(-numerator, denominator);
	}
	const quotient = numerator / denominator;
	const remainder = numerator % denominator;
	const twiceRemainder = remainder << 1n;
	if (twiceRemainder > denominator || (twiceRemainder === denominator && (quotient & 1n) === 1n)) {
		return quotient + 1n;
	}
	return quotient;
}

/**
 * Recursive divide-and-conquer binary splitting for the series:
 *   S(a, b) = sum_{k=a}^{b-1} (-1)^k / ((2k + 1) * q^(2k))
 * used to evaluate `arctan(1 / q) = S(0, n) / q` in exact rational arithmetic.
 *
 * @param {number} a - Inclusive start index.
 * @param {number} b - Exclusive end index (`a < b`).
 * @param {bigint} q2 - `q * q`.
 * @returns {{ P: bigint, Q: bigint, B: bigint, T: bigint }}
 */
function binarySplitArctan(a, b, q2) {
	if (b - a === 1) {
		const P = a === 0 ? 1n : -1n;
		const Q = a === 0 ? 1n : q2;
		const B = BigInt(2 * a + 1);
		return { P, Q, B, T: P };
	}

	const mid = (a + b) >>> 1;
	const left = binarySplitArctan(a, mid, q2);
	const right = binarySplitArctan(mid, b, q2);

	return {
		P: left.P * right.P,
		Q: left.Q * right.Q,
		B: left.B * right.B,
		T: right.B * right.Q * left.T + left.B * left.P * right.T,
	};
}

/**
 * Computes `π * 10^digits` rounded to the nearest integer using Machin's formula:
 *   π = 16 * arctan(1/5) - 4 * arctan(1/239)
 * evaluated via recursive binary splitting, with caching for repeated calls.
 *
 * @param {number} digits - Required number of fractional decimal digits.
 * @returns {bigint}
 */
function getPiScaled(digits) {
	if (cachedPi !== null && cachedPi.digits >= digits) {
		if (cachedPi.digits === digits) {
			return cachedPi.value;
		}
		return roundDiv(cachedPi.value, 10n ** BigInt(cachedPi.digits - digits));
	}

	const computeDigits = Math.max(digits, MIN_PI_DIGITS);
	const internalDigits = computeDigits + PI_EXTRA_GUARD;
	const internalScale = 10n ** BigInt(internalDigits);

	// log10(25) ≈ 1.39794, log10(239^2) ≈ 4.7568
	const terms5 = Math.ceil(internalDigits / 1.397) + 4;
	const terms239 = Math.ceil(internalDigits / 4.75) + 4;

	const s5 = binarySplitArctan(0, terms5, 25n);
	const s239 = binarySplitArctan(0, terms239, 57121n);

	const term5 = roundDiv(16n * s5.T * internalScale, 5n * s5.B * s5.Q);
	const term239 = roundDiv(4n * s239.T * internalScale, 239n * s239.B * s239.Q);

	const piValue = roundDiv(term5 - term239, 10n ** BigInt(PI_EXTRA_GUARD));
	cachedPi = { digits: computeDigits, value: piValue };

	if (computeDigits === digits) {
		return piValue;
	}
	return roundDiv(piValue, 10n ** BigInt(computeDigits - digits));
}

/**
 * Recursive divide-and-conquer binary splitting for the exact rational Taylor series:
 *   1 - cos(θ) = sum_{k=1}^{n} (-1)^(k-1) * θ^(2k) / (2k)!
 * where `θ^2 = p2 / q2`.
 *
 * Returns `{ P, Q, T }` such that `T / Q` equals the exact partial sum on `[a, b)`
 * relative to the product prefix at index `a`.
 *
 * @param {number} a - Inclusive term index (`a >= 1`).
 * @param {number} b - Exclusive term index (`a < b`).
 * @param {bigint} p2 - Numerator of `θ^2`.
 * @param {bigint} q2 - Denominator of `θ^2`.
 * @returns {{ P: bigint, Q: bigint, T: bigint }}
 */
function binarySplitOneMinusCos(a, b, p2, q2) {
	if (b - a === 1) {
		const num = a === 1 ? p2 : -p2;
		const twoA = BigInt(2 * a);
		const den = (twoA - 1n) * twoA * q2;
		return { P: num, Q: den, T: num };
	}

	const mid = (a + b) >>> 1;
	const left = binarySplitOneMinusCos(a, mid, p2, q2);
	const right = binarySplitOneMinusCos(mid, b, p2, q2);

	return {
		P: left.P * right.P,
		Q: left.Q * right.Q,
		T: left.T * right.Q + left.P * right.T,
	};
}

/**
 * Recursively computes `(1 - cos(θ)) * WORK_SCALE` for `0 <= θ <= π/2`,
 * where `θ = angleExact / EXACT_SCALE`.
 *
 * Uses divide-and-conquer argument halving with the cancellation-free doubling identity:
 *   u(θ) = 1 - cos(θ) = 2 * u(θ / 2) * (2 - u(θ / 2))
 * until `θ <= 2^-10`, then evaluates the base case using recursive binary splitting
 * of the Taylor series in exact rational arithmetic.
 *
 * @param {bigint} angleExact - Non-negative angle scaled by `EXACT_SCALE`.
 * @returns {bigint} `(1 - cos(θ)) * WORK_SCALE`.
 */
function oneMinusCosRecursive(angleExact) {
	if (angleExact === 0n) {
		return 0n;
	}

	if (angleExact <= HALVE_THRESHOLD) {
		const p2 = angleExact * angleExact;
		const q2 = EXACT_SCALE * EXACT_SCALE;
		const { Q, T } = binarySplitOneMinusCos(1, TAYLOR_TERMS + 1, p2, q2);
		return roundDiv(T * WORK_SCALE, Q);
	}

	const uHalf = oneMinusCosRecursive(angleExact >> 1n);
	return roundDiv(2n * uHalf * (2n * WORK_SCALE - uHalf), WORK_SCALE);
}

/**
 * Computes the trigonometric cosine `cos(x / 10^18)` over exact fixed-point BigInts,
 * returning `round(cos(x / 10^18) * 10^18)` scaled by `SCALE = 10n ** 18n`.
 *
 * Algorithm (genuinely recursive / divide-and-conquer):
 * 1. Uses even symmetry `cos(-θ) = cos(θ)` and, for `|θ| > π/2`, performs high-precision
 *    range reduction modulo `2π` into `[0, π/2]` using `π` computed dynamically to
 *    sufficient guard digits via Machin's formula with recursive binary splitting.
 * 2. Computes `u(θ) = 1 - cos(θ)` at 58 decimal digits of internal guard precision
 *    (`40` guard digits beyond `10^18`) using recursive argument halving with the
 *    cancellation-free identity `u(θ) = 2 * u(θ/2) * (2 - u(θ/2))`.
 * 3. Evaluates the small-angle base case (`θ <= 2^-10`) via recursive divide-and-conquer
 *    binary splitting of the Taylor series in exact rational arithmetic.
 * 4. Reconstructs `cos(θ) = ±(1 - u(θ))` and rounds half-to-even down to `10^18` scale.
 *
 * Recursion depth is strictly `O(1)` for argument halving (at most 11 frames) and
 * `O(log D)` for binary splitting, preventing stack overflows even for very large BigInts.
 *
 * @param {bigint} x - Angle in radians scaled by `SCALE` (`10n ** 18n`).
 * @returns {bigint} `cos(x / 10^18)` scaled by `SCALE` (`10n ** 18n`), in `[-SCALE, SCALE]`.
 * @throws {TypeError} If `x` is not a `bigint`.
 */
export function cosBigIntRecursive(x) {
	if (typeof x !== 'bigint') {
		throw new TypeError(`Expected angle x to be a BigInt scaled by 10^18, received ${typeof x}`);
	}

	if (x === 0n) {
		return SCALE;
	}

	const absX = x < 0n ? -x : x;

	let rWork;
	let sign = 1n;

	if (absX <= HALF_PI_SCALED) {
		// Fast path: 0 < θ < π/2 already; no range reduction needed.
		rWork = absX * GUARD_SCALE;
	} else {
		// Upper bound on integer digits of |x| / 10^18 using O(n) base-16 length.
		const approxDecDigits = Math.ceil(absX.toString(16).length * 1.20412);
		const intDigits = Math.max(0, approxDecDigits - SCALE_DIGITS);
		const piDigits = Math.max(MIN_PI_DIGITS, WORK_DIGITS + intDigits + PI_EXTRA_GUARD);

		const piHigh = getPiScaled(piDigits);
		const twoPiHigh = piHigh << 1n;
		const halfPiHigh = piHigh >> 1n;

		const xHigh = absX * 10n ** BigInt(piDigits - SCALE_DIGITS);
		let rHigh = xHigh % twoPiHigh;

		// cos(2π - θ) = cos(θ) -> reduce [0, 2π) to [0, π]
		if (rHigh > piHigh) {
			rHigh = twoPiHigh - rHigh;
		}

		// cos(π - θ) = -cos(θ) -> reduce [0, π] to [0, π/2]
		if (rHigh > halfPiHigh) {
			rHigh = piHigh - rHigh;
			sign = -1n;
		}

		rWork = roundDiv(rHigh, 10n ** BigInt(piDigits - WORK_DIGITS));
	}

	const uWork = oneMinusCosRecursive(rWork << HALVE_SHIFT);
	const cosWork = WORK_SCALE - uWork;
	return roundDiv(sign * cosWork, GUARD_SCALE);
}
