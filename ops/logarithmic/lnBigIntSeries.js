/**
 * Fixed-point scale factor (10^18) used for non-integer BigInt results.
 * @type {bigint}
 */
export const SCALE = 10n ** 18n;

const SCALE_DIGITS = 18;
const BASE_GUARD_DIGITS = 18;

/**
 * Computes floor(ln(2) * workScale) via the hyperbolic arctangent series:
 *   ln(2) = 2 * artanh(1/3) = 2 * sum_{j=0}^\infty 1 / ((2j + 1) * 3^(2j + 1))
 *
 * @param {bigint} workScale - Internal fixed-point scale (power of 10).
 * @returns {bigint} Scaled value of ln(2).
 */
function computeLn2Scaled(workScale) {
	let term = workScale / 3n;
	let sum = 0n;
	let denom = 1n;

	while (term !== 0n) {
		sum += term / denom;
		term /= 9n;
		denom += 2n;
	}

	return 2n * sum;
}

const BASE_WORK_SCALE = 10n ** BigInt(SCALE_DIGITS + BASE_GUARD_DIGITS);
const BASE_GUARD_SCALE = 10n ** BigInt(BASE_GUARD_DIGITS);
const LN2_BASE = computeLn2Scaled(BASE_WORK_SCALE);

/**
 * Computes the natural logarithm ln(n) of a positive BigInt integer `n`,
 * returning a fixed-point BigInt scaled by 10^18 (rounded to the nearest
 * 10^-18).
 *
 * Implementation uses binary argument reduction and the area hyperbolic
 * tangent (artanh) Taylor series:
 *   1. Choose integer `m` so that `r = n / 2^m` lies close to 1
 *      (specifically `r in (17/24, 17/12]`, giving `|y| < 0.1725`).
 *   2. Express `ln(n) = m * ln(2) + ln(r)`.
 *   3. Evaluate `ln(r) = 2 * artanh(y) = 2 * sum_{j=0}^\infty y^(2j+1) / (2j+1)`
 *      where `y = (r - 1) / (r + 1) = (n - 2^m) / (n + 2^m)`.
 *   4. Compute `ln(2)` with the same identity `ln(2) = 2 * artanh(1/3)` using
 *      dynamic guard precision scaled to the magnitude of `m`.
 *
 * @param {bigint} n - Positive integer BigInt (`n > 0n`).
 * @returns {bigint} Fixed-point BigInt representing `round(ln(n) * 10^18)`.
 * @throws {TypeError} If `n` is not a BigInt.
 * @throws {RangeError} If `n <= 0n`.
 */
export function lnBigIntSeries(n) {
	if (typeof n !== 'bigint') {
		throw new TypeError(`Expected a BigInt argument, received ${typeof n}`);
	}
	if (n <= 0n) {
		throw new RangeError('Argument must be a positive BigInt (> 0n)');
	}
	if (n === 1n) {
		return 0n;
	}

	// k = floor(log2(n)) >= 1
	const k = n.toString(2).length - 1;

	// Choose m in {k, k + 1} so that n / 2^m is close to 1 (threshold 17/12 ~= sqrt(2))
	const m = 12n * n > (17n << BigInt(k)) ? k + 1 : k;
	const twoPowM = 1n << BigInt(m);

	// Use cached working precision unless m is large enough to need extra guard digits
	let workScale = BASE_WORK_SCALE;
	let guardScale = BASE_GUARD_SCALE;
	let ln2 = LN2_BASE;

	if (m >= 1_000_000) {
		const extraDigits = String(m).length;
		const totalGuard = BASE_GUARD_DIGITS + extraDigits;
		guardScale = 10n ** BigInt(totalGuard);
		workScale = SCALE * guardScale;
		ln2 = computeLn2Scaled(workScale);
	}

	// Evaluate ln(n / 2^m) = 2 * artanh((n - 2^m) / (n + 2^m))
	const num = n - twoPowM;
	let lnR = 0n;

	if (num !== 0n) {
		const den = n + twoPowM;
		const y = (num * workScale) / den;
		const y2 = (y * y) / workScale;

		let term = y;
		let sum = 0n;
		let denom = 1n;

		while (true) {
			const delta = term / denom;
			if (delta === 0n) {
				break;
			}
			sum += delta;
			term = (term * y2) / workScale;
			denom += 2n;
		}

		lnR = 2n * sum;
	}

	const total = BigInt(m) * ln2 + lnR;
	return (total + guardScale / 2n) / guardScale;
}
