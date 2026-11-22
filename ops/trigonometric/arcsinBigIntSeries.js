const SCALE = 10n ** 18n;
const HALF_SCALE = SCALE / 2n;
const GUARD = 10n ** 18n;
const HALF_GUARD = GUARD / 2n;
const WORK_SCALE = SCALE * GUARD;
const WORK_SCALE_SQ = WORK_SCALE * WORK_SCALE;

/**
 * Exact integer square root floor(sqrt(n)) for non-negative BigInt n.
 *
 * @param {bigint} n - Non-negative integer.
 * @returns {bigint} Floor of the square root of n.
 */
function isqrt(n) {
	if (n < 2n) return n;
	let x = 1n << (BigInt(n.toString(2).length + 1) >> 1n);
	while (true) {
		const y = (x + n / x) >> 1n;
		if (y >= x) return x;
		x = y;
	}
}

/**
 * Computes arcsin(u / WORK_SCALE) * WORK_SCALE using the Maclaurin series
 * for 0 <= u <= WORK_SCALE / 2, where convergence is geometric (ratio <= 1/4).
 *
 * arcsin(u) = sum_{k=0..inf} ((2k)! / (4^k (k!)^2 (2k + 1))) * u^(2k + 1)
 *
 * @param {bigint} u - Non-negative input scaled by WORK_SCALE, <= WORK_SCALE / 2.
 * @returns {bigint} Result in radians scaled by WORK_SCALE.
 */
function arcsinSmallWork(u) {
	if (u === 0n) return 0n;
	const u2 = u * u;
	let sum = u;
	let coeffPow = u;
	for (let k = 1n; ; k++) {
		const twoK = 2n * k;
		coeffPow = (coeffPow * (twoK - 1n) * u2) / (twoK * WORK_SCALE_SQ);
		const term = coeffPow / (twoK + 1n);
		if (term === 0n) break;
		sum += term;
	}
	return sum;
}

// Compute pi/2 at WORK_SCALE precision using the exact identity pi/2 = 3 * arcsin(1/2).
const PI_HALF_WORK = 3n * arcsinSmallWork(WORK_SCALE / 2n);

/**
 * Computes arcsin(x) in radians using fixed-point BigInt arithmetic scaled by 10^18.
 *
 * Uses the Maclaurin series for |x| <= 0.5 and the exact range-reduction identity
 *   arcsin(x) = pi/2 - 2 * arcsin(sqrt((1 - x) / 2))
 * for 0.5 < |x| <= 1, with odd symmetry arcsin(-x) = -arcsin(x).
 * Internal calculations use 36 decimal digits of precision (18 guard digits) before
 * rounding to the nearest 10^-18.
 *
 * @param {bigint} x - Fixed-point input scaled by 10^18, in [-10^18, 10^18].
 * @returns {bigint} Fixed-point arcsin(x / 10^18) in radians, scaled by 10^18.
 * @throws {TypeError} If x is not a BigInt.
 * @throws {RangeError} If x is outside [-10^18, 10^18].
 */
export function arcsinBigIntSeries(x) {
	if (typeof x !== 'bigint') {
		throw new TypeError(`Expected x to be a BigInt, got ${typeof x}`);
	}
	if (x < -SCALE || x > SCALE) {
		throw new RangeError(`Input x must be within [-10^18, 10^18], got ${x}`);
	}
	if (x === 0n) return 0n;

	const negative = x < 0n;
	const absX = negative ? -x : x;

	let resultWork;
	if (absX === SCALE) {
		resultWork = PI_HALF_WORK;
	} else if (absX <= HALF_SCALE) {
		resultWork = arcsinSmallWork(absX * GUARD);
	} else {
		// absX in (0.5, 1): u = sqrt((1 - |x|) / 2) is strictly in (0, 0.5)
		const xWork = absX * GUARD;
		const uWork = isqrt(((WORK_SCALE - xWork) * WORK_SCALE) / 2n);
		resultWork = PI_HALF_WORK - 2n * arcsinSmallWork(uWork);
	}

	const rounded = (resultWork + HALF_GUARD) / GUARD;
	return negative ? -rounded : rounded;
}
