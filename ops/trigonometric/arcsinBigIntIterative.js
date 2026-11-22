/**
 * Fixed-point scale factor (10^18), providing 18 decimal digits of precision.
 * @type {bigint}
 */
const SCALE = 10n ** 18n

/**
 * Extra internal guard scale (10^18) used during iterative computation so that
 * rounding down to SCALE produces results accurate to the last unit.
 * @type {bigint}
 */
const GUARD = 10n ** 18n

/**
 * Internal working fixed-point scale (10^36).
 * @type {bigint}
 */
const WORK_SCALE = SCALE * GUARD

/**
 * Squared internal working scale (10^72).
 * @type {bigint}
 */
const WORK_SCALE_SQ = WORK_SCALE * WORK_SCALE

/**
 * Threshold |x| = 0.5 in input fixed-point scale.
 * @type {bigint}
 */
const HALF_SCALE = SCALE / 2n

/**
 * pi / 2 scaled by WORK_SCALE (10^36):
 * 1.57079632679489661923132169163975144209858...
 * @type {bigint}
 */
const HALF_PI_WORK = 1570796326794896619231321691639751442n

/**
 * Computes the exact integer square root floor(sqrt(n)) for a non-negative
 * BigInt using iterative Newton-Raphson (Heron's method).
 *
 * @param {bigint} n - Non-negative BigInt radicand.
 * @returns {bigint} floor(sqrt(n)).
 */
function isqrt(n) {
	if (n < 2n) return n
	const bitLen = n.toString(2).length
	let x = 1n << BigInt((bitLen + 1) >> 1)
	while (true) {
		const next = (x + n / x) >> 1n
		if (next >= x) return x
		x = next
	}
}

/**
 * Evaluates arcsin(y) for 0 <= y <= 0.5 (scaled by WORK_SCALE) using the
 * iterative Maclaurin/Taylor series:
 *
 *   arcsin(y) = sum_{k=0}^{inf} ((2k)! / (4^k * (k!)^2 * (2k + 1))) * y^(2k + 1)
 *
 * Each partial coefficient p_k = ((2k)! / (4^k * (k!)^2)) * y^(2k + 1) satisfies
 * the recurrence p_k = p_{k-1} * ((2k - 1) / (2k)) * y^2, and the k-th series
 * term is p_k / (2k + 1).
 *
 * @param {bigint} yWork - Non-negative value scaled by WORK_SCALE, <= WORK_SCALE / 2n.
 * @returns {bigint} arcsin(y) scaled by WORK_SCALE.
 */
function arcsinTaylorWork(yWork) {
	if (yWork === 0n) return 0n
	const yWorkSq = yWork * yWork
	let sum = yWork
	let p = yWork
	for (let k = 1n; ; k++) {
		const twoK = 2n * k
		p = (p * yWorkSq * (twoK - 1n)) / (WORK_SCALE_SQ * twoK)
		const term = p / (twoK + 1n)
		if (term === 0n) break
		sum += term
	}
	return sum
}

/**
 * Computes the inverse sine (arcsin) of a fixed-point BigInt value scaled by
 * 10^18, returning the angle in radians scaled by 10^18 in the range
 * [-pi/2 * 10^18, pi/2 * 10^18].
 *
 * Algorithm:
 * - Uses odd symmetry: arcsin(-x) = -arcsin(x).
 * - For |x| <= 0.5 (|x| <= 5 * 10^17): directly evaluates the iterative Taylor
 *   series at 36 decimal digits of internal working precision, which converges
 *   geometrically at rate <= 1/4 per iteration (~60 iterations max).
 * - For 0.5 < |x| <= 1: applies the range-reduction identity
 *     arcsin(|x|) = pi/2 - 2 * arcsin(sqrt((1 - |x|) / 2))
 *   Since sqrt((1 - |x|) / 2) < 0.5, the inner arcsin also converges rapidly
 *   even for inputs arbitrarily close to +-1.
 * - Rounds the internal 10^36-scaled result to the nearest integer at 10^18 scale.
 *
 * @param {bigint} x - Fixed-point BigInt input scaled by 10^18, in [-10^18, 10^18].
 * @returns {bigint} arcsin(x / 10^18) * 10^18, rounded to the nearest BigInt.
 * @throws {TypeError} If `x` is not a BigInt.
 * @throws {RangeError} If `x` is outside the closed domain [-10^18, 10^18].
 */
export function arcsinBigIntIterative(x) {
	if (typeof x !== 'bigint') {
		throw new TypeError(`Expected a bigint input, got ${typeof x}`)
	}
	if (x < -SCALE || x > SCALE) {
		throw new RangeError(
			`Input ${x} is out of domain [-${SCALE}, ${SCALE}] ([-1, 1] scaled by 10^18)`
		)
	}
	if (x === 0n) return 0n

	const isNegative = x < 0n
	const absX = isNegative ? -x : x

	let resultWork
	if (absX <= HALF_SCALE) {
		resultWork = arcsinTaylorWork(absX * GUARD)
	} else if (absX === SCALE) {
		resultWork = HALF_PI_WORK
	} else {
		// u = (1 - |x|) / 2 scaled by WORK_SCALE (exact because GUARD is even)
		const uWork = (WORK_SCALE - absX * GUARD) / 2n
		const yWork = isqrt(uWork * WORK_SCALE)
		resultWork = HALF_PI_WORK - 2n * arcsinTaylorWork(yWork)
	}

	const rounded = (resultWork + GUARD / 2n) / GUARD
	return isNegative ? -rounded : rounded
}
