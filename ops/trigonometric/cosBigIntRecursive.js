/**
 * Output fixed-point scale factor: 10^18.
 * Results represent round(cos(x) * 10^18) as an exact BigInt.
 */
const OUTPUT_SCALE = 10n ** 18n

/**
 * Internal fractional precision (in decimal digits) used for the reduced angle
 * passed to the divide-and-conquer cosine series.
 * 32 fractional digits provides 14 guard digits beyond the 10^18 output scale.
 */
const WORK_DIGITS = 32
const WORK_SCALE = 10n ** BigInt(WORK_DIGITS)

/**
 * Guard digits added on top of WORK_DIGITS + decimalDigits(|x|) when reducing
 * x modulo 2*pi, ensuring the reduced angle has error < 10^-(WORK_DIGITS + 4).
 */
const REDUCTION_GUARD_DIGITS = 8

/**
 * Number of Taylor series terms (k = 0 .. SERIES_TERMS - 1) evaluated by
 * binary splitting on [0, pi/2].
 * For |theta| <= pi/2 and SERIES_TERMS = 24, the truncation error is bounded
 * by (pi/2)^48 / 48! < 3e-52, far below 10^-32.
 */
const SERIES_TERMS = 24

/**
 * Precomputed value of pi * 10^110 (floor) for fast O(1) range reduction
 * covering all |x| up to ~10^70 without recomputing pi.
 */
const PRECOMPUTED_PI_DIGITS = 110
const PRECOMPUTED_PI =
	314159265358979323846264338327950288419716939937510582097494459230781640628620899862803482534211706798214808651n

/**
 * Computes floor(arctan(1 / m) * scale) using the alternating power series
 * arctan(1 / m) = sum_{k=0..inf} (-1)^k / ((2k + 1) * m^(2k + 1)).
 *
 * @param {bigint} m - Positive integer denominator (m >= 2n).
 * @param {bigint} scale - Fixed-point scaling factor.
 * @returns {bigint} Scaled arctan(1 / m).
 */
function atanReciprocalScaled(m, scale) {
	const mSquared = m * m
	let power = scale / m
	let sum = power
	let k = 1n

	while (power !== 0n) {
		power /= mSquared
		const term = power / (2n * k + 1n)
		if (term === 0n) break
		if ((k & 1n) === 1n) {
			sum -= term
		} else {
			sum += term
		}
		k += 1n
	}

	return sum
}

/**
 * Computes floor(pi * 10^digits) using Machin's formula:
 * pi = 16 * arctan(1/5) - 4 * arctan(1/239).
 * Uses the precomputed constant when digits <= PRECOMPUTED_PI_DIGITS.
 *
 * @param {number} digits - Required number of fractional decimal digits.
 * @returns {bigint} Scaled approximation of pi with at least `digits` exact fractional digits.
 */
function piScaled(digits) {
	if (digits <= PRECOMPUTED_PI_DIGITS) {
		const shift = PRECOMPUTED_PI_DIGITS - digits
		return shift === 0 ? PRECOMPUTED_PI : PRECOMPUTED_PI / 10n ** BigInt(shift)
	}

	const extraDigits = 16
	const internalScale = 10n ** BigInt(digits + extraDigits)
	const piExtra =
		16n * atanReciprocalScaled(5n, internalScale) -
		4n * atanReciprocalScaled(239n, internalScale)
	return piExtra / 10n ** BigInt(extraDigits)
}

/**
 * Rounds the non-negative quotient num / den to the nearest BigInt (half up).
 *
 * @param {bigint} num - Non-negative numerator.
 * @param {bigint} den - Positive denominator.
 * @returns {bigint} Rounded quotient.
 */
function divRoundNonNegative(num, den) {
	return (num * 2n + den) / (2n * den)
}

/**
 * Divide-and-conquer binary splitting over factor indices k in [lo, hi) for
 * the cosine Maclaurin series:
 *   cos(p / q) = 1 + sum_{j=1}^{N-1} prod_{k=1}^{j} (-p^2) / (q^2 * (2k - 1) * (2k))
 *
 * Returns { p, q, t } such that:
 *   P(lo, hi) = prod_{k=lo}^{hi-1} (-num^2)
 *   Q(lo, hi) = prod_{k=lo}^{hi-1} (den^2 * (2k - 1) * (2k))
 *   T(lo, hi) = Q(lo, hi) * sum_{j=lo}^{hi-1} prod_{k=lo}^{j} ((-num^2) / (den^2 * (2k - 1) * (2k)))
 *
 * @param {number} lo - Inclusive lower term index (>= 1).
 * @param {number} hi - Exclusive upper term index (> lo).
 * @param {bigint} negNumSq - Precomputed -(thetaNum^2).
 * @param {bigint} denSq - Precomputed thetaDen^2.
 * @returns {{ p: bigint, q: bigint, t: bigint }} Binary splitting triple.
 */
function binarySplitCos(lo, hi, negNumSq, denSq) {
	if (hi - lo === 1) {
		const k = BigInt(lo)
		const q = denSq * (2n * k - 1n) * (2n * k)
		return { p: negNumSq, q, t: negNumSq }
	}

	const mid = (lo + hi) >> 1
	const left = binarySplitCos(lo, mid, negNumSq, denSq)
	const right = binarySplitCos(mid, hi, negNumSq, denSq)

	return {
		p: left.p * right.p,
		q: left.q * right.q,
		t: left.t * right.q + left.p * right.t,
	}
}

/**
 * Computes the trigonometric cosine cos(x) of an exact BigInt integer x (in radians),
 * returning a fixed-point BigInt scaled by 10^18 (i.e., round(cos(x) * 10^18)).
 *
 * Uses exact arbitrary-precision range reduction modulo 2*pi into the first quadrant
 * [0, pi/2], followed by a recursive divide-and-conquer binary-splitting evaluation
 * of the Maclaurin series for cosine.
 *
 * @param {bigint} x - Exact integer angle in radians.
 * @returns {bigint} Fixed-point BigInt equal to round(cos(x) * 10^18) in [-10^18, 10^18].
 * @throws {TypeError} If `x` is not a BigInt.
 *
 * @example
 * cosBigIntRecursive(0n) // 1000000000000000000n
 * cosBigIntRecursive(1n) // 540302305868139717n
 * cosBigIntRecursive(-1n) // 540302305868139717n
 */
export function cosBigIntRecursive(x) {
	if (typeof x !== 'bigint') {
		throw new TypeError(
			`cosBigIntRecursive expects a BigInt argument, received ${x === null ? 'null' : typeof x}`
		)
	}

	// cos(-x) = cos(x)
	const ax = x < 0n ? -x : x
	if (ax === 0n) {
		return OUTPUT_SCALE
	}

	// Determine required fractional digits of pi for exact range reduction mod 2*pi.
	const xDigits = ax.toString().length
	const reductionDigits = xDigits + WORK_DIGITS + REDUCTION_GUARD_DIGITS

	// Compute pi with one extra digit so 2*pi retains full precision.
	const piPlusOne = piScaled(reductionDigits + 1)
	const pi = piPlusOne / 10n
	const twoPi = (2n * piPlusOne) / 10n
	const halfPi = pi / 2n

	// Exact reduction: rem = (ax * 10^reductionDigits) mod (2*pi * 10^reductionDigits).
	const axScaled = ax * 10n ** BigInt(reductionDigits)
	let rem = axScaled % twoPi

	// Fold [0, 2*pi) -> [0, pi] using cos(2*pi - theta) = cos(theta).
	if (rem > pi) {
		rem = twoPi - rem
	}

	// Fold [0, pi] -> [0, pi/2] using cos(pi - theta) = -cos(theta).
	let negative = false
	if (rem > halfPi) {
		rem = pi - rem
		negative = true
	}

	// Rescale reduced angle into WORK_SCALE (10^32).
	const rescaleDivisor = 10n ** BigInt(reductionDigits - WORK_DIGITS)
	const thetaNum = divRoundNonNegative(rem, rescaleDivisor)

	if (thetaNum === 0n) {
		return negative ? -OUTPUT_SCALE : OUTPUT_SCALE
	}

	// Recursive divide-and-conquer binary splitting for cos(thetaNum / WORK_SCALE).
	const negNumSq = -(thetaNum * thetaNum)
	const denSq = WORK_SCALE * WORK_SCALE
	const { q, t } = binarySplitCos(1, SERIES_TERMS, negNumSq, denSq)

	const numerator = q + t
	if (numerator <= 0n) {
		return 0n
	}

	const magnitude = divRoundNonNegative(numerator * OUTPUT_SCALE, q)
	return negative ? -magnitude : magnitude
}
